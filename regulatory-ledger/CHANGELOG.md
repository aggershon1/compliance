# Changelog

All notable changes to this prototype are logged here.

## [1.4.0] — The three backend roadmap items

All three shipped. What each one deliberately *isn't* mattered as much as what it is.

### Added
- **Contextual recommendations.** The Recommendations tab showed text hardcoded per requirement — correct, generic, and identical whether you have no privacy policy at all or one missing a single retention period. It now writes against what was actually found, returning ordered steps, why they satisfy the citation, what evidence to capture afterwards, and a rough effort size. The static text remains the fallback without an API key, labelled as generic.

  The honesty problem here is quieter than elsewhere: advice asserts facts. "Add a retention period to your policy" claims your policy lacks one, and if that came from a failed fetch rather than a read it is a fabricated finding in a helpful voice. So the current status travels **with its provenance**, and the adviser is required to write conditionally about anything not actually established.

- **Proposal review.** Paste or attach a spec, PRD or design doc and have it measured against the citations before the work is built. Output separates what the plan says — quoted from the plan, verbatim-checked — from what the citation demands that it misses, plus what evidence would need to exist afterwards to attest it.

  The roadmap's firmest constraint was *"it must never answer 'this isn't how we'd do it'"*. That is enforced by the schema, not the prompt: there is `gaps_against_citation` and **no field for a preferred alternative**. A reviewer wanting to say "I'd have used a preference centre instead" has nowhere to put it. The test asserts that no such field exists, so it can't be quietly added later.

- **Legislation watch.** Watches official pages and reports the lines that changed since the last check, linking through to the source. No API key needed — retrieval and diffing only.

  Deliberately *not* a per-source parser producing structured bill records. That is the version that sounds right and the version this project must not ship unverified: a bill status scraped wrong and rendered confidently is a compliance decision resting on a fiction. Accounts and email delivery are also out — this service binds to loopback and holds no user data, and adding SMTP to it is a different product. Any scheduler can call `POST /api/legislation/check`.

### Changed
- The seed `BILLS` list is now labelled in the UI as static sample data, so it doesn't sit unmarked next to real watch results.

### Fixed during the build
- A 404 has a body, and that body is stable — so a watch pointed at a moved source would have baselined its error page and reported "no changes" forever. Non-2xx is now reported as unreachable. Found by the test that asserts an unreachable source is never reported as quiet.

### Verified
39 new offline checks across the three features, 12 more in the browser. 136 offline, 84 browser, 17 end-to-end in total.

## [1.3.4] — The budgets are yours to set

Every page and reading limit was a hardcoded constant. They are judgement calls about someone else's site, not laws of nature, so they are now environment variables.

### Added
- `CRAWL_MAX_PAGES` (10), `CRAWL_PAGES_PER_LEVEL` (4), `CRAWL_TIMEOUT_MS`, `CRAWL_MAX_BYTES` — link-pattern retrieval.
- `AGENT_MAX_PAGES` (12), `AGENT_MAX_TURNS` (16) — the navigator agent.
- `ANALYST_TOTAL_CHARS` (90 000), `ANALYST_PAGE_CHARS` (24 000) — **how much retrieved text the reviewer actually reads**.
- **Truncation is reported.** The page budget and the reading budget are independent, so raising the first without the second fetches pages that are then discarded before anyone reads them — a crawl that looks thorough and isn't. The app now names each page that was cut and by how much, and says which variable to raise.

### Note
`CRAWL_PAGES_PER_LEVEL` is usually the limit that actually binds. The 10-page ceiling is rarely reached; running out of the four slots per discovery level is what stops a crawl short, and on a site with several legal pages those slots get spent before the interesting documents are reached.

## [1.3.3] — Analysis was bound to the moment you crawled

Reported: a requirement still showing "whether it covers every processing purpose in plain language is a judgment only you can make", on a merged build, with the service reporting `agents: enabled`.

