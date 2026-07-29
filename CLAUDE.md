# CLAUDE.md

Context for Claude Code when working in this repo. Read `regulatory-ledger/SPEC.md` and `regulatory-ledger/CHANGELOG.md` for full detail — this file is a quick orientation, not a replacement for them.

## What this project is

**The Regulatory Ledger** — a prototype web app that scans a website and rates its privacy/compliance posture against selected regulations (currently GDPR and CCPA/CPRA), split into two tracks that roll into one blended score per regulation:

- **Scanned** — simulated crawl of the logged-out surface (privacy policy, cookie banner, public disclosures).
- **Self-attested** — a checklist for authenticated-experience requirements (self-serve access/delete/export/correct) that a crawler can't see, reviewed via description + optional screenshot.

The core product insight driving the architecture: most of what GDPR/CCPA actually require lives behind login, which an external scan can never observe — hence the two tracks instead of one.

## Repo layout

```
regulatory-ledger/
  regulatory-ledger.html   # the entire app — single file, vanilla JS, no build step, no framework
  SPEC.md                  # full product spec, including the dual-track model and phased roadmap
  README.md                # what's real vs. simulated in this prototype
  CHANGELOG.md             # version history — check this before assuming what's already been built
  FEEDBACK.md              # running log of un-triaged review feedback, not yet implemented
```

## Conventions in `regulatory-ledger.html`

- **No build step.** Open directly in a browser, or serve with `python3 -m http.server`. Don't introduce a bundler/framework without discussing it first — that's a deliberate simplicity choice, not an oversight.
- **All data is currently simulated/mocked.** Scan results come from a seeded pseudo-random function (`seededRandom`/`statusFor`) keyed off domain + regional variant, not a real crawler. The checklist reviewer (`reviewSubmission`) is keyword-matching, not a live model call. Don't "fix" this by quietly making it look more real — if replacing mock logic with something real, say so explicitly and update `README.md` / `CHANGELOG.md` accordingly.
- **State is in-memory only**, held in a single `state` object, re-rendered via a full `render()` call on every change (no framework, no virtual DOM diffing — `innerHTML` is rebuilt each time). Text inputs avoid triggering full re-renders on every keystroke (see `oninput` handlers that write to `state.drafts` without calling `render()`) to avoid losing focus/cursor position — preserve this pattern when adding new inputs.
- **Regulation data model**: each requirement (scanned or checklist) is an object with `id`, `code` (legal citation), `text`, `sev` (severity: high/med/low), `layman` (plain-language explanation), `articleTitle`/`articleText` (shown on citation hover), and `proposals` (fix suggestions for the Recommendations tab). Checklist items additionally have `guidance`, `followUp`, `pos`/`neg` (keyword lists for the simulated reviewer). Keep new requirements consistent with this shape.
- **Scoring**: `blendedScore(site, scan, regKey)` combines scanned + checklist results into one number per regulation, respecting per-item overrides via `itemEffectiveStatus()`. If you touch scoring, keep it going through this function rather than adding a parallel calculation path.
- **Design system**: CSS custom properties at the top of the `<style>` block (`--ink`, `--paper`, `--verdigris`, `--redline`, `--amber`, etc.) — a "legal ledger / gazette" aesthetic (Fraunces serif + IBM Plex Sans/Mono). Reuse existing tokens rather than introducing new one-off colors.

## Where things are heading (see SPEC.md for full detail)

- **Phase 1** priority: replace the simulated checklist reviewer with a real LLM call (needs a small backend to hold an API key — the static HTML file can't safely call the Anthropic API directly), and replace the simulated scan with a real crawler.
- Known open items not yet built: see `FEEDBACK.md` for a running list of review notes that haven't been triaged into the spec yet, and the "Roadmap" section of `SPEC.md` for phases 2–4.

## Working style for this repo

- Prefer small, reviewable diffs over full-file rewrites once a change is localized — this file exists partly so you don't need full context dumped into every prompt.
- If a request would change something described in `SPEC.md` (the data model, the scoring approach, the phase plan), flag that explicitly rather than silently diverging from the documented spec.
- This is a portfolio/learning project — favor explaining *why* a change works over just producing it silently.
