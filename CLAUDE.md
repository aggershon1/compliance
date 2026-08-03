# CLAUDE.md

Context for Claude Code when working in this repo. Read `regulatory-ledger/SPEC.md` and `regulatory-ledger/CHANGELOG.md` for full detail — this file is a quick orientation, not a replacement for them.

## What this project is

**The Regulatory Ledger** — a prototype web app for recording and grading a product's privacy/compliance posture against selected regulations (currently GDPR and CCPA/CPRA), split into two tracks that roll into one blended score per regulation:

- **Publicly observable** — requirements verifiable on the live site, assessed manually by the user (there is no crawler; see below).
- **Self-attested** — a checklist for authenticated-experience requirements (self-serve access/delete/export/correct) that a crawler can't see, reviewed via description + optional screenshot.

The core product insight driving the architecture: most of what GDPR/CCPA actually require lives behind login, which an external scan can never observe — hence the two tracks instead of one.

## Repo layout

```
regulatory-ledger/
  regulatory-ledger.html   # HTML shell + CSS; loads js/*.js via plain <script> tags, no build step
  server/                  # optional Node crawl service — core is dependency-free
    index.js               # HTTP surface: /api/health, /api/crawl, /api/attest
    crawler.js             # retrieval + the POLICY_HINTS link-pattern discovery
    legislation.js         # watches official pages, diffs them — no parsing, no interpretation
    agent/                 # the two model-backed agents — own package.json, lazily required
      client.js            #   shared Anthropic client, availability check, thinking config
      navigator.js         #   finds privacy pages by reading the site (replaces POLICY_HINTS)
      attest.js            #   interviews the user about behind-login flows
      analyst.js           #   reads retrieved pages and judges them against the citations
      proposal.js          #   reviews a spec against the citations before it is built
      recommend.js         #   contextual advice, written against what was actually found
      evidence.js          #   splits attachments into inspected vs. reference-only
      eval.js              #   scores agent discovery against the link-pattern baseline
      *.test.js            #   offline suites — scripted stub, no key, no network
  js/
    data.js                # requirement/country/bill data + strictness levels, no logic
    scoring.js              # blended scoring, assessment gating, gap ranking, exposure totals
    reviewer.js             # simulated checklist-submission reviewer
    codeaudit.js            # retired source-audit engine — NOT loaded; kept for a future ingestion path
    storage.js              # localStorage persistence of manual work (+ export/import)
    attachments.js          # evidence files: what can be read vs. only filed (mirrors server/agent/evidence.js)
    crawl.js                # crawl-service client + rule matching over retrieved text
    render.js               # all render*()/build*HTML() functions
    app.js                  # state object + event handlers + entry lifecycle + bootstrap render()
  SPEC.md                  # full product spec, including the dual-track model and phased roadmap
  README.md                # what's real vs. simulated in this prototype
  CHANGELOG.md             # version history — check this before assuming what's already been built
  FEEDBACK.md              # running log of un-triaged review feedback, not yet implemented
```

## Conventions in `regulatory-ledger.html` / `js/*.js`

- **No build step.** Open directly in a browser, or serve with `python3 -m http.server`. The five `js/*.js` files are loaded as plain classic `<script src>` tags (not ES modules) specifically so `file://` still works with no bundler — keep new code in that same global-scope style rather than introducing `import`/`export`. Don't introduce a bundler/framework without discussing it first — that's a deliberate simplicity choice, not an oversight.
- **The app is still a static file, but there is now an optional backend.** `server/` holds a Node crawl service that exists for two reasons: a browser cannot read another origin's pages (same-origin policy), and a static file cannot hold an API key. The app degrades cleanly when it isn't running, when the agents aren't installed, and when the API is unreachable — and it always says *which* reviewer or discovery method actually ran.
  - **The core stays dependency-free.** `node server/index.js` must keep working with no `npm install`. The SDK lives in `server/agent/package.json` and is `require`d lazily inside handlers. Don't hoist it.
  - **Judge documents, never companies.** This replaces the older "the server retrieves, the client judges" rule (v1.3.0). That rule existed for fabrication prevention, and the key can only live server-side, so the guarantee moved from the architecture to the gate: `agent/analyst.js` reads retrieved pages and assesses them, but every verdict about the text must quote the text, quotes are checked verbatim against the page they cite, and a verdict left without one is downgraded to undetermined. Absence is always scoped to the pages actually searched and must render that way — "not present in these 4 pages", never "the company doesn't do this". "The policy states X" is sayable; "the company does X" has no field to be said in. Retrieval and phrase matching in `crawler.js`/`js/crawl.js` are unchanged and still work with no key. The navigator decides *which pages to open*, never what they mean; `agent/attest.js` judges only the user's own written account of a behind-login flow.