The rationale next to it — *"Found the expected wording in the retrieved pages. Capped at Partial because presence is checkable but sufficiency is not"* — is written by the phrase matcher. The analyst never produces that sentence. So the analyst hadn't judged that requirement, and the server log confirmed it: a `[crawl]` line and no `[analyze]` line.

### Fixed
- **Analysis was scoped to the regulations selected at crawl time.** It ran once, against `effectiveRegs(site)` as it stood at that instant. Turn GDPR on afterwards and its requirements were never read — they kept phrase-matched findings permanently, on a build where the reviewer would have judged them.

  Every requirement that has a crawl rule is now assessed, regardless of what's currently in scope. The cost is negligible: it is one call either way, the pages dominate the tokens, and going from ~6 requirements to ~12 barely moves it. What's *scored* is still governed by scope — that was always a separate question from what gets *read*, and conflating them was the bug.

### Added
- **"Read the retrieved pages"** — re-runs the assessment against the crawl you already have, with no new requests to the site. You shouldn't have to re-fetch a real site because the reviewer wasn't reachable the first time, or because you changed the regulations afterwards.
- The end-to-end test now crawls with **only GDPR** in scope and asserts a CCPA requirement was read anyway, so this can't silently return.

## [1.3.2] — The stale limitation line, actually fixed

v1.3.1 guessed at why "whether it covers every processing purpose in plain language is a judgment only you can make" survived a re-crawl. It guessed wrong. This finds it.

### Added
- **An end-to-end test** (`e2e.test.js`). It starts the real fixture site and the real crawl service as child processes, opens the real page, clicks the real Crawl button, and checks what a person would actually see. Only the model is faked, so it needs no API key and no network.

  Every existing suite passed while the feature was broken in the browser. That is the whole reason this file exists: the analyst's gate was tested with a stub, the render functions with injected state, the HTTP surface with curl-shaped calls — and nothing tested the seam where they meet. It reproduced the bug on the first run.

### Fixed
- **The limitation line fell back to the phrase-rule text even after the reviewer had read the document.** When reading genuinely settles a requirement, the reviewer returns an empty "beyond the document" note — and the code treated empty as *missing* and substituted the static text, which says the opposite of what had just happened. So a requirement could come back read, assessed, and Pass, while still printing "a judgment only you can make" underneath.

  The two cases are now distinguished. Where the cap survives analysis, the static text **is** the reason for the cap — trackers may fire before consent; the notice belongs on a form the crawl never reached — so it is kept regardless of what the reviewer thought to mention, with the reviewer's own note appended. Where reading settles it, there is no limitation to show.

## [1.3.1] — Say when the pages weren't read

A re-crawl still showed "whether it covers every processing purpose in plain language is a judgment only you can make" — the v1.2.0 text, from the phrase rules, on a build that has the analyst. The analyst hadn't run, and nothing said so.

### Fixed
- **The fallback is never silent again.** If the reviewer can't be reached, the crawl now records why and the banner leads with **"The pages were not read — findings come from matching expected wording only, which is why some say the judgment is yours."** Previously the whole analysis step was skipped with no trace, so a weaker result was indistinguishable from the stronger one. That is the failure mode this project is otherwise careful about, reintroduced in a new place.
- **The service is re-checked before each crawl.** Health was probed once at page load, so a service started — or given an API key — after the app was open looked unavailable forever. This was the likeliest reason the analyst didn't run: the endpoint is new, and an already-running `node server/index.js` doesn't have it until restarted.
- **Changing strictness no longer discards a read assessment.** `recomputeCrawlFindings()` rebuilt every finding from the phrase rules, silently overwriting anything the analyst had produced. Analyst findings are now kept and flagged as assessed at a different strictness, with the re-crawl offered — re-reading every page is a network call and a bill nobody asked for, and quietly swapping a read assessment for a keyword match is worse than showing it's out of date.

### Added
- The banner reports how many requirements were assessed by reading, and names the model that read them.
- The crawl button reads "Reading the pages…" during analysis, which is the slow half of the run.

