# Agents

Two model-backed agents, both served by the crawl service, both optional. Everything here degrades to what the app did before if the SDK isn't installed, no API key is set, or the API is unreachable — and the app says which of those happened rather than quietly producing a worse answer.

| | What it replaces | Where it runs |
|---|---|---|
| **Navigator** (`navigator.js`) | The hardcoded `POLICY_HINTS` regex list in [`../crawler.js`](../crawler.js) | `GET /api/crawl?mode=agent` |
| **Attestation interviewer** (`attest.js`) | The keyword heuristic in [`../../js/reviewer.js`](../../js/reviewer.js) | `POST /api/attest` |

## Setup

```bash
cd regulatory-ledger/server/agent
npm install                          # only this directory has dependencies
export ANTHROPIC_API_KEY=sk-ant-...
cd .. && node index.js               # service now reports agents: enabled
```

The service prints which capabilities are on at startup, and `/api/health` reports the same thing so the app can offer the right actions and explain what's switched off.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required. Without it both agents are off and the app falls back. |
| `AGENT_MODEL` | `claude-opus-5` | Used by both agents |
| `AGENT_THINKING` | off | Extended thinking. See "Model choice" below. |

---

## The navigator

`POLICY_HINTS` only finds pages whose link text or path uses vocabulary someone thought of in advance. A site filing its CCPA supplement under "Additional Disclosures for U.S. State Residents" is invisible to it, and the fix is always the same — a human adds another regex, once per site shape, forever.

The navigator is given one tool, `fetch_page`, and a goal. It reads the start page, follows what looks promising, and reports the documents it found. `crawlWithAgent()` then returns **exactly the shape `crawl()` returns**, so the app's rule engine consumes an agent-discovered crawl and a hint-list crawl identically. Only the `discovery` block differs, and that exists so the UI can say which method produced the pages — provenance for every finding derived from them.

The start page is always included even when the agent doesn't report it, because several requirements are evidenced by homepage *links* (the "Do Not Sell or Share" link most obviously) rather than by policy prose.

## The attestation interviewer

The keyword reviewer counted `pos`/`neg` words in whatever the user typed and called the result a verdict. It covered the half of GDPR/CCPA that a crawl can never see — everything behind a login — which made it the weakest part of the product by some distance.

The interviewer reads the requirement and the user's description and decides one of two things: ask a follow-up, or record an attestation. It asks what a regulator would. "Users can delete their account" invites "does that delete the therapist's session notes, or only the profile?", and that second question is where attestations are actually won or lost.

It is judging one thing only: **does the implementation the user describes, taken at face value, satisfy the citation?** It cannot see the product. A truthful description of a non-compliant process should Fail; a description too vague to tell should prompt a follow-up rather than a guess.

Its output is shown in four registers, deliberately kept apart in the UI:

- **rationale** — the judgment against the citation
- **basis** — the user's own words that support it, verbatim
- **gaps** — what the requirement demands that the account doesn't establish
- **the interview** — every follow-up asked and answered

The follow-up budget is 3, and it is enforced by *withdrawing the `ask_followup` tool* past that point rather than by asking the model to stop. Termination doesn't depend on the model's cooperation.

---

## The honesty constraint

This repo's load-bearing rule is that nothing is presented as observed unless it was actually inspected — see CHANGELOG v0.9.0, where a previous version fabricated findings about real companies' real websites and someone acted on them.

Autonomous loops are exactly the kind of thing that regresses that. Asked to find privacy pages, a model will cheerfully report "I reviewed the privacy policy and found no opt-out link" when what happened was a 404. Asked to review an attestation, it will write a fluent paragraph asserting product facts the user never stated. **Prompting against either is not a control.** So both agents are built the same way:

| | Navigator | Interviewer |
|---|---|---|
| No field for the bad output | `report_pages` has nowhere to put a compliance verdict | `basis` must be quotes, not conclusions |
| Claims checked against a log | Reported URLs must appear in the fetch log as successful retrievals | Every quote must appear verbatim in what the user wrote |
| What happens to a failed claim | Dropped, recorded in `dropped`, surfaced in the crawl notes | Dropped; if none survive, the attestation is marked **ungrounded** and its confidence forced to Low |
| Enforced in code, not prompt | Same-origin, page budget, turn ceiling | Follow-up budget via tool withdrawal |

