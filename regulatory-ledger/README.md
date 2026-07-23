# The Regulatory Ledger

A prototype for a web app that scans a website and rates its privacy and regulatory compliance, adjustable by country/regulation, and surfaces both current and upcoming legislation relevant to the site.

**[Open the prototype](./regulatory-ledger.html)** — single self-contained HTML file, no build step. Open it directly in a browser.

## What it does

- **Enter a website** and run a simulated full-site crawl against selected regulations.
- **Regulation picker** — multi-select GDPR and CCPA/CPRA (MVP scope; architecture leaves room for more).
- **Compliance results** — per-requirement Pass/Partial/Fail/N/A status with specific remediation guidance, plus an overall letter-grade score per regulation, styled as an ink-stamped seal.
- **Upcoming legislation tab** — filterable by region/status, showing pending and recently enacted bills relevant to the site.
- **Risk & precedent tab** — top risks ranked by severity, matched against sample enforcement cases (fines, regulator, year).
- **Privacy trust tab** — a separate score covering data minimization, consent clarity, user rights support, third-party transparency, and retention specificity — independent of legal compliance.
- **Docket sidebar** — saved sites with scan history; re-scans are triggered manually, never automatically.

## What's real vs. mocked in this prototype

This is a front-end prototype meant to demonstrate the product concept and interaction design — it does not perform a real website scan.

| Piece | Status |
|---|---|
| UI/UX, navigation, scoring logic, scan flow | Fully functional |
| Website crawling / tracker detection | Simulated (deterministic per-domain mock data) |
| GDPR / CCPA requirement text | Real regulatory citations and requirements |
| Legislation database | Static seed data, illustrative |
| Enforcement fines / precedent cases | Composite/illustrative examples — not real, verified enforcement records |
| Accounts / auth | Simulated with local browser state, resets on reload |

## Tech

Single HTML file — vanilla JS, no framework, no build step. Fonts: Fraunces (display), IBM Plex Sans (body), IBM Plex Mono (data/citations), loaded from Google Fonts CDN.

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md) for planned v2+ direction, including a real crawler, a live legislation/enforcement data pipeline, accounts, and workflow integrations.

## Legal

This tool provides informational guidance only, not legal advice. Consult qualified counsel before making formal compliance decisions.