## [1.3.0] — The crawl reads what it retrieved

Two things, one small and one that changes what this tool is for.

### Fixed
- **Partial and Fail now share one flow.** The action on a Partial said "Override this result" — framing it as disputing the tool, when what it actually wants is for you to go and check the thing. Anything not passing now offers **"Record your assessment"** and asks *what did you check, and what did you find?* Only a Pass is framed as an override, because only there would you be arguing with a positive result.

### Added
- **The policy analyst.** The crawl retrieved documents and then declined to read them. It matched phrases: it could tell you "lawful basis" appeared in a policy, not whether every processing purpose was mapped to one — so the UI said things like *"whether it covers every processing purpose in plain language is a judgment only you can make."* Retrieving a document and then handing it back unread is a thin offer.

  It now reads. Given the requirement and the text actually retrieved, it returns a verdict with the passages it relied on. Findings merge into the same shape the phrase rules produce, so scoring, overrides and the audit log work unchanged — but each row says which method produced it, because a keyword hit and a read assessment are not the same evidence.

- Requirements capped at Partial **because keyword matching couldn't read** (`gdpr-s1`, `gdpr-s3`) can now reach Pass when the analyst assessed them. Caps that exist because the answer lives outside the document — whether trackers fire before consent, whether a form behind a login carries a notice — survive analysis, because no amount of reading answers those.
- The limitation line is now written per requirement by the reviewer that read it, and headed "What reading the document can't establish" rather than "What a crawl can't tell you".

### The honesty work
This is the first thing in the tool that renders a verdict about a real company's published documents, so the gate is the strictest yet:

- Every "satisfies" or "falls short" must quote the retrieved text, and each quote is checked **verbatim against the page it claims to come from**. A passage found on a different page is re-attributed rather than dropped; a passage found nowhere is dropped.
- A verdict left with no surviving quote is **downgraded to undetermined**, and the downgrade is shown — not silently kept as a fluent assertion.
- Absence claims are permitted only because the full text of the searched pages is in hand, and they render as **"not present in the 4 pages retrieved (listed) — that is a statement about these pages, not about the company."** That distinction is precisely what went wrong in v0.9.0.
- It judges the **document**, never the company. "The policy states a retention period" is checkable and sayable. "The company honours it" is neither, and there is no field to say it.

All requirements for a regulation are judged in one call, with the pages included once — twelve calls would mean paying for the whole policy twelve times. Each finding is gated independently, so batching costs nothing in rigour.

### Convention changed
`CLAUDE.md` said the server retrieves and the client judges, and that website compliance logic must not live server-side. The API key can only live server-side, so there was no version of this that ran in the browser. The rule's *purpose* was fabrication prevention, and that is now served directly by the citation gate rather than structurally by the split. Documented in `CLAUDE.md` and `server/README.md` rather than quietly diverged from.

### Verified
18 new offline checks on the analyst and its gate, plus 13 in the browser covering the Partial/Fail flow fix, the provenance tag, the cap rules and the scoped absence wording. 59 browser checks and 5 server suites in total.

## [1.2.0] — One regulation at a time, a queue to work through, and evidence

The compliance page had become the thing you scroll past. Two full requirement sets stacked on one screen, passing items interleaved with open ones, and no way to work through what was left except by hunting.

### Added
- **One regulation on screen at a time.** The grade stamps are the selector — click GDPR or CCPA to switch. The inactive one dims rather than disappearing, so the other score stays visible.
- **Open work first, passing collapsed at the bottom.** Everything not yet passing is grouped under "Needs attention", worst status first; everything passing goes into a drawer that starts closed. The dual-track split (observable vs. behind-login) still governs scoring and the audit log, but it is now a label on each row rather than a page division — when you are clearing outstanding items, "is this done" matters more than "which track".
- **Focus mode.** "Work through them one at a time" gives you a single requirement, the queue position, and Previous / Skip / Close. Saving an override or submitting an attestation advances automatically. The item renders through exactly the same component as the list, so there is no second code path.
- **Evidence attachments on every requirement**, observable and self-attested alike. Multiple files, plus links.
- **The reviewer reads what it can.** Screenshots, PDFs and text files are sent as real content blocks and assessed against the citation; what it saw is shown separately from what it concluded, per file, with whether it supports or contradicts the requirement.
- On an observable requirement the review is **advisory** — a person's recorded status stands, because a human verdict outranks the reviewer there by design.

