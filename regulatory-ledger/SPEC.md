# The Regulatory Ledger — Full Spec

## Overview

A web app that scans a website and rates its privacy and compliance standards, adjustable by country/regulation, looking at both current regulations and future legislation that would affect the company.

## Core insight driving this version of the spec

Most of what GDPR/CCPA actually require — access, deletion, portability, consent management, correction — happens **inside the logged-in product experience**, not on public marketing pages. An automated crawler can only see what's logged out. It has no way to see a "Delete my account" button buried in Account Settings, unless it's handed real user credentials, which isn't a viable ask.

So the product is split into two data-collection tracks that feed **one combined score per regulation**:

---

## Track 1 — Automated scan (logged-out surface)

Full-site crawl of everything reachable without authentication: privacy policy, cookie banner behavior, terms of service, public data-collection forms, footer links (e.g. "Do Not Sell My Info"), and any public disclosures.

This track only contains requirements that are genuinely observable without logging in — e.g. does a cookie consent banner exist and work, is there a privacy notice, is there a DNS-link in the footer. Requirements that need an actual account to verify (does deletion really work end-to-end?) do **not** belong here, even if they seem checkable in principle — assume they aren't observable externally.

## Track 2 — Self-attested checklist (logged-in / authenticated surface)

A checklist, **prepopulated per regulation**, covering the requirements that only exist behind login: self-serve data access, deletion, portability, correction, and consent-preference management.

