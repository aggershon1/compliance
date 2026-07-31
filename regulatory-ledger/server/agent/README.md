# Navigator agent — spike

**Status: a spike on a branch. Not wired into the app, not loaded by the crawl service.** Nothing here affects the shipped product; `node server/index.js` still runs with no dependencies and no install step.

## What it is

An agent that finds a site's privacy documents by *reading the site*, instead of matching link text against the hardcoded `POLICY_HINTS` list in [`../crawler.js`](../crawler.js).

The hint list only finds pages whose wording we anticipated. When the crawl of betterhelp.com came back thin, the fix was a human adding `/terms` to a regex array — and that will be the fix every time, once per site shape. This is the alternative: give a model one tool and a goal, and let it decide which links are worth following.

## Why this is the right first agent for this project

Because the blast radius is small. The agent decides **where to look**. It never decides what anything means — judgment stays in `js/crawl.js`, applied to retrieved text under the user's strictness setting, exactly as it does today. The "server retrieves, client judges" split survives intact, which is what makes it safe to put a model here before anywhere else.

It also has a crisp pass/fail, which most agent projects don't: did it find the pages or not.

## The honesty problem, and how it's handled

This repo's load-bearing rule is that nothing is presented as observed unless it was actually inspected — see CHANGELOG v0.9.0, where a previous version fabricated findings about real companies' real websites and someone acted on them.

An autonomous loop is *exactly* the kind of thing that regresses that. Asked to find privacy pages, a model will cheerfully report "I reviewed the privacy policy and found no opt-out link" when what actually happened was a 404. Prompting against it is not a control. So the tool surface is shaped so fabrication isn't expressible:

1. **No field for a verdict.** The `report_pages` tool takes URLs and why each was chosen. There is nowhere to put a compliance conclusion, so it cannot return one.
2. **A provenance gate.** Every URL the agent reports is checked against the fetch log before it reaches the caller. A URL it never actually retrieved — or retrieved as a 404 — is dropped and listed under `dropped`. A hallucinated page cannot survive, however confidently it was reported. `loop.test.js` asserts this with a deliberately fabricated URL.
3. **Same-origin enforced in code**, not in the prompt. The agent cannot be talked into fetching another host.
4. **`why_selected` is never rendered as evidence.** It explains the agent's routing, nothing more. Only retrieved page text is passed to the requirement rules.

The general principle, which is the part worth carrying to the next agent in this app: *design the tool surface so the bad output has nowhere to go, rather than asking the model not to produce it.*

## Running it

This spike lives only on the `claude/project-summary-docs-c4byep` branch (PR #12). If `git branch --show-current` says `main`, this directory won't exist yet — check the branch out first.

Paths below are from the **repository root**:

```bash
cd regulatory-ledger/server/agent
npm install                      # only this directory has dependencies

node eval.js --heuristic-only    # no API key needed — see the baseline
export ANTHROPIC_API_KEY=sk-...
node eval.js                     # both methods against the local fixture
node eval.js betterhelp.com      # against a real site
node eval.js --verbose           # adds the fetch log and crawler notes

node loop.test.js                # offline: stubs the API, checks the loop and the gate
```

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required for the agent run |
| `AGENT_MODEL` | `claude-opus-5` | The model swap is one variable, on purpose |
| `AGENT_THINKING` | off | Extended thinking. Off by default — see below |
| `FIXTURE_PORT` | `8501` | Fixture site port |

## Measured so far

Against the local fixture, the current heuristic scores **2/4** and opens three irrelevant legal pages (DMCA, accessibility, terms) on the way:

```
── A. POLICY_HINTS heuristic (current crawler) ───────────────
   opened 6 page(s)
       /
     · /legal/terms
     · /legal/dmca
     · /legal/accessibility
     ✓ /privacy
     ✓ /cookies
   recall 2/4  (50%)
   MISSED  /disclosures/us-states  /opt-out
```

It misses the US-state notice because that site files it under "Additional Disclosures for U.S. State Residents" — no hint regex matches, so the page is invisible, and the opt-out page linked from it is invisible too. That is the same shape as the betterhelp.com miss.

**The agent side has not been measured.** The loop, the tool dispatch, the budget, the same-origin refusal, and the provenance gate are all verified offline against a stubbed API (`loop.test.js`, 15 checks). Whether the *model* picks better links than the regex list is an open question until someone runs `node eval.js` with a real key — this sandbox has no key and no outbound access to the API. Don't quote a number for method B until you've produced one.

Note also that the fixture was built to exhibit a known failure mode, so it will always flatter the agent. It exists for fast, offline, zero-cost prompt iteration. **The real measurement is `node eval.js betterhelp.com`.**

## Model choice

Build on `claude-opus-5`, then measure down.

Starting on a cheap model gives you no baseline: when it misses the state notice you won't know whether that's the model or your prompt. Get it working at the top, then set `AGENT_MODEL=claude-haiku-4-5` and re-run. If the score holds you've saved ~5x on a hot path and you know it. If it doesn't, you know that too. That's the whole reason the eval exists.

`AGENT_THINKING` is off by default. Choosing which of fifty footer links is a privacy page isn't reasoning-heavy, and leaving it off keeps the model swap a one-variable change — the thinking parameter has a different shape on Haiku 4.5 (pre-4.6) than on the 4.6+ models, and `navigator.js` branches on that so enabling it doesn't 400 when you switch.

## Why the loop is hand-written

The SDK's tool runner (`client.beta.messages.tool_runner`) would delete most of `navigator.js`. It's written out longhand because seeing the request → `tool_use` → `tool_result` → repeat cycle explicitly is the point of a first agent. The runner is the shortcut you take once the loop isn't a mystery.

## If this proves out

Wiring it into the app is deliberately *not* part of this spike — measuring first was the whole argument. When the numbers justify it, the shape is: `server/index.js` gains `/api/crawl?mode=agent`, lazy-`require`ing `navigator.js` inside the handler so the crawl service keeps starting and working with no `node_modules` present, and falls back to the hint list when the agent is unavailable or unkeyed.

The dependency lives in this directory's own `package.json` for the same reason — `server/` stays dependency-free.