### The honest part
Video, Figma files, Google Docs, Office documents and links **cannot be read**, and the app says so before you upload rather than after. They are recorded — name, type, size, date, carried into the audit log for a human to open — and explicitly excluded from the reviewer's findings.

This matters more than it sounds. Accepting a Loom walkthrough and reporting a "review" of it would be inventing evidence about a real compliance posture — the v0.9.0 failure with better manners. So the same gate the other two agents use applies here: the reviewer is told exactly which files it was given and which it was not, and any observation naming a file outside that manifest is dropped before it reaches the UI.

Attachments also now ground an attestation on their own: a screenshot the reviewer actually examined is real evidence, so it counts even when the written description is thin.

### Changed
- localStorage keeps small files (a screenshot fits) and drops the bytes of large ones, shedding all of them under quota pressure. What never gets dropped is the *record* — the audit log still shows a 40 MB video was filed against this requirement on this date, which is the part that matters for provenance. Files whose contents are gone are marked as needing re-attachment rather than silently appearing readable.
- The sidebar disclaimer still said the tool "does not scan or inspect any website" — untrue since v1.0.0. Corrected.
- Per-section "Collapse all / Expand all" is gone; the passing drawer and focus mode replace what it was for.

### Verified
44 browser checks covering the region selector, the grouping, focus-mode navigation, the attachment split and the audit-log record, plus 26 new server checks on the evidence pipeline and its gate.

## [1.1.2] — The agent measured: parity, so link patterns is the default

The navigator shipped in v1.1.0 unmeasured, with a note not to quote a number for it. Here is the number.

### Measured
- On the local fixture, the hint list scores **2/4** and the agent **4/4** — but that fixture was built to exhibit the failure mode, so it flatters the agent by construction.
- On **betterhelp.com**, both return the **same four pages**. The agent found nothing the regex list missed.

betterhelp.com does not have the problem the navigator solves: its privacy content isn't filed under vocabulary the hint list failed to anticipate. One site is one site, and a site that *does* bury its state notice under an unexpected name would still defeat the hint list — so the agent stays, but it is not the default.

Worth recording alongside it: running the eval at all is what surfaced the duplicate-fetch bug fixed in v1.1.1. A cheap regression was costing more real coverage than the agent added.

### Changed
- **Page discovery defaults to link patterns**, not the agent. Running a model by default costs tokens for no measured gain. The agent is one click away in Settings for sites where a crawl comes back thin, and `server/agent/eval.js` is the per-site check.
- README, ROADMAP and the agent README now carry the measured result rather than "unmeasured".

## [1.1.1] — Stop crawling the same page three times

A run against betterhelp.com opened seven pages that were four unique documents: `/privacy` three times, `/terms` twice.

### Fixed
- **Pages are deduped on a canonical key** — host and path, ignoring case, trailing slash, query and fragment — instead of the literal URL. Sites link the same document from the header, from the footer, and again with a tracking parameter attached; `/privacy`, `/privacy/`, `/PRIVACY` and `/privacy?ref=footer` are one page. With a ten-page ceiling, duplicates cost reach directly, which is the same problem depth-2 discovery was added to solve.
- **Redirects are re-checked after the fetch.** `/privacy` and `/privacy/` are two queue entries that land on one page, and the dedupe previously ran only on the URL requested, never on the one actually reached.
- **Already-retrieved pages no longer consume discovery slots.** Each level picks at most four pages; pages already in hand were eligible to fill those slots.
- The same fix applies to the navigator agent, where a duplicate fetch also meant paying for the same page text twice.

