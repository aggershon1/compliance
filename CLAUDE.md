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
  server/                  # optional dependency-free Node crawl service (retrieval only)
  js/
    data.js                # requirement/country/bill data + strictness levels, no logic
    scoring.js              # blended scoring, assessment gating, gap ranking, exposure totals
    reviewer.js             # simulated checklist-submission reviewer
    codeaudit.js            # retired source-audit engine — NOT loaded; kept for a future ingestion path
    storage.js              # localStorage persistence of manual work (+ export/import)
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
- **The app is still a static file, but there is now an optional backend.** `server/` holds a dependency-free Node crawl service that exists for one reason: a browser cannot read another origin's pages (same-origin policy). The app degrades cleanly when it isn't running. Keep the split intact — **the server retrieves, the client judges**. Compliance logic must not migrate into `server/`; a service that only reports what it fetched cannot invent a finding.
- **Never present un-inspected data as observed.** This is load-bearing: v0.9.0 removed the simulated crawler because it fabricated findings about real companies' real websites (statuses came from `seededRandom(domain)`, and hardcoded strings like "No privacy policy found at /privacy" rendered as observations). A user acted on those as if real. **Do not reintroduce generated statuses, scores, or evidence for anything the tool has not actually inspected** — if a value can't be traced to a real inspection or a person's recorded judgment, it doesn't get displayed.

  What remains, and what it is: requirement statuses are recorded by a person (real); the checklist reviewer (`reviewSubmission`) is keyword-matching over the user's own typed description, so it's a drafting aid rather than a verdict; the legislation list is static seed data; enforcement cases are real public actions. The source-audit track (v0.6.0) was genuinely real but its upload path was retired in v0.8.0 — `codeaudit.js` stays in-tree, unloaded, and pre-existing audited entries still render their stored real evidence. README.md's real-vs-mocked table is the source of truth and must be kept accurate.
- **State lives in a single `state` object**, persisted to localStorage by `storage.js` (durable slices only — overrides, attestations, drafts, weights; never transient UI flags like `scanning`), re-rendered via a full `render()` call on every change (no framework, no virtual DOM diffing — `innerHTML` is rebuilt each time). Text inputs avoid triggering full re-renders on every keystroke (see `oninput` handlers that write to `state.drafts` without calling `render()`) to avoid losing focus/cursor position — preserve this pattern when adding new inputs.
- **Regulation data model**: each requirement is an object with `id`, `code` (legal citation), `text`, `sev` (severity: high/med/low), `layman` (plain-language explanation), `articleTitle`/`articleText` (citation hover), `proposals` (Recommendations tab), and — on observable requirements — `guide.partial`/`guide.fail`, which are *criteria for a person to judge against*, phrased as "counts as" and never as claimed observations. Checklist items additionally have `guidance`, `followUp`, `pos`/`neg` (keyword lists for the simulated reviewer). Keep new requirements consistent with this shape.
- **Scoring**: `blendedScore(site, scan, regKey)` combines scanned + checklist results into one number per regulation, respecting per-item overrides via `itemEffectiveStatus()`. If you touch scoring, keep it going through this function rather than adding a parallel calculation path. Severity weights are fixed (`DEFAULT_SEV_WEIGHT`); the user-facing Settings dial controls *strictness* (`STRICTNESS_LEVELS`, how literally wording must match) — a different question, deliberately not conflated with severity.
- **Design system**: CSS custom properties at the top of the `<style>` block (`--ink`, `--paper`, `--verdigris`, `--redline`, `--amber`, etc.) — a "legal ledger / gazette" aesthetic (Fraunces serif + IBM Plex Sans/Mono). Reuse existing tokens rather than introducing new one-off colors.

## Where things are heading (see SPEC.md for full detail)

- Top priority is restoring a **real** analysis path (see `ROADMAP.md`) — there is currently none. After that: replacing the keyword checklist reviewer with a real model call, which needs a small backend to hold an API key.
- Known open items not yet built: see `FEEDBACK.md` for a running list of review notes that haven't been triaged into the spec yet, and the "Roadmap" section of `SPEC.md` for phases 2–4.

## Working style for this repo

- Prefer small, reviewable diffs over full-file rewrites once a change is localized — this file exists partly so you don't need full context dumped into every prompt.
- If a request would change something described in `SPEC.md` (the data model, the scoring approach, the phase plan), flag that explicitly rather than silently diverging from the documented spec.
- This is a portfolio/learning project — favor explaining *why* a change works over just producing it silently.