For each item:
1. User checks **"We have this in place"** (or leaves unchecked → treated as not implemented).
2. If checked, user provides a **short description** of how it works, and optionally a **screenshot**.
3. The system reviews the submission and returns a status (Pass / Partial / Fail), a **confidence level**, and a rationale.
4. **If confidence is low** (e.g. the description is vague, or there's no screenshot to corroborate it), the system asks **one targeted follow-up question** specific to that requirement, and shows a **rough sketch of what a compliant version typically looks like** — so the user has a concrete reference point rather than guessing what's being asked. The user answers once, and the system finalizes its judgment using everything provided — description, screenshot if given, and the follow-up answer. The goal at every step is to reach the highest achievable confidence with the information on hand, not to force a screenshot as a hard requirement.
5. If a screenshot is provided up front, it's treated as strong corroborating evidence and generally raises confidence enough to skip the follow-up step entirely.

### Staleness / re-attestation

Self-attested answers go stale — the feature described might get changed or removed months later with no automatic way for the platform to know. Every attested item carries a timestamp, and items older than **90 days** are flagged **"Needs re-attestation"** in the UI. A stale item keeps contributing its last-known status to the score (so the number doesn't swing wildly on a timer), but it's visibly flagged so nobody mistakes a stale attestation for a fresh one.

## Combined scoring

Both tracks feed **one score per regulation** (not two separate scores). Every row — whether it came from the automated scan or from a self-attested checklist item — carries a small source tag (**Scanned** vs **Self-attested**) so it's always clear where a given result came from, even though they roll up into a single number. Unattested checklist items (unchecked, or checked but not yet submitted/reviewed) count as zero credit toward the score until they're resolved, the same way a Fail does — this keeps the score honest and avoids rewarding an empty checklist.

---

## Requirement inventory (MVP: GDPR + CCPA/CPRA)

### GDPR — Scanned (logged-out)
Lawful basis referenced in privacy notice · Granular cookie/tracker consent mechanism · Privacy notice covers all processing purposes in plain language · DPO contact designated & published · International transfer safeguards disclosed · Records-of-processing commitment referenced in policy · Breach notification procedure documented

### GDPR — Self-attested (logged-in)
Self-serve right to access (view/download your data from account settings) · Self-serve right to erasure (delete account/data without contacting support) · Self-serve data portability (structured export, e.g. CSV/JSON) · Granular consent preference center (toggle marketing/analytics/tracking independently)

### CCPA/CPRA — Scanned (logged-out)
"Do Not Sell or Share" link present · Notice at collection · Non-discrimination commitment stated in policy · Sensitive-PI opt-out link present · Financial incentive disclosure (where applicable)

### CCPA/CPRA — Self-attested (logged-in)
Self-serve right to know/access · Self-serve right to delete · Self-serve right to correct · Sensitive-PI "limit use" toggle actually functions (not just a static link)

---

## Other existing features (carried over)

- Multi-select regulation picker (extensible beyond GDPR/CCPA later)
- Upcoming legislation tab, filterable by region/status
- Risk & precedent tab with comparable enforcement examples
- Separate Privacy Trust score (data minimization, consent clarity, rights support, third-party transparency, retention specificity)
- Docket sidebar of saved sites; re-scans are always manual, never automatic

---

## Roadmap

### Phase 0 — Current prototype (this build)
Front-end only, fully interactive, all data simulated: deterministic mock scan results, rule-based (non-LLM) simulated review of checklist submissions, local browser state only (resets on reload). Purpose: validate the product concept and interaction model before investing in real infrastructure.

### Phase 1 — Real MVP
- Real crawler for the scanned track.
- Real rule engine for scanned GDPR/CCPA requirements, built against actual legal text.
- Real LLM-based review for checklist submissions (description + screenshot), replacing the prototype's keyword heuristic — this is what actually reads a screenshot and judges whether a described flow satisfies a requirement.
- Real accounts, server-side storage of scan + attestation history.
- 90-day re-attestation reminders (email/in-app).
- Manual re-scan only, by design.

### Phase 2 — Broader coverage
- Additional regulations: UK GDPR, LGPD (Brazil), PIPEDA (Canada), US state laws (Colorado, Virginia, Connecticut, etc.).
- Multi-site / portfolio dashboard for teams or agencies managing several products.
- Real weekly-refreshed legislation and enforcement-fines pipeline (replacing the seeded sample dataset).
- PDF export of the full report.
- Change alerts: bill status changes, or site/scan changes since last visit.
- Slack/email digest of what changed in your regulatory landscape.

### Phase 3 — Workflow integration
- Auto-generate remediation tickets (Jira/Linear/GitHub Issues) from failed scanned or checklist items.
- Policy-drafting assistant that suggests actual privacy-policy language to close a specific gap.
- Vendor/subprocessor risk register, flagging undocumented third-party scripts detected during a scan.
- Team roles/permissions — e.g. legal reviews and formally signs off on a PM's self-attested checklist item, rather than the AI review being the only check.
- CI/webhook integration — flag a PR or block a deploy if a new tracker appears without a corresponding consent-category update.

### Phase 4 — Longer-term
- Predictive compliance modeling: flag which *proposed* (not-yet-passed) bills would hit hardest given the company's current architecture and roadmap.
- Exportable, timestamped audit-trail package suitable for handing to a regulator or auditor.
- Anonymized, opt-in benchmarking against similar companies in the same sector.
- International-expansion planning tied to go-to-market: "if you launch in this country next, here's the regulatory lift."

---

## v0.3.0 additions (from review feedback)

### Regional site variants
A site can be scanned as a specific regional version (United States / European Union / Switzerland / Global default) rather than treated as one undifferentiated entity. This directly addresses cases like BetterHelp, where the US site and the EU site show materially different cookie-consent behavior. Adding the same domain again under a different variant creates a separate docket entry so the two can be compared side by side. The regional variant also sets sensible default jurisdiction/regulation scope for that entry.

### Manual override with stored explanation
Every individual result \u2014 scanned or self-attested \u2014 can be overridden with a required explanation. The override is layered on top of the original result (not destructive), shown as "Overridden: [old] \u2192 [new] \u2014 [explanation]," and factored into the blended score in place of the original. Overrides are tracked per requirement across scans in the session; once the same requirement has been overridden more than once, the UI surfaces a flag that the underlying detection logic may need recalibrating. (In a real backend, this history would persist and aggregate across the org, not just the current browser session \u2014 see Phase 1.)

### Hover-to-read full article text
Every citation code (e.g. "Art. 6," "\u00A71798.135") is hoverable and shows the article's title and a plain summary of its operative text, so the citation itself isn't just a dead label.

### Plain-language explanation per requirement
Every requirement, scanned or self-attested, now carries a short layman's-terms explanation shown directly under the requirement text \u2014 separate from the hover-to-read legal text, and aimed at someone (e.g. a PM) who isn't fluent in the regulation.

### Filter by country, in addition to by regulation
A country/jurisdiction picker (starting with the US and the individual EU member states, plus Switzerland) sits alongside the direct regulation toggles. Selecting a country automatically pulls in whichever regulation applies (EU countries and Switzerland \u2192 GDPR; US \u2192 CCPA only if California is selected). Both entry points stay available and combine rather than replace each other.

### Visual/UX pass + PDF export
Increased base type size and line height, added hover states and subtle depth/shadow to interactive elements, and tightened up spacing that felt too loose. Added an "Export PDF report" action that generates a clean, stakeholder-shareable summary (grade, top gaps, risk highlights, trust score) using the browser's print dialog.

### Grade explanation + Recommendations tab
The grade stamp's caption now explains *why* the score is what it is \u2014 naming the top 1\u20132 contributing gaps by severity \u2014 instead of describing the scoring mechanism. A new Recommendations tab lists every open gap (scanned or self-attested) with its plain-language explanation and 2\u20133 concrete, spec-ready proposals for closing it, distinct from the Risk & Precedent tab, which is about severity/exposure rather than fixes.

## Legal disclaimer (unchanged)

This tool provides informational guidance only, not legal advice. Consult qualified counsel before making formal compliance decisions. Enforcement examples referenced anywhere in the product are illustrative unless explicitly sourced and verified.
