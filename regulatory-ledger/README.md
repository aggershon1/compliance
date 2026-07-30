# The Regulatory Ledger

A prototype for a web app that scans a website and rates its privacy and regulatory compliance, adjustable by country/regulation, and surfaces both current and upcoming legislation relevant to the site.

**[Open the prototype](./regulatory-ledger.html)** — HTML shell + CSS, loading `js/*.js` via plain `<script>` tags, no build step. Open it directly in a browser.

## What it does

The app is built around one core insight: most of what GDPR/CCPA actually require — access, deletion, portability, consent management — happens **inside a logged-in product experience**, which an external crawler can never see. So compliance checking is split into two tracks that roll up into **one combined score per regulation**:

- **Scanned (logged-out)** — a simulated full-site crawl against whatever's publicly observable: privacy policy, cookie banner, terms, public disclosures.
- **Self-attested (logged-in)** — a checklist, prepopulated per regulation, for the things only visible behind auth (self-serve access/delete/export/correct, consent preference centers). You check what you have, describe how it works, optionally attach a screenshot, and the app reviews the submission — asking a targeted follow-up question and showing a rough sketch of what "compliant" typically looks like if your first answer isn't detailed enough to judge confidently.

Other features:
- **Regulation picker** — multi-select GDPR and CCPA/CPRA (MVP scope; architecture leaves room for more).
- **Staleness tracking** — self-attested items flag "Needs re-attestation" after 90 days.
- **Upcoming legislation tab** — filterable by region/status, defaults to what's relevant to the open site's countries.
- **Risk & precedent, inline** — every failing/partial item on the Compliance Results tab shows its own comparable real enforcement action (company, fine, regulator, year), plus a combined potential-exposure range near the overall grade.
- **Privacy trust tab** — a separate score covering data minimization, consent clarity, user rights support, third-party transparency, and retention specificity — independent of legal compliance.
- **vs. Competitors tab** — a basic score comparison against other companies (illustrative — see the table below).
- **Settings dropdown** (top right) — adjust how much each severity tier counts toward the blended score.
- **Docket sidebar** — saved sites with scan history; re-scans are triggered manually, never automatically.

See [`SPEC.md`](./SPEC.md) for the full spec and [`CHANGELOG.md`](./CHANGELOG.md) for version history.

## What's real vs. mocked in this prototype

This is a front-end prototype meant to demonstrate the product concept and interaction design — it does not perform a real website scan.

| Piece | Status |
|---|---|
| UI/UX, navigation, scoring logic, scan flow | Fully functional |
| Website crawling / tracker detection | Simulated (deterministic per-domain mock data) |
| GDPR / CCPA requirement text | Real regulatory citations and requirements |
| Self-attested checklist review (status, confidence, follow-up questions) | Simulated — rule-based keyword matching, not a live model call (see `SPEC.md` Phase 1) |
| Legislation database | Static seed data, illustrative |
| Enforcement fines / precedent cases | **Real, publicly reported enforcement actions** (named company, regulator, year, amount), cited for comparison to the type of violation — not a claim that any scanned site committed them or is connected to those companies. As originally announced; some remain under appeal. |
| vs. Competitors scores | Simulated — no real crawl of competitor sites exists yet, even when a real company name is shown |
| Accounts / auth | Simulated with local browser state, resets on reload |

## Tech

HTML shell + CSS in `regulatory-ledger.html`, loading five plain-script `js/*.js` files (data, scoring, reviewer, render, app) — vanilla JS, no framework, no build step. Fonts: Fraunces (display), IBM Plex Sans (body), IBM Plex Mono (data/citations), loaded from Google Fonts CDN.

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md) for planned v2+ direction, including a real crawler, a live legislation/enforcement data pipeline, accounts, and workflow integrations.

## Legal

This tool provides informational guidance only, not legal advice. Consult qualified counsel before making formal compliance decisions.