### Verified
On a fixture whose homepage links `/privacy` four different ways, the crawl now opens each document once. As a side effect the real policy is reached *earlier* — it no longer sits behind duplicate entries — so it now survives the per-level cap that the DMCA and accessibility pages were crowding.

## [1.1.0] — Agents: navigation and attestation review

Two model-backed agents, both optional, both degrading cleanly to what the app did before. The first replaces a heuristic that needed hand-tuning per site; the second replaces the last remaining simulated verdict in the product.

### Added
- **Navigator agent.** Finds a site's privacy documents by reading it — given one `fetch_page` tool and a goal, it follows the links a person would. It exists because `POLICY_HINTS` only finds vocabulary someone anticipated: a site filing its CCPA supplement under "Additional Disclosures for U.S. State Residents" was invisible to it, and the fix was always a human adding another regex. `crawlWithAgent()` returns exactly the shape `crawl()` returns, so the rule engine consumes either identically.
- **Attestation interviewer.** Replaces the keyword heuristic that counted `pos`/`neg` words and called the result a verdict — the weakest part of the product, covering the half of GDPR/CCPA no crawl can see. It reads the citation, asks the follow-up a regulator would ("does that delete the therapist's session notes, or only the profile?"), and records a status citing the user's own words. Output is shown in four separate registers: the judgment, the basis, the gaps, and the interview itself.
- **Page discovery setting** — Automatic / Navigator agent / Link patterns, in Settings. The two have genuinely different costs, and pinning to link patterns is how you get a free re-crawl.
- **`GET /api/health` reports agent capability**, `GET /api/crawl` takes `?mode=`, and `POST /api/attest` is new. The service still starts and still crawls with no `node_modules` and no API key.
- Test suites for both agents and the HTTP surface (`npm test` in `server/agent`), plus a browser smoke test (`ui.test.js`). All run offline against a scripted stub — no key, no network.

### Changed
- **Attestations record which reviewer produced them**, in the UI and in the exported audit log. A model interview and a keyword count are not the same evidence, and whoever reads the log later needs to know which they're looking at.
- **Changing strictness no longer silently re-runs model-reviewed attestations.** That would mean a network call the user didn't ask for and a bill they didn't expect, and quietly changing a recorded verdict is worse than showing it's out of date. They're flagged, with a re-review button. Keyword-reviewed ones still re-evaluate as before.
- The audit log's "assessment method" line said no website was scanned. That has been untrue since v1.0.0; it now reports the crawl and which discovery method chose the pages.
- README's opening claim that the tool "performs no automated inspection of anything" was likewise stale. Corrected.

### The honesty constraint
An autonomous loop is exactly the kind of thing that regresses v0.9.0. Asked to find privacy pages, a model will report "I reviewed the privacy policy and found no opt-out link" when what happened was a 404; asked to review an attestation, it will assert product facts the user never stated. Prompting against either is not a control, so both agents are gated structurally:

- Neither has a field in which to express the bad output. `report_pages` has nowhere to put a compliance verdict; `basis` takes quotes, not conclusions.
- Every claim is checked against a log before it leaves the module. A reported URL absent from the fetch log is dropped; a quote absent from what the user wrote is dropped. If no quote survives, the attestation is marked **ungrounded** and its confidence forced to Low.
- Budgets are enforced in code, not by asking. Past the follow-up limit the `ask_followup` tool is simply not offered.

### Verified
44 offline checks across the two agents, 12 more across the HTTP surface covering every degradation path (no SDK, no key, unreachable API), and 22 in a real browser including that model output is escaped rather than injected into `innerHTML`.

**Not verified:** whether either model actually outperforms the heuristic it replaces. Every mechanism is tested; the judgment is not. `server/agent/eval.js` measures the navigator against the link-pattern baseline — the heuristic scores 2/4 on the local fixture — but running it needs an API key. No number should be quoted for the agent side until someone has produced one.

