# Roadmap

This is the forward-looking plan. For what's built today see [`CHANGELOG.md`](./CHANGELOG.md); for the product model see [`SPEC.md`](./SPEC.md).

> **Note:** `SPEC.md`'s "Roadmap" section (Phases 0–4) predates v0.6.0 and no longer matches this document. This file is authoritative going forward; SPEC's phase list is kept for historical context until the two are reconciled.

---

## Where we actually are (through v0.7.0)

The original roadmap framed the next milestone as "make the scan real" via a headless crawler. That framing is now out of date: the **source-audit track** (v0.6.0) made the harder half real first, and it turned out to be a better answer for the primary user — a PM who owns compliance for their own product and was drowning in manual overrides for everything behind a login wall.

**Shipped:**

- **Dual-track compliance model** — scanned (logged-out) + self-attested (logged-in), rolling into one blended score per regulation, with unattested items counting as zero credit.
- **Source audit (v0.6.0)** — upload a codebase and it's pattern-matched against every requirement entirely in-browser, citing real file/line/snippet evidence. Auto-attests checklist items that have solid evidence; leaves the rest to the normal attestation flow. **The only non-simulated analysis in the product.**
- **Persistence (v0.7.0, in review)** — overrides, attestations, drafts, and settings survive across sessions; re-auditing an existing entry preserves manual work and refreshes only audit-derived results. Includes stale-override detection and JSON export/import.
- Country-based scoping with per-country + overall grading; manual country entry.
- Final grade gated on self-attestation completeness.
- Risk & precedent merged inline into Compliance Results, citing **real, publicly reported enforcement actions**, with an aggregate exposure range.
- Recommendations tab, upcoming-legislation tab (static seed data), Privacy Trust score, competitor comparison, severity weighting, PDF report via print dialog.

**Still simulated:** website crawling/tracker detection, the self-attested checklist reviewer (keyword heuristic, not a model call), the legislation dataset, and competitor scores. See README's real-vs-mocked table.

---

## Next — no backend required

These are buildable within the current static, no-build-step architecture.

### 1. Replace the severity-weight slider with a **strictness dial**

Today's Settings slider weights severity tiers (high/med/low). Repurpose it into a control for **how literally a finding must match the letter of the law** — the axis that actually causes disagreement in practice.

The worked example: a footer link reading *"Do Not Sell My Information"* against a statute that says *"Do Not Sell My Personal Information."* At the strict end that's a finding; at the lenient end it's a pass. Today that judgment is hardcoded — the fuzzy matcher added in v0.4.0 uses a fixed 60% word-overlap threshold, and the source-audit rules use fixed regexes. This exposes it.

- Strict end: statutory phrasing, near-exact. Surfaces technical non-compliance a regulator could cite.
- Lenient end: semantically equivalent language passes. Reflects how enforcement usually behaves in practice.
- Applies to both the checklist reviewer's matching and the source-audit rule thresholds, so one dial governs the whole product's posture.

*Open question:* does severity weighting survive alongside this as a second control, or is it retired? Two sliders risk muddling "how bad is this" with "how literally do we read it" — they're genuinely different questions, and folding them together would be a mistake.

*Spec impact:* changes the scoring approach documented in `SPEC.md`.

### 2. Exportable audit log (PDF)

A timestamped, human-readable record of everything that produced the current posture: every scan/audit run, every status change, who attested what and when, every override with its explanation, and the file/line evidence behind each source-audit finding.

This is the artifact legal and auditors actually ask for, and it's mostly a formatter — the underlying data already exists and v0.7.0 added the export plumbing. Ships as PDF (the existing print-dialog path) alongside the JSON export.

Previously filed under "moonshot" as a legal-grade audit trail; that was a misjudgment of effort now that the evidence and history are already captured.

### 3. Retire repo uploading; decide what replaces it

Asking a company to upload its source into a browser tool doesn't survive contact with most security review processes, even though the analysis itself never leaves the machine. Remove the folder-upload entry path.

This is a real trade-off, not a cleanup: the source-audit track is currently the only genuinely real analysis in the product, and the only thing that auto-attests behind-login requirements. Removing it without a replacement returns the manual-attestation burden it was built to solve.

*Open question — what replaces the ingestion path:*
- A read-only GitHub App with scoped repo access (server-side clone; requires a backend).
- A local CLI that runs the same rules and emits only findings, never code — keeps source on the user's machine while removing the upload gesture.
- Retire the capability entirely and accept the heavier manual attestation flow.

The engine (`js/codeaudit.js` + `CODE_AUDIT_RULES`) is worth preserving in any of these — it's the ingestion path that's in question, not the analysis.

*Spec impact:* removes or rewrites `SPEC.md`'s "Track 3 — Source audit" section.

---

## Then — requires a backend

Both need server-side infrastructure, which is the real architectural threshold for this project (see `SPEC.md` Phase 1: a static file can't hold an API key or run scheduled jobs).

### 4. Legislation alerts

Notify when a bill relevant to your jurisdictions lands on the docket, changes status, or is approaching its effective date — so compliance work can start before the deadline rather than after.

Requires replacing the static `BILLS` seed with a real ingestion pipeline (state legislature feeds, EU Official Journal, regulator enforcement pages), plus accounts and a delivery channel (email/Slack/in-app). Filtering by a site's selected countries already exists and would drive relevance.

### 5. Spec / proposal review

Upload or paste a spec, PRD, or proposal describing how you intend to close an open finding, and get feedback on whether it actually satisfies the requirement — before the work is built.

This inverts the previously planned "policy-drafting assistant": rather than the tool drafting language for you, you bring the plan and it critiques it against the specific citation, flagging what the requirement demands that the proposal doesn't address. It's the natural companion to the Recommendations tab — recommendations say *what* to fix; this checks whether your plan *actually* fixes it.

Requires a real model call, hence a backend to hold the API key. Would also replace the keyword-heuristic checklist reviewer with the same infrastructure.

---

## Later

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
