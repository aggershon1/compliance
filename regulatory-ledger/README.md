# The Regulatory Ledger

A workbench for tracking a product's privacy/regulatory compliance posture against GDPR and CCPA/CPRA, adjustable by country, with upcoming legislation relevant to the markets you operate in.

> **Crawling is real, and optional.** Run the local [crawl service](./server/README.md) and the app fetches the site's public pages and checks them against the requirement text, quoting what it actually found with source URLs. Without it, the app still works — you assess each requirement yourself. Nothing is ever invented: what a crawl can't determine stays *Unassessed*. See [What's real](#whats-real-vs-mocked-in-this-prototype).

**[Open the prototype](./regulatory-ledger.html)** — HTML shell + CSS, loading `js/*.js` via plain `<script>` tags, no build step. Open it directly in a browser, or serve the folder:

```bash
cd regulatory-ledger
python3 -m http.server 8000     # then http://localhost:8000
```

(The app file is `regulatory-ledger.html`; an `index.html` redirects to it so the bare URL works.)

## What it does

The app is built around one core insight: most of what GDPR/CCPA actually require — access, deletion, portability, consent management — happens **inside a logged-in product experience**, which an external crawler can never see. So compliance checking is split into tracks that roll up into **one combined score per regulation**:

- **Publicly observable** — privacy policy, cookie banner, terms, "Do Not Sell" link. With the crawl service running these are checked against the live site and evidenced with real quotes; without it you assess them yourself against the stated criteria.
- **Self-attested (logged-in)** — a checklist, prepopulated per regulation, for the things only visible behind auth (self-serve access/delete/export/correct, consent preference centers). You check what you have, describe how it works, optionally attach a screenshot, and the app reviews the submission — asking a targeted follow-up question and showing a rough sketch of what "compliant" typically looks like if your first answer isn't detailed enough to judge confidently.
- **Source audit (retired v0.8.0)** — a third track once let you upload a repo folder for real, in-browser pattern-matching against every requirement, with file/line evidence citations. The upload path was retired because shipping source into a web tool doesn't survive most security reviews. Entries audited before then remain viewable as historical records, and the engine is preserved in `js/codeaudit.js` (no longer loaded) for a future GitHub App or CLI path — see [`ROADMAP.md`](./ROADMAP.md).

Other features:
- **Regulation picker** — multi-select GDPR and CCPA/CPRA (MVP scope; architecture leaves room for more).
- **Staleness tracking** — self-attested items flag "Needs re-attestation" after 90 days.
- **Upcoming legislation tab** — filterable by region/status, defaults to what's relevant to the open site's countries.
- **Risk & precedent, inline** — every failing/partial item on the Compliance Results tab shows its own comparable real enforcement action (company, fine, regulator, year), plus a combined potential-exposure range near the overall grade.
- **vs. Competitors tab** — a list of competitors you're tracking (no scores; see the table below).
- **Settings dropdown** (top right) — a strictness dial controlling how literally findings must match statutory wording (e.g. whether "Do Not Sell My Information" satisfies a statute saying "…My Personal Information"), plus saved-data controls.
- **Docket sidebar** — every product you're tracking, with its assessment progress per regulation.
- **Your manual work persists** — overrides, attestations, and notes are saved locally and restored on load, so re-reviewing the same product later doesn't mean re-entering everything. Export/import from the Settings dropdown.
- **Exportable audit log** — a printable record of each requirement's status and who recorded it when, every attestation, and every assessment or override with its stated reason.

See [`SPEC.md`](./SPEC.md) for the full spec and [`CHANGELOG.md`](./CHANGELOG.md) for version history.

## What's real vs. mocked in this prototype

This is a prototype, and the line between what it observes and what you tell it matters more here than the feature list. Two things are genuinely inspected: a site's **public pages**, fetched by the optional local crawl service, and nothing else. Everything behind a login is your account of it — reviewed against the citation, but never verified. Its value is the requirement set, the structured record you build against it, and the audit trail that comes out, which records for every status who or what produced it.

| Piece | Status |
|---|---|
| UI/UX, navigation, scoring, record-keeping | Fully functional |
| Website crawling | **Real**, via the optional local [crawl service](./server/README.md) — fetches the homepage and linked policy pages, and evidences every finding with a real quote and source URL. Limits are stated per requirement in the UI. |
| Assessing what the pages actually say | Two methods, labelled per requirement. **Phrase matching** (always available) checks whether expected wording appears. **The policy analyst** (needs an API key) reads the retrieved text and measures it against the citation — so "does the notice map every processing purpose to a lawful basis" becomes answerable rather than deferred to you. Every verdict about the text must quote the text; a quote that isn't on the page it cites is dropped, and a verdict left without one is downgraded to undetermined. It judges the **document**, never the company: "the policy says X" is reported, "the company does X" is not sayable. Absence is always scoped — "not present in these 4 pages", never "this doesn't exist". |
| Page discovery (which pages get crawled) | Two methods, and the UI says which ran. **Link patterns** match link text against known privacy wording — free, but only finds vocabulary that was anticipated. **The navigator agent** reads the site and follows the links a person would; needs an API key. Measured against betterhelp.com the two return the same pages, so link patterns is the default — the agent is there for sites that file their notices under names the pattern list doesn't anticipate. Neither judges anything: they choose which pages to fetch. |
| Tracker behaviour (do trackers fire before consent?) | **Not determinable by fetching.** The crawl reports which third-party scripts load; whether they fire pre-consent needs a real browser session and is flagged as such. |
| Requirement statuses | **Real** — each one recorded by a person, with their stated reason and a timestamp, kept in the audit log |
| Source audit of an uploaded codebase | **Retired in v0.8.0.** Was real (pattern-matching your actual files in-browser, with file/line citations). Existing entries keep their real evidence; no new ones can be created. |
| GDPR / CCPA requirement text | Real regulatory citations and requirements |
| Self-attested checklist review (status, confidence, follow-up questions) | **Real model review** when the crawl service is running with an API key: the interviewer reads the citation, asks follow-up questions, and records a status citing your own words verbatim. It cannot see your product — it judges whether the implementation *you describe* satisfies the requirement, and marks the attestation **ungrounded** if it can't quote you. Without a key it falls back to the original keyword heuristic, which is a drafting aid rather than a verdict; every attestation records which reviewer ran. |
| Evidence attachments | **Two tiers, always labelled.** Screenshots, PDFs and text files are genuinely sent to the reviewer and read against the requirement. Video, Figma, Google Docs, Office files and links are **recorded but never opened** — they appear in the audit log for a person to review and are explicitly excluded from the reviewer's findings. The tier is shown before you upload, not after. |
| Legislation database | Static seed data, illustrative — and now labelled as such in the UI. |
| Legislation watch | **Real.** Fetches official pages (EDPB, ICO, CPPA, California AG — suggested defaults you should confirm) and reports the lines that changed since the last check, linking through to the source. It does **not** parse bills or claim to know a bill's status: a status scraped wrong and shown confidently is a compliance decision resting on a fiction. No API key needed. |
| Recommendations | **Static text** per requirement without an API key. With one, written against what was actually found — the finding, its provenance and any identified gaps — returning ordered steps, why they satisfy the citation, and what evidence to capture afterwards. Anything not actually established is written conditionally, because advice quietly asserts facts. |
| Proposal review | **Real** with an API key. Measures a spec against the citations before the work is built, quoting the plan verbatim and separating that from what the citation demands it misses. It judges against the **requirement**, never against a preferred approach — the tool schema has no field in which to express one. |
| Enforcement fines / precedent cases | **Real, publicly reported enforcement actions** (named company, regulator, year, amount), cited for comparison to the type of violation — not a claim that any scanned site committed them or is connected to those companies. As originally announced; some remain under appeal. |
| vs. Competitors scores | **Removed in v0.9.0.** Competitors can be tracked by name, but no scores are shown — assessing another company would mean auditing their product the way you audit yours. |
| Accounts / auth | No accounts — but your work now persists in this browser's local storage (overrides, attestations, notes), with export/import. Server-side accounts are `SPEC.md` Phase 1. |

## Tech

HTML shell + CSS in `regulatory-ledger.html`, loading seven plain-script `js/*.js` files (data, storage, scoring, reviewer, crawl, render, app; `codeaudit.js` is retained in-tree but no longer loaded) — vanilla JS, no framework, no build step. The optional crawl service in `server/` is dependency-free Node. Fonts: Fraunces (display), IBM Plex Sans (body), IBM Plex Mono (data/citations), loaded from Google Fonts CDN.

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md) for planned direction. The open question at the top of it: restoring a *real* analysis path — a crawler for the observable surface, or a local CLI for the behind-login surface — since neither exists today.

## Legal

This tool provides informational guidance only, not legal advice. Consult qualified counsel before making formal compliance decisions.