## [1.0.1] — Crawl reaches sub-policies

Diagnosing a real run against a live site: the crawl retrieved only two pages, because the homepage linked just "Privacy Policy" and "Terms & Conditions". The HTML was complete (51 links) — so this was not a rendering or bot-protection problem, it was reach.

### Changed
- **Discovery now goes two levels deep.** Sites routinely keep their California notice, cookie policy and opt-out pages one click *inside* the privacy policy rather than on the homepage — precisely where several CCPA requirements are evidenced. A hard ceiling of 10 pages keeps this a targeted retriever rather than a spider.
- **More link hints**: `terms`, `notice`, `opt-out`, `california`, `consumer rights`, `limit the use`, `sensitive information`. Terms pages were previously skipped entirely.
- **You can start from a specific page.** Entering `betterhelp.com/privacy` now crawls that page instead of being reduced to the bare domain — useful when you already know where a document lives and don't want to depend on discovery.

### Verified
Against a fixture shaped like the real site (homepage links only privacy + terms; California notice and cookie policy linked only from the privacy page): retrieval went from **2 pages to 5**, and requirements the crawl could determine went from partial coverage to **12 of 12** — with non-discrimination, notice-at-collection and sensitive-PI findings all coming from the depth-2 California notice that was previously unreachable.

## [1.0.0] — Real website crawling

The observable track is automated again — this time by actually fetching the site.

### Added
- **`server/` — a dependency-free Node crawl service.** A browser cannot read another origin's pages (same-origin policy blocks it, deliberately), so retrieval has to happen outside the browser. `node server/index.js`, no install step. The app detects it automatically and shows a **Crawl site** action; when it isn't running the app works exactly as before, with every requirement assessed by hand.
- **Findings evidenced by real quotes.** Each crawled result carries the sentence it matched, the URL it came from, and whether the match was exact or a paraphrase. Hovering "evidence" shows them; you can open the URL and check.
- **The strictness dial now governs live site text.** Crawl rules are phrases rather than regexes, matched through the same matcher as self-attestations — so a footer link reading *"Do Not Sell My Info"* passes at Lenient and is flagged at Careful/Letter-of-the-law for omitting "Personal". Changing the dial re-judges stored crawl text without re-fetching.
- **HTTPS fallback is reported, not hidden.** If a bare domain doesn't answer over HTTPS the crawl retries over HTTP and says so — a site not serving HTTPS is worth reviewing in its own right.

### Design constraints held
- **The server retrieves; the client judges.** No compliance logic lives in `server/`. A service that only reports what it fetched cannot invent a finding — the failure mode v0.9.0 existed to correct.
- **Undeterminable stays Unassessed, never Fail.** No policy page retrieved, or the site refused the request, means the requirement is left for a person. "We couldn't look" and "it isn't there" are different claims, and only one of them is a finding.
- **Every requirement states what a crawl can't tell you.** Finding "Standard Contractual Clauses" in a policy proves the phrase is there, not that the safeguards are executed. Requirements where presence is checkable but sufficiency isn't are capped at Partial.
- Tracker scripts are reported; whether they fire *before* consent is explicitly flagged as not determinable by fetching.

### Security
- SSRF protections on every fetch: http/https only, private/loopback/link-local/CGNAT/reserved addresses refused (including cloud metadata at `169.254.169.254`), **and every redirect hop re-validated** since a public URL can redirect inward. 12s timeout, 2 MB cap, 5 redirects, 4 policy pages max. Binds to loopback; not hardened for public hosting.

### Notes
- **This breaks the project's founding "no backend" constraint**, which `CLAUDE.md` and `SPEC.md` both stated. That was a deliberate, requested trade: in-app crawling is impossible without it. The static app remains fully functional standalone, so the backend is additive rather than required.
- Verified end-to-end against a local fixture site — real fetching, policy discovery, text extraction, evidence quoting, strictness behaviour, and SSRF refusals. **Not yet verified against a live public site**, because this development environment's egress proxy blocks external hosts; that check has to happen on a normal network.