The generalisable principle: **design the tool surface so the bad output has nowhere to go, rather than asking the model not to produce it.**

Neither agent judges compliance. The navigator decides *where to look*; the rule engine in `js/crawl.js` decides what the retrieved text means, under the user's strictness setting, exactly as before. The interviewer judges only a person's account of their own product, never the product.

---

## Testing

```bash
npm test              # all three suites, no API key, no network

node loop.test.js     # navigator: loop, budget, same-origin, provenance gate, crawl adapter
node attest.test.js   # interviewer: quote gate, follow-up budget, ungrounded handling
node service.test.js  # HTTP surface + every degradation path

cd ../..
node ui.test.js       # the browser: review round trip, rendering, escaping
node e2e.test.js      # the whole thing: real service + real page + real Crawl click
```

`e2e.test.js` earns its place. Every other suite passed while the analyst's
findings rendered wrongly in the browser — each tested a piece, none tested
the seam where they meet. It reproduced that bug on its first run.

The model is a scripted stub in all of them, so they test our code rather than the model's judgment. What the model actually decides is what `eval.js` measures, and that needs a key.

## Measuring

```bash
node eval.js --heuristic-only    # baseline, no key needed
node eval.js                     # both methods against the local fixture
node eval.js betterhelp.com      # against a real site
node eval.js --verbose           # adds the fetch log and crawler notes
```

Against the local fixture the hint list scores **2/4** and opens three irrelevant legal pages (DMCA, accessibility, terms) on the way:

```
── A. POLICY_HINTS heuristic (current crawler) ───────────────
   recall 2/4  (50%)
   MISSED  /disclosures/us-states  /opt-out
   noise   /legal/terms  /legal/dmca  /legal/accessibility
```

It misses the state notice because that site files it under "Additional Disclosures for U.S. State Residents" — no hint regex matches — and so the opt-out page linked from it disappears too.

Note the fixture was built to exhibit that failure mode, so it will always flatter the agent. The measurement that counts is a real site.

### The real-site result: parity

On **betterhelp.com**, after the v1.1.1 dedupe fix, both methods return the same four pages. The agent found nothing the regex list missed.

That is the honest state of this feature: **on the one real site measured, agent discovery is not worth its cost.** betterhelp.com does not have the problem the agent solves — its privacy content isn't filed under vocabulary the hint list failed to anticipate. The fixture gap is real but constructed, and one site is one site; a site that *does* bury its state notice under an unexpected name would still defeat the hint list, which is why the agent stays available rather than being removed.

The practical read: leave discovery on **Link patterns** unless a crawl comes back visibly thin, then try the agent on that site and compare. `eval.js` is how you check, per site, for the price of one run.

## Model choice

Build on `claude-opus-5`, then measure down. Starting cheap gives you no baseline: when it misses the state notice you can't tell whether that's the model or your prompt. Get it working at the top, then `AGENT_MODEL=claude-haiku-4-5 node eval.js` and see whether the score holds.

Given the parity result above, the cheaper question comes first: measure whether the agent earns its place on *your* site at all before tuning which model runs it.

`AGENT_THINKING` is off by default. Neither agent is reasoning-heavy, and leaving it off keeps a model swap a one-variable change — the thinking parameter has a different shape on Haiku 4.5 (pre-4.6) than on 4.6+ models, and `client.js` branches on that so enabling it doesn't 400 when you switch.

## Why the navigator's loop is hand-written

The SDK's tool runner (`client.beta.messages.tool_runner`) would delete most of `navigator.js`. It's longhand because seeing the request → `tool_use` → `tool_result` → repeat cycle explicitly is the point of a first agent. `attest.js` doesn't have that loop at all — its loop runs across *user* turns, because the thing it needs to query is a person.