- **Never present un-inspected data as observed.** This is load-bearing: v0.9.0 removed the simulated crawler because it fabricated findings about real companies' real websites (statuses came from `seededRandom(domain)`, and hardcoded strings like "No privacy policy found at /privacy" rendered as observations). A user acted on those as if real. **Do not reintroduce generated statuses, scores, or evidence for anything the tool has not actually inspected** — if a value can't be traced to a real inspection or a person's recorded judgment, it doesn't get displayed.

  **This applies double to the agents (v1.1.0).** An autonomous loop drifts into confident narration — reporting "I reviewed the privacy policy and found no opt-out link" when what happened was a 404. Prompting against that is not a control. The pattern both agents use, and the one any new agent must follow: **give the model no field in which to express a conclusion it isn't entitled to, and gate every claim against a log of what actually happened.** Reported URLs are checked against the fetch log; attestation quotes are checked verbatim against what the user wrote; observations about an attached file are checked against the manifest of files actually sent; anything that fails is dropped and recorded, never silently kept. Budgets are enforced in code (withdrawing a tool), not by asking the model to stop.

  **Evidence attachments (v1.2.0) follow the same rule.** Images, PDFs and text files are genuinely sent as content blocks and read; video, Figma, Google Docs and Office files are recorded but never described, and the tier is stated *before* upload. Don't move a file type into the readable tier without a real content block behind it — accepting a file and reporting a review of it that nobody performed is the v0.9.0 failure in a new place.

  What remains, and what it is: requirement statuses are recorded by a person (real); the checklist reviewer is a real model call when the service has a key and the keyword heuristic (`reviewSubmission`) otherwise — a drafting aid rather than a verdict — and every attestation records which one ran; the legislation list is static seed data; enforcement cases are real public actions. The source-audit track (v0.6.0) was genuinely real but its upload path was retired in v0.8.0 — `codeaudit.js` stays in-tree, unloaded, and pre-existing audited entries still render their stored real evidence. README.md's real-vs-mocked table is the source of truth and must be kept accurate.
- **The compliance page shows one regulation at a time** (v1.2.0), selected via the grade stamps, with open items grouped above a collapsed "Passing" drawer and an optional focus mode for working through them one by one. Focus mode renders items through the same `renderRow()` as the list — don't fork a second rendering path for it.
- **State lives in a single `state` object**, persisted to localStorage by `storage.js` (durable slices only — overrides, attestations, drafts, weights; never transient UI flags like `scanning`), re-rendered via a full `render()` call on every change (no framework, no virtual DOM diffing — `innerHTML` is rebuilt each time). Text inputs avoid triggering full re-renders on every keystroke (see `oninput` handlers that write to `state.drafts` without calling `render()`) to avoid losing focus/cursor position — preserve this pattern when adding new inputs.
- **Regulation data model**: each requirement is an object with `id`, `code` (legal citation), `text`, `sev` (severity: high/med/low), `layman` (plain-language explanation), `articleTitle`/`articleText` (citation hover), `proposals` (Recommendations tab), and — on observable requirements — `guide.partial`/`guide.fail`, which are *criteria for a person to judge against*, phrased as "counts as" and never as claimed observations. Checklist items additionally have `guidance`, `followUp`, `pos`/`neg` (keyword lists for the simulated reviewer). Keep new requirements consistent with this shape.
- **Scoring**: `blendedScore(site, scan, regKey)` combines scanned + checklist results into one number per regulation, respecting per-item overrides via `itemEffectiveStatus()`. If you touch scoring, keep it going through this function rather than adding a parallel calculation path. Severity weights are fixed (`DEFAULT_SEV_WEIGHT`); the user-facing Settings dial controls *strictness* (`STRICTNESS_LEVELS`, how literally wording must match) — a different question, deliberately not conflated with severity.
- **Design system**: CSS custom properties at the top of the `<style>` block (`--ink`, `--paper`, `--verdigris`, `--redline`, `--amber`, etc.) — a "legal ledger / gazette" aesthetic (Fraunces serif + IBM Plex Sans/Mono). Reuse existing tokens rather than introducing new one-off colors.

## Where things are heading (see SPEC.md for full detail)

- Both of those are now done (v1.0.0 crawling, v1.1.0 agents). The open work is **measurement**: every agent mechanism is tested offline, but whether either model outperforms the heuristic it replaced is unverified. `server/agent/eval.js` scores navigation against the link-pattern baseline and needs an API key to run. Don't quote a number for the agent side that nobody has produced.
- Known open items not yet built: see `FEEDBACK.md` for a running list of review notes that haven't been triaged into the spec yet, and the "Roadmap" section of `SPEC.md` for phases 2–4.

## Working style for this repo

- Prefer small, reviewable diffs over full-file rewrites once a change is localized — this file exists partly so you don't need full context dumped into every prompt.
- If a request would change something described in `SPEC.md` (the data model, the scoring approach, the phase plan), flag that explicitly rather than silently diverging from the documented spec.
- This is a portfolio/learning project — favor explaining *why* a change works over just producing it silently.