## [0.9.0] — Remove every fabricated result

A user reported the tool as "buggy" for not properly scanning a real privacy policy and reporting things as missing that were plainly present. It wasn't a scanning bug: **the app never scanned anything.** Scanned statuses came from `seededRandom(domain)` — a hash of the domain string — and the accompanying "evidence" was a hardcoded string. For `gdpr-s3`, that string read *"(No privacy policy found at /privacy or linked from the footer)"*, displayed whenever the hash landed on Fail, for any site.

That is a fabricated factual claim about a real company's real website, dressed in the visual language of a real audit (progress steps reading "Reading privacy policy & terms…", an "evidence" hover quoting a snippet and citing a page location). The "Simulated evidence" label in the tooltip was not remotely enough. This release removes the capacity to fabricate rather than labelling it better.

### Removed
- **The simulated crawler**, and with it `seededRandom`, `statusFor`, and `runScan`. Creating an entry no longer pretends to scan; it opens a record.
- **All fabricated evidence snippets** (12 blocks) that asserted specific observations about sites nobody looked at.
- **The Privacy Trust score** — five category scores generated from the same pseudo-random source.
- **Competitor comparison scores** — simulated numbers displayed beside real company names, which is a claim about those companies the tool cannot stand behind. Competitors can still be tracked by name.

### Changed
- **Publicly-observable requirements are now assessed by a person.** Each starts as **Unassessed**, shows the criteria for Partial and Fail phrased as *"counts as"* rather than as findings, and is recorded through the existing explanation-required control. Nothing is claimed until someone claims it.
- **Unattested behind-login items now report Unassessed, not Fail.** They already earned zero credit; the change is that the tool no longer asserts non-compliance nobody verified. Scores are unaffected.
- **A final grade requires every requirement assessed**, across both tracks — previously only the checklist gated it, because the observable track was auto-filled with simulated results. Progress chips show how many of each regulation's requirements have a recorded status.
- **Potential-exposure figures exclude unassessed requirements.** Unknown is not a finding, so it doesn't attract a comparable fine.
- A persistent banner on every entry states plainly that nothing is automatically detected, and the audit log and PDF report both record that no website was inspected.

### Notes
- **The score's meaning changed.** It was never a measurement, but it now visibly reflects only what you've recorded — an untouched entry reads 0/100 with everything Unassessed, instead of a confident-looking C+ assembled from a hash.
- Nothing was lost from saved sessions: overrides, attestations, and notes all survive, and no storage-version bump was needed.
- The requirement set, citations, real enforcement cases, strictness dial, persistence, and audit log are unchanged — the parts of this tool grounded in something real were always the manual ones, and they're now the whole product.

## [0.8.0] — Strictness dial, exportable audit log, repo upload retired

Ships the three roadmap items that needed no backend.

### Added
- **Strictness dial** (Settings) — one control for how literally a finding must match the letter of the law, from "Lenient" to "Letter of the law." The canonical case: whether a footer link reading *"Do Not Sell My Information"* satisfies a statute that says *"Do Not Sell My **Personal** Information."* Strict flags it, lenient accepts it, and the posture is now the user's call rather than a hardcoded threshold — it drives the checklist reviewer's paraphrase tolerance (`STRICTNESS_LEVELS` in data.js), with paraphrase matching disabled entirely at the strictest setting.
  - Changing the dial **re-evaluates existing self-attestations** that were judged from a written description, so a recorded status reflects the posture you're actually using. Manual overrides are never touched (an explicit human verdict outranks the reviewer at any strictness), and `attestedAt` is preserved so staleness still tracks when a person attested, not when we recomputed.
- **Exportable audit log** (`↓ Export audit log`) — a printable/PDF record of provenance behind the current posture: every assessment run, each requirement's status and where it came from, every attestation with confidence and timestamp, every override with its stated reason, and any requirement overridden repeatedly. Distinct from the existing summary report — that one is for stakeholders, this is for "on what basis did you conclude that, and when?"

