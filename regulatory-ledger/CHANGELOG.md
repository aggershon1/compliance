# Changelog

All notable changes to this prototype are logged here.

## [0.6.0] — Source audit: upload a codebase for real analysis

### Added
- **Track 3 — Source audit.** The New Scan form now offers two entry paths: "Scan a website" (existing, simulated) or "Audit a codebase" — pick a repo folder you're authorized to audit and it's analyzed **for real, entirely in the browser** (files are never uploaded anywhere; vendor/build directories and binaries are skipped automatically). New `js/codeaudit.js` engine + `CODE_AUDIT_RULES` in `data.js`.
- Every requirement gets a verdict grounded in actual matched source: status, confidence, rationale, and an "evidence" hover citing real file, line, and snippet — the real counterpart to the simulated "why?" hover on URL scans.
- **Checklist items with solid evidence are auto-attested from source** (labeled "Auto-attested from source audit", overridable, subject to normal 90-day staleness). Items with no evidence stay unattested with an explanatory hint, so the final-grade gate from 0.5.0 still applies unchanged.
- Scanned-track requirements that can't live in code (breach runbooks, records of processing, policy copy shipped from another repo) come back **Pending** with an explanation rather than Fail — absence of evidence in one repo isn't evidence of absence. Requirements an implementing repo *should* contain (e.g. consent-management code) do Fail on absence, with a note pointing at the override if the implementation lives elsewhere.
- Source-audited docket entries show a "source audit" tag, file counts in the header, no Re-scan button (files aren't retained — re-upload to re-audit), and an explanatory note instead of a Privacy Trust score (trust measures the public-facing site).

### Notes — first de-mocked capability, flagged per this repo's convention
- **This is the first real (non-simulated) analysis in the prototype.** `README.md`'s real-vs-mocked table and `SPEC.md` (new "Track 3" section) updated accordingly. It is pattern-based evidence of implementation — not proof of end-to-end correctness, and not a legal determination; confidence levels and rationales say so.
- Evidence snippets from uploaded files are HTML-escaped before rendering (`escapeHtml` in render.js) — real source code is untrusted display content, unlike this prototype's own static strings.

## [0.5.1] — Manual competitor entry, auto-collapse passing items

### Added
- **"vs. Competitors" tab now takes real competitor names.** An "Add a real competitor" box (same pattern as manual country entry) lets you type in who this site actually competes with; entries show as removable chips and replace the generic "Competitor A/B/C" placeholders. "Sector median" always stays as a fixed benchmark line regardless.
- **Passing items auto-collapse.** On Compliance Results, any scanned or self-attested item currently at "Pass" starts collapsed to just its status line, so what's actually visible by default is what still needs attention — Fail/Partial/Pending items, and anything not yet attested. A manual toggle always overrides the default in either direction; Collapse all/Expand all still works as a blanket override too.

### Notes
- Closes the open item from 0.5.0: naming real competitors needed the actual names, which are genuinely site-specific and couldn't be inferred — now the user supplies them directly instead of via chat.
- Scores next to a real name are still simulated (`competitorScores()` — no real crawl of competitor sites exists), and every non-"this site" row now carries an explicit "(simulated)" tag next to its number, not just an intro-paragraph disclaimer, so it reads clearly even if someone skips the intro text.
- Auto-collapse is tri-state (`isCollapsed()` in render.js): an explicit prior click always wins over the status-based default, so nothing you manually expand snaps back shut just because it's Pass.

## [0.5.0] — Settings dropdown, scanned/self-attested split with grade gating, Risk & Precedent merged in, real enforcement cases

### Added
- **Settings moved to a top-right dropdown** in the masthead (⚙ Settings), out of the tab row. Still just the severity-weighting sliders for now.
- **Compliance Results now visually splits each regulation into a Scanned section and a Self-attested section**, with a section label on each.
- **Final grade is withheld until every self-attested item is resolved** (finalized through review, or manually overridden) — the grade stamp shows "—" with a provisional score and an explanatory caption instead of a letter grade, and the docket sidebar chip shows "PENDING" the same way, until every self-attested item for that regulation is resolved.
- **Risk & Precedent is no longer a separate tab** — it's merged into Compliance Results: every failing/partial item (scanned or self-attested) shows its own comparable enforcement action inline, and a "Potential exposure" range (aggregated across all current gaps, grouped by currency) sits near the top, by the grade stamps.
- Overriding a scanned item continues to auto-recompute the blended score immediately (this already worked via the existing render-on-every-change architecture; verified, not new plumbing).

### Changed
- **Enforcement cases (`FINES`) now cite real, publicly reported regulatory actions** — named company, regulator, year, and amount (e.g. Meta/Irish DPC/€1.2B for EU-US transfers, Sephora/California AG/$1.2M for Do Not Sell violations) — replacing the earlier anonymized "composite case" placeholders. Every mention is explicitly labeled as a real case cited for comparison to the *type* of violation, not a claim about the site being reviewed. `README.md` updated accordingly per this repo's "say so explicitly" convention for de-mocking data.
- Reduced homepage spacing further — `.empty-state` margin-top is now 0 (relies solely on `.main`'s existing top padding).

### Notes — still open
- **The "vs. Competitors" tab still uses generic placeholder labels** ("Competitor A/B/C"). Naming real competitors requires knowing which real companies apply to whatever site is being scanned — that's genuinely site-specific and was pending user input as of this entry.
- Gating only affects the *display* of the final grade (stamp + docket chip); `blendedScore()` itself is unchanged and still returns a number for every other consumer (Recommendations sorting, Print report, exposure calculations, etc.) — those intentionally keep working off the underlying number so nothing downstream breaks while a grade is "pending."

## [0.4.0] — Country model rework, evidence hover, competitor benchmark, settings, fuzzy review matching

### Added
- **Countries replace the old Global/US/EU/CH variant picker.** The New Scan form now asks which countries the scan covers (multi-select from the existing country list, plus free-text entry for a country not on it), instead of a single regional-variant chip. The old "Global / default" catch-all option is gone entirely.
- **Per-country + overall grading**: the Compliance Results tab shows a "Score by country" breakdown (each selected country against whichever regulation it maps to) plus one blended "Overall" figure, in addition to the existing per-regulation stamps. Countries sharing the same regulation intentionally show the same number — see the Notes below on why this isn't faked as independent variance.
- **Manually-entered countries also drive the Upcoming Legislation tab**: a new "show only legislation relevant to this site's countries" toggle (on by default) filters the sample `BILLS` dataset using a best-effort country→region lookup, including simple keyword matching for manually-typed country names.
- **Evidence hover on failed/partial scanned items**: a "why?" tooltip next to the existing fail/partial explanation shows an illustrative quoted snippet and a page location, using the same hover-tooltip pattern as citation hovers. Clearly labeled as simulated — this prototype has no real crawler yet to cite the actual page.
- **Collapsible requirement rows**: every scanned and self-attested row can be individually collapsed to just its status line, plus a "Collapse all / Expand all" pair per regulation block. Starts fully expanded.
- **"vs. Competitors" tab**: a simple bar-chart comparison of the open site's blended score per regulation against a small set of illustrative, clearly-labeled placeholder competitors (not real companies).
- **Settings tab**: sliders to adjust the high/med/low severity weights that `blendedScore()`/`gapItems()` use, with a reset-to-defaults control. Applies immediately across every open site.
- **"Wiggle room" matching in the checklist reviewer**: `countMatches()` now also accepts a close paraphrase of a pos/neg keyword phrase (≥60% of its meaningful words present, prefix-matched) instead of requiring an exact substring, so a differently-worded but equivalent description isn't marked down for phrasing alone.

### Changed
- `site.variant` is gone; sites now carry `selectedCountries` (known country codes) and `manualCountries` (free-text entries), and a docket/header/print-report label is derived from those instead of a single variant word.
- The internal EU/US/CH-style simulated consent-behavior bucket (`simPostureFor`) is now derived from a site's selected countries rather than being its own user-facing choice — this is what let the Global/Other picker go away without losing the existing US-vs-EU cookie-banner demo.
- `SEV_WEIGHT` (data.js) is now `DEFAULT_SEV_WEIGHT`, seeding the new adjustable `state.sevWeights` that scoring reads from.

### Notes — flagged deviations from `SPEC.md`
- **Per-country grading intentionally doesn't fabricate per-country variance.** SPEC.md's data model computes one status per regulation, not per country; two countries mapped to the same regulation (e.g. two EU states) show the identical GDPR number here on purpose, since it *is* the same determination. If independent-looking per-country numbers are wanted instead, that needs a real decision on whether/how a single regulation's compliance could legitimately differ by member state — flagging rather than inventing that silently.
- **The "vs. Competitors" tab anticipates SPEC.md's Phase 4 item** ("Anonymized, opt-in benchmarking against similar companies in the same sector"), built now instead of later, using generic placeholder labels rather than real companies since no real comparison data exists. SPEC.md's roadmap section hasn't been updated to reflect this landing early — worth a decision on whether to move it in the spec or keep this tab as a rough spike.
- **The "wiggle room" example given (site text vs. legal phrasing) doesn't apply to the Scanned track**, which is pseudo-random in this Phase 0 prototype and never reads real site text — there is no real matching there yet to loosen. The fuzzy-matching change only affects the self-attested checklist reviewer, which is the only place actual text matching exists today. Applying "close-enough wording" to the Scanned track is a Phase 1 concern, once a real crawler + rule engine exist.
- Manually-entered countries are tracked for display and legislation-matching purposes but don't get their own requirement checklist — this MVP's requirement set only covers GDPR & CCPA per SPEC.md; a manual "Brazil" entry, for example, doesn't imply an LGPD checklist exists.

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
