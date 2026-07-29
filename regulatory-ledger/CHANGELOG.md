# Changelog

All notable changes to this prototype are logged here.

## [0.3.0] — Review feedback batch (regional variants, overrides, plain language, jurisdiction filter, UX/export, recommendations)

### Added
- **Regional site variants**: a site can be scanned as US / EU / Switzerland / Global, seeding materially different simulated results for the same domain (most visibly on the GDPR cookie-consent requirement, to model cases like BetterHelp's differing US/EU cookie banners). Adding the same domain under a different variant creates a separate docket entry so they can sit side by side.
- **Manual override with required explanation** on every result, scanned or self-attested. Stored per site/requirement (not destructive to the original result), factored into the blended score, and tracked across scans in-session — a requirement overridden more than once surfaces a "may need recalibrating" flag.
- **Hover tooltips on every citation** (e.g. "Art. 6") showing the article's title and a plain summary of its operative text.
- **Plain-language explanation** on every requirement (scanned and self-attested), shown directly under the requirement text — distinct from the hover legal text.
- **Country/jurisdiction filter**: pick countries (US, EU member states, Switzerland) alongside the direct GDPR/CCPA toggles; selecting a country auto-includes whichever regulation applies. Both entry points combine.
- **Export PDF report** — generates a clean, stakeholder-shareable summary (grade, top gaps, risk highlights, trust score) via the browser print dialog.
- **Recommendations tab** — every open gap (scanned or self-attested) with its plain-language explanation and 2–3 concrete, spec-ready fix proposals.

### Changed
- **Grade stamp caption** now explains *why* the score is what it is (top 1–2 contributing gaps by severity), instead of describing the scoring mechanism.
- **Visual/UX pass**: larger base type size and line height, hover states and subtle depth on interactive rows/cards, tightened spacing.
- Internal refactor: scanned results are now stored per-regulation (`scan.scanned.GDPR` / `scan.scanned.CCPA`) and a shared `itemEffectiveStatus()` helper (which respects overrides) is used consistently across the Compliance, Recommendations, and Risk & Precedent tabs and the PDF export, instead of each tab recomputing status independently.

### Notes
- Override history and the "overridden N times" learning flag are session-only in this prototype (reset on reload) — a real build would persist this server-side and aggregate across the org, per `SPEC.md` Phase 1.
- All new logic (blended scoring with overrides, country→regulation resolution, the EU/US consent-bias simulation, and the checklist review's follow-up flow) was verified with a standalone test pass against the core functions before shipping.

## [0.2.0] — Dual-track compliance model

### Added
- **Self-attested checklist track** for authenticated/logged-in requirements that a crawler can't see: self-serve access, erasure, portability, and consent preferences (GDPR); self-serve know/access, delete, correct, and a functioning sensitive-PI limit-use toggle (CCPA).
- Each checklist item: a "we have this" checkbox, a description field, and an optional screenshot upload.
- Simulated review of each submission, producing a status (Pass/Partial/Fail), a confidence level, and a rationale.
- **Low-confidence follow-up flow**: when a description is too thin to judge confidently and no screenshot was attached, the app asks one targeted follow-up question and shows a short "what this typically looks like" sketch, then finalizes using everything provided.
- **Staleness tracking**: self-attested items older than 90 days are flagged "Needs re-attestation" in the UI (still counted at their last-known status). Added a demo-only "simulate 100 days passing" control on the site page to make this visible without waiting.
- Every result row (scanned or self-attested) now carries a small source tag so it's clear where it came from.
- `SPEC.md` — full spec, including the dual-track model and the phased roadmap (Phase 0–4).

### Changed
- **Scoring is now one blended score per regulation**, not separate scanned/attested numbers. Unattested checklist items count as zero credit, same as a Fail, until resolved.
- Re-scoped which requirements belong to the automated scan: removed items that realistically require an authenticated account to verify (e.g. GDPR Art. 15/17/20, CCPA right to know/delete/correct) from the scanned set and moved them into the checklist. The scanned set now only contains what's genuinely observable on logged-out pages.
- Docket sidebar chips and site header now reflect the blended score.

### Notes
- The checklist review in this version is a **rule-based simulation** (keyword matching + a couple of confidence signals), not a live model call — consistent with the rest of this prototype, which uses simulated/deterministic data throughout. `SPEC.md` Phase 1 calls out replacing this with a real LLM-based review that actually reads the screenshot and judges the description.

## [0.1.0] — Initial prototype

- Simulated full-site scan against GDPR and CCPA/CPRA (all requirements treated as scannable at this stage).
- Regulation picker, per-requirement Pass/Partial/Fail/N/A results with remediation notes.
- Upcoming legislation tab (filterable sample dataset).
- Risk & precedent tab with composite/illustrative enforcement examples.
- Separate Privacy Trust score across five categories.
- Docket sidebar of saved sites with manual re-scan.
