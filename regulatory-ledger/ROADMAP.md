# Roadmap

This is the forward-looking plan. For what's built today see [`CHANGELOG.md`](./CHANGELOG.md); for the product model see [`SPEC.md`](./SPEC.md).

> **Note:** `SPEC.md`'s "Roadmap" section (Phases 0–4) predates v0.6.0 and no longer matches this document. This file is authoritative going forward; SPEC's phase list is kept for historical context until the two are reconciled.

---

## Where we actually are (through v0.8.0)

The original roadmap framed the next milestone as "make the scan real" via a headless crawler. That framing is now out of date: the **source-audit track** (v0.6.0) made the harder half real first, and it turned out to be a better answer for the primary user — a PM who owns compliance for their own product and was drowning in manual overrides for everything behind a login wall.

**Shipped:**

- **Dual-track compliance model** — scanned (logged-out) + self-attested (logged-in), rolling into one blended score per regulation, with unattested items counting as zero credit.
- **Source audit (v0.6.0, ingestion retired v0.8.0)** — pattern-matched an uploaded codebase against every requirement entirely in-browser, citing real file/line/snippet evidence. The browser upload path has since been retired (item below); entries audited before then remain viewable as historical records, and the engine is preserved in `js/codeaudit.js` (no longer loaded) for a future ingestion path.
- **Persistence (v0.7.0, in review)** — overrides, attestations, drafts, and settings survive across sessions; re-auditing an existing entry preserves manual work and refreshes only audit-derived results. Includes stale-override detection and JSON export/import.
- Country-based scoping with per-country + overall grading; manual country entry.
- Final grade gated on self-attestation completeness.
- Risk & precedent merged inline into Compliance Results, citing **real, publicly reported enforcement actions**, with an aggregate exposure range.
- **Strictness dial (v0.8.0)** — one Settings control governing how literally a finding must match statutory wording, replacing the severity-weight slider. Changing it re-evaluates existing description-based attestations; overrides are never touched.
- **Exportable audit log (v0.8.0)** — printable/PDF record of every run, each requirement's status and provenance, every attestation, and every override with its stated reason.
- **Repo uploading retired (v0.8.0)** — the browser folder-upload entry path is gone; see the open question under Later.
- Recommendations tab, upcoming-legislation tab (static seed data), Privacy Trust score, competitor comparison, PDF summary report via print dialog.

**Still simulated:** website crawling/tracker detection, the self-attested checklist reviewer (keyword heuristic, not a model call), the legislation dataset, and competitor scores. With the source-audit ingestion path retired, **new entries are once again entirely simulated** — restoring a real analysis path is the open question left in its wake. See README's real-vs-mocked table.

---

## Next — requires a backend

The three no-backend items shipped in v0.8.0. Everything remaining needs server-side infrastructure, which is now the real architectural threshold for this project (see `SPEC.md` Phase 1: a static file can't hold an API key or run scheduled jobs).

### 1. Legislation alerts

Notify when a bill relevant to your jurisdictions lands on the docket, changes status, or is approaching its effective date — so compliance work can start before the deadline rather than after.

Requires replacing the static `BILLS` seed with a real ingestion pipeline (state legislature feeds, EU Official Journal, regulator enforcement pages), plus accounts and a delivery channel (email/Slack/in-app). Filtering by a site's selected countries already exists and would drive relevance.

### 2. Remediation guidance — recommendations **and** proposal review

Two directions, both available, neither gating the other:

**Tool → you (suggest an approach).** Deepen what the Recommendations tab does today. Current proposals are static text hardcoded per requirement; these would be contextual — informed by what the audit actually found in your product, what you've already attested, and which countries are in scope.

**You → tool (review my approach).** Upload or paste a spec, PRD, or proposal describing how you intend to close an open finding, and get feedback on whether it actually satisfies the requirement — before the work is built, when changing it is still cheap.

**The critical design constraint:** proposal review must evaluate a plan against **the requirement**, not against the tool's own suggestion. There are many valid ways to satisfy a given article, and a house style that diverges from the recommended pattern is not a deficiency. A team may have good reasons — existing architecture, an established design system, prior legal guidance — for an approach the tool wouldn't have proposed.

So the review answers:
- Does this satisfy the citation, and where does it fall short if not?
- What does the requirement demand that the proposal doesn't address?
- What evidence would need to exist afterward to attest this — ideally the same evidence the source-audit rules or checklist would later look for?

It must never answer "this isn't how we'd do it." Divergence from the recommendation is only worth raising when it creates an actual compliance gap, and that gap should be named against the legal text rather than against the tool's preference. A tool that quietly penalizes teams for not matching its house style would be worse than no tool — it would push toward uniform implementations rather than compliant ones.

A reviewed proposal is also a natural attestation artifact: the plan, the review, and the eventual evidence form a chain worth carrying into the audit log (item 2).

Requires a real model call, hence a backend to hold the API key. The same infrastructure would replace the keyword-heuristic checklist reviewer.

---

## Later

- **Restore a real analysis path.** Retiring the browser upload closed the security-review problem but reopened the one it solved: behind-login requirements are back to manual attestation, and nothing in the product is real analysis again. The candidates remain a read-only GitHub App (server-side clone) or a local CLI that emits findings without moving code. `js/codeaudit.js` and its rules are preserved in-tree for whichever wins.
- **Broader regulatory coverage** — UK GDPR, LGPD (Brazil), PIPEDA (Canada), more US state laws (Colorado, Virginia, Connecticut), and sector rules (HIPAA, COPPA, GLBA). The regulation picker and requirement data model were built to extend this way.
- **"What changed since last audit" diff** — with multiple runs now stored per entry, surface regressions between runs rather than only point-in-time posture. Turns the tool from an audit into ongoing monitoring.
- **Real crawler for the logged-out surface** — deliberately deprioritized. It only sees the public pages, which was never the hard part; the behind-login gap mattered more and was addressed differently.
- **Multi-site / portfolio view** — for teams or agencies tracking several products.
- **Remediation tickets** — generate Jira/Linear/GitHub issues from failed requirements. Worth doing only once findings are trustworthy enough that filing them automatically doesn't create noise.
- **Vendor/subprocessor risk register** — flag third-party scripts or dependencies absent from the documented subprocessor list.
- **Team roles and sign-off** — legal formally approves a PM's attestation, rather than an automated review being the only check.
- **CI integration** — flag a PR or block a deploy when a change introduces a new tracker without a corresponding consent-category update.
- **Predictive modeling** — given current architecture, flag which *proposed* bills would hit hardest if enacted.
- **International-expansion planning** — "if you launch here next, here's the regulatory lift."
