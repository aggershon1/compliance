# Changelog

All notable changes to this prototype are logged here.

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
