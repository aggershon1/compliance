# Roadmap

This is the forward-looking plan. For what's built today see [`CHANGELOG.md`](./CHANGELOG.md); for the product model see [`SPEC.md`](./SPEC.md).

> **Note:** `SPEC.md`'s "Roadmap" section (Phases 0–4) predates v0.6.0 and no longer matches this document. This file is authoritative going forward; SPEC's phase list is kept for historical context until the two are reconciled.

---

## Where we actually are (through v1.1.0)

Two corrections shaped where this ended up. The source-audit track (v0.6.0) made the behind-login half real first — then its ingestion path proved unshippable through security review. And the "scan" that had existed since v0.1.0 turned out to be fabricating findings about real sites, which v0.9.0 removed outright. v1.0.0 makes the logged-out surface genuinely real for the first time, via an optional local crawl service; v1.1.0 puts a model behind both halves — choosing which pages to read, and reviewing what you attest to about the half no crawl can see.

**Shipped:**

- **Dual-track compliance model** — scanned (logged-out) + self-attested (logged-in), rolling into one blended score per regulation, with unattested items counting as zero credit.
- **Source audit (v0.6.0, ingestion retired v0.8.0)** — pattern-matched an uploaded codebase against every requirement entirely in-browser, citing real file/line/snippet evidence. The browser upload path has since been retired (item below); entries audited before then remain viewable as historical records, and the engine is preserved in `js/codeaudit.js` (no longer loaded) for a future ingestion path.
- **Persistence (v0.7.0)** — overrides, attestations, drafts, and settings survive across sessions; re-auditing an existing entry preserves manual work and refreshes only audit-derived results. Includes stale-override detection and JSON export/import.
- Country-based scoping with per-country + overall grading; manual country entry.
- Final grade gated on self-attestation completeness.
- Risk & precedent merged inline into Compliance Results, citing **real, publicly reported enforcement actions**, with an aggregate exposure range.
- **Strictness dial (v0.8.0)** — one Settings control governing how literally a finding must match statutory wording, replacing the severity-weight slider. Changing it re-evaluates existing description-based attestations; overrides are never touched.
- **Exportable audit log (v0.8.0)** — printable/PDF record of every run, each requirement's status and provenance, every attestation, and every override with its stated reason.
- **Repo uploading retired (v0.8.0)** — the browser folder-upload entry path is gone; see the open question under Later.
- **Real website crawling (v1.0.0)** — an optional local service fetches the homepage and linked policy pages; findings are evidenced with real quotes and source URLs, and the strictness dial governs how literally live site wording must match.
- **Agents (v1.1.0)** — a navigator that finds a site's privacy documents by reading it rather than matching a regex list, and an attestation interviewer that reviews behind-login descriptions against the citation. Both optional, both degrade to the previous behaviour, both gated so a model cannot assert anything it can't cite.
- **Fabricated results removed (v0.9.0)** — the simulated crawler, invented evidence snippets, the pseudo-random trust score and competitor scores are gone; unassessed requirements read Unassessed rather than being guessed.
- Recommendations tab, upcoming-legislation tab (static seed data), PDF summary report via print dialog.

**Still simulated:** the legislation dataset. Website crawling is real (v1.0.0), and attestation review is a real model call when the service has a key (v1.1.0), falling back to the old keyword heuristic without one — the UI and audit log always say which ran. What a fetch can't establish — tracker timing, anything behind login — is flagged rather than guessed. See README's real-vs-mocked table.

---

## Shipped in v1.4.0 — the backend items

All three landed. What each of them deliberately *isn't* is as important as what it is, so that's recorded with them.

### 1. Legislation alerts → **a legislation watch**

Watches official pages and reports the lines that changed since the last check, with a link through to the source. Works with no API key — retrieval and diffing only.

**Deliberately not built:** a per-source parser producing structured bill records. That is the version that sounds right, and it is the version this project must not ship without being able to verify it — a bill status scraped wrong and rendered confidently is a compliance decision resting on a fiction, which is v0.9.0 with legal deadlines attached. "This page changed, here are the new lines" is checkable by clicking through, which is the standard everything else here is held to.

**Also not built:** accounts and email/Slack delivery. The service binds to loopback and holds no user data by design; adding SMTP credentials to it is a different product. Alerts surface in the app on check, and any scheduler can call `POST /api/legislation/check`.

The `BILLS` seed list stays exactly what it always was, and is now labelled in the UI as static sample data rather than sitting next to real results unmarked.

### 2. Remediation guidance — both directions

**Tool → you.** Recommendations are now written against what was actually found: the finding, its provenance, and the gaps already identified all go to the adviser, which returns ordered steps, why they satisfy the citation, what evidence to capture afterwards, and a rough effort size. The static per-requirement text remains the fallback with no API key, labelled as generic.

The honesty constraint here is subtle and worth keeping in mind: advice quietly asserts facts. "Add a retention period to your policy" claims your policy lacks one. So the current status travels with its provenance, and anything not actually established has to be written conditionally.

**You → tool.** Paste or attach a spec and have it measured against the citations before the work is built. Output separates what the plan says (quoted from the plan, verbatim-checked) from what the citation demands that it misses.

The roadmap's firmest constraint — *"it must never answer 'this isn't how we'd do it'"* — is enforced by the tool schema, which has `gaps_against_citation` and **no field for a preferred alternative**. A reviewer that wants to say "I'd have used a preference centre" has nowhere to put it. `roadmap.test.js` asserts the absence of such a field, so a later change can't quietly add one.

---

## Later

- **Headless-browser crawling.** The v1.0.0 crawler fetches pages, which cannot show whether trackers fire before consent or whether "Reject All" is as easy as "Accept All" — the substance of the consent requirement. Driving a real browser (Playwright) in the crawl service would close that gap.
- **A real analysis path for behind-login requirements.** These remain manual attestation. A read-only GitHub App is likely blocked on the same grounds the codebase upload was; a local CLI emitting findings without moving code is the surviving candidate. `js/codeaudit.js` and its rules are preserved in-tree for it.
- **Broader regulatory coverage** — UK GDPR, LGPD (Brazil), PIPEDA (Canada), more US state laws (Colorado, Virginia, Connecticut), and sector rules (HIPAA, COPPA, GLBA). The regulation picker and requirement data model were built to extend this way.
- **"What changed since last audit" diff** — with multiple runs now stored per entry, surface regressions between runs rather than only point-in-time posture. Turns the tool from an audit into ongoing monitoring.
- **Multi-site / portfolio view** — for teams or agencies tracking several products.
- **Remediation tickets** — generate Jira/Linear/GitHub issues from failed requirements. Worth doing only once findings are trustworthy enough that filing them automatically doesn't create noise.
- **Vendor/subprocessor risk register** — flag third-party scripts or dependencies absent from the documented subprocessor list.
- **Team roles and sign-off** — legal formally approves a PM's attestation, rather than an automated review being the only check.
- **CI integration** — flag a PR or block a deploy when a change introduces a new tracker without a corresponding consent-category update.
- **Predictive modeling** — given current architecture, flag which *proposed* bills would hit hardest if enacted.
- **International-expansion planning** — "if you launch here next, here's the regulatory lift."
