# Roadmap: V2 and Beyond

The current build is a front-end prototype with simulated scan data (see README for what's real vs. mocked). This doc lays out where the product could go next.

## V2 — make the scan real

- Real crawler (headless browser) that actually inventories cookies/trackers, diffs privacy-policy text against observed site behavior, and detects consent-banner mechanics (does "reject" actually work, or is it a dark pattern?).
- Real GDPR/CCPA rule engine built against actual legal criteria per requirement, replacing the current mock heuristic.
- Weekly legislation/fines database backed by a real ingestion pipeline (state legislature feeds, EU Official Journal, regulator enforcement-action pages) instead of a static seed.
- Real accounts/auth, server-side scan history, and a "it's been 90 days since your last scan" nudge — re-scans stay manual by design, not automatic.
- PDF / exportable report for sharing with legal or leadership.

## V3 — expand regulatory and product surface

- Add more regulations: UK GDPR, LGPD (Brazil), PIPEDA (Canada), additional US state laws (Colorado, Virginia, Connecticut, etc.), and sector-specific rules (HIPAA, COPPA, GLBA). The regulation picker was built to be extensible for this.
- Multi-site / portfolio view for teams managing several products, or an agency managing multiple clients — a roll-up dashboard across all docket entries.
- Change alerts: notify when a tracked bill changes status (proposed → passed), or when a monitored site's tracking/policy changes between scans.
- Slack/email digest: a weekly "what changed in your regulatory landscape" summary.
- Team roles/permissions — legal reviews and signs off on remediation items; PM/eng gets assigned tickets.

## V4 — from audit tool to workflow tool

- Auto-generate remediation tickets (Jira/Linear/GitHub Issues) directly from failed requirements.
- Policy-drafting assistant: suggest actual privacy-policy language to close specific gaps, with tracked-changes-style diffs.
- Vendor/subprocessor risk register: flag when a newly detected third-party script isn't in your documented subprocessor list.
- API/webhook so this plugs into CI — e.g., block a deploy or flag a PR if a new tracker appears without a corresponding consent-category update.
- Benchmarking: an anonymized, opt-in aggregate view of how a company's compliance score compares to similar companies in its sector, using the platform's own scan data.

## Longer-term / moonshot

- Predictive compliance modeling: given a company's current architecture and roadmap, flag which *proposed* (not yet passed) bills would hit hardest if enacted, prioritized by expected effective date and likely passage.
- Legal-grade audit trail: an exportable, timestamped compliance evidence package suitable for handing to a regulator or auditor.
- International-expansion coverage tied to go-to-market planning: "if you launch in this country next, here's the regulatory lift."