### Changed
- **Severity weighting is no longer user-adjustable.** The Settings slider it occupied now controls strictness. Severity ("how bad is this") and strictness ("how literally do we read this") are genuinely different questions, and two sliders would have muddled both — weights are now fixed at `DEFAULT_SEV_WEIGHT`.
- Persisted state now stores `strictness` in place of `sevWeights`. No storage-version bump was needed: the loader merges known fields, so existing saved sessions keep their sites, overrides, and attestations and simply pick up the default strictness.

### Removed
- **The codebase-upload entry path is retired.** Shipping a company's source into a web tool doesn't survive most security reviews, even though the analysis never left the machine. The New Scan form is back to a single URL entry, `codeaudit.js` is no longer loaded, and its rules moved into that file so no dead data sits in `data.js`.
  - Entries audited before the retirement **remain viewable and still count toward their scores**, carrying a note explaining the retirement. Destroying existing findings would have thrown away audit history, which is the opposite of what a compliance tool should do.
  - The engine is preserved in-tree, unloaded, because the analysis was never the problem — only the ingestion gesture was. A future GitHub App or local CLI would reuse it largely as-is.

### Notes — honest consequence
- This is a **net reduction in what the product does for real**. The source audit was the only non-simulated analysis and the only thing that auto-attested behind-login requirements; without it, new entries are entirely simulated again and that attestation burden returns. `README.md`'s real-vs-mocked table and `CLAUDE.md` are updated to say so plainly rather than let the docs imply a capability that's gone. Restoring a real analysis path is now the first open item under Later in `ROADMAP.md`.
- The strictness dial's practical effect is mostly moving items between Pass and Partial, since the reviewer's verdict space is Pass/Partial/Fail — a wording deviation makes something partially satisfied rather than failing outright.

## [0.7.0] — Manual work persists across sessions; re-audit an existing entry

### Added
- **Your manual work is now saved between sessions.** Overrides and their explanations, self-attested checklist answers, typed drafts and screenshots, manual countries/competitors, and severity weights are stored in the browser (`js/storage.js`) and restored on load — so auditing the same product again weeks later doesn't mean re-entering any of it.
- **Re-audit an existing source-audited entry.** Code entries get a "Re-audit (choose folder)" action that appends a new scan to the *same* docket entry instead of creating a duplicate. Overrides are preserved untouched; hand-written attestations are preserved; attestations that were *derived* from the previous audit are refreshed against the new evidence, so derived data tracks the code instead of going quietly stale.
- **Stale-override detection.** If the underlying result moves between runs, the override shows a warning naming both the status it was recorded against and the current one ("recorded when the underlying result was Pending; the latest run says Pass — worth re-checking"). The override is never auto-cleared; the call stays yours.
- **Export / import / clear** in the Settings dropdown, plus a readout of how much is stored. Export produces a versioned JSON file — useful as a backup, for moving machines, and as groundwork for the audit-trail package in ROADMAP's longer-term section.

### Notes
- **Local-only, deliberately.** This project has no backend, and compliance notes about a real company shouldn't be transmitted anywhere without an explicit decision — `SPEC.md` Phase 1 is where server-side accounts/history belong; this is the honest no-backend version. The Settings panel states this in-product.
- Transient UI state (scan progress, open panels, new-scan form drafts) is deliberately **not** persisted — restoring `scanning: true` would rehydrate a stuck progress view with no audit running behind it.
- Saves are debounced (~400ms) so the frequent re-renders during a source audit don't each trigger a write, with an immediate flush on tab close/hide — without that flush, a note typed just before closing the tab would be lost inside the debounce window (caught in testing).
- Quota is handled honestly: if the payload is too large, screenshots are dropped first (descriptions are the part that took effort) and the user is told; if it still fails, the UI says so rather than silently losing work.

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
