# Crawl service

A small local service that fetches a site's public pages so the app can check them.

## Why this exists

A browser cannot read another site's pages. When JavaScript on the app's page calls `fetch('https://example.com/privacy')`, the browser blocks reading the response unless that server explicitly opts in with an `Access-Control-Allow-Origin` header naming your origin. Sites don't do that for arbitrary third parties, and they shouldn't — the restriction is what stops any page you open from reading your webmail or your intranet.

So retrieval has to happen somewhere without that restriction. This is that somewhere.

## Running it

```bash
node server/index.js
```

Node 18+ required (it uses built-in `fetch`). **The core has no dependencies and no install step.** Then open `regulatory-ledger.html` — it detects the service automatically and shows a **Crawl site** action. If the service isn't running, the app still works; every requirement is simply assessed by hand.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Port to listen on |
| `HOST` | `127.0.0.1` | Bind address — loopback by default |
| `ANTHROPIC_API_KEY` | unset | Enables the two agents (see below). Without it the service still crawls. |
| `AGENT_MODEL` | `claude-opus-5` | Model for the agents |
| `WATCH_STATE_FILE` | `server/.watch-state.json` | Where legislation snapshots are kept. Without a writable path every check looks like a first check and no change can be detected — the service says so rather than staying quiet. |
| `ALLOW_PRIVATE_HOSTS` | unset | **Test only.** Disables the private-address guard so the test suite can crawl a local fixture. Never set this on a shared machine. |

### Budgets

Every limit is a judgement call about someone else's site rather than a law of nature, so all are overridable. Raise them deliberately — each extra page is another request to a real server.

| Variable | Default | What it caps |
|---|---|---|
| `CRAWL_MAX_PAGES` | `10` | Total pages fetched per crawl, link-pattern mode |
| `CRAWL_PAGES_PER_LEVEL` | `4` | Pages picked per discovery level — **usually the one that actually binds** |
| `CRAWL_TIMEOUT_MS` | `12000` | Per-request timeout |
| `CRAWL_MAX_BYTES` | `2000000` | Per-page body cap |
| `AGENT_MAX_PAGES` | `12` | Pages the navigator agent may open |
| `AGENT_MAX_TURNS` | `16` | Navigator model round-trips |
| `ANALYST_TOTAL_CHARS` | `90000` | **How much retrieved text the reviewer actually reads** |
| `ANALYST_PAGE_CHARS` | `24000` | Per-page share of that budget |

**Raise `ANALYST_TOTAL_CHARS` alongside the page counts.** They are independent: fetching thirty pages while the reviewer still reads ninety thousand characters means the extra pages are retrieved and then truncated away before anyone looks at them — a crawl that appears thorough and isn't. The app reports which pages were cut and by how much rather than letting a partial read pass for a complete one.

Two cheaper moves before raising anything:

- **Start from a specific page.** Entering `example.com/privacy` crawls that document directly and skips discovery entirely.
- **Try the navigator agent** (Settings → Page discovery). It opens up to 12 pages and chooses them by reading, rather than spending the per-level budget on whatever matched first.

## The optional agents

Two capabilities need a model, and a static file can't hold an API key — the second reason this service exists. They live in [`agent/`](./agent/README.md), which has its own `package.json`, and are `require`d lazily inside their handlers so the core stays dependency-free:

- **Navigator** — finds a site's privacy documents by reading it, instead of matching link text against a hardcoded regex list. Reaches pages the pattern list can't, because it doesn't need to have anticipated the site's vocabulary.
- **Attestation interviewer** — reviews the user's written description of a behind-login flow against the citation, asking follow-up questions before recording a status.

Both are off unless `ANTHROPIC_API_KEY` is set and `npm install` has been run in `agent/`. The service prints which are enabled at startup, and `/api/health` reports it so the app can offer the right actions. When a model call fails mid-crawl, discovery falls back to link patterns and **says so in the crawl notes** — which method chose a set of pages is provenance for every finding derived from them.

## What it does and doesn't do

It **retrieves**: the starting page, then privacy/legal/cookie/terms pages linked from it, then one further level of policy pages linked from *those* — capped at 10 pages total. For each it returns the readable text, links, and script sources.

Two levels matter in practice. Sites commonly link only "Privacy Policy" from the homepage and keep the California notice, cookie policy and opt-out pages one click deeper — which is exactly where several CCPA requirements are evidenced. Depth stops at two so this stays a targeted retriever rather than a general-purpose spider.

You can also start from a specific page (`betterhelp.com/privacy`) rather than a bare domain, which skips link discovery entirely when you already know where a document lives.

It **judges documents, never companies**, and that distinction carries the whole design.

Retrieval and phrase matching are unchanged: the app still applies the requirement rules and your strictness setting to what was fetched. What the service now also does, when a model is configured, is *read* those pages — `POST /api/analyze` measures the retrieved text against each requirement and returns a verdict with the passages it relied on.

That was originally forbidden here ("the server retrieves, the client judges"), so it is worth saying plainly what changed and what didn't. The purpose of that rule was fabrication prevention — a service that only reports what it fetched cannot invent a finding about a real company. That purpose is now served directly rather than structurally:

- Every "satisfies" or "falls short" verdict must quote the retrieved text, and each quote is checked verbatim against the page it claims to come from. Quotes that aren't there are dropped; a verdict left with none is downgraded to *cannot determine*, never kept as a bare assertion.
- An absence claim is permitted only because the full text of the searched pages is in hand, and it is reported — and rendered — as "not present in these N pages", never as "the company does not do this". That distinction is exactly what went wrong in v0.9.0.
- "The policy states a retention period" is checkable. "The company honours it" is not, and there is no field in the tool schema to say it.

Two other judgments live here, both narrow. `POST /api/attest` reviews **the user's own written description** of a behind-login flow against the citation — it has no access to the product and observes nothing, and every attestation must cite the user's own words verbatim or it is marked ungrounded. The navigator agent decides *which pages to open*, never what they mean. See [`agent/README.md`](./agent/README.md).

What a fetch genuinely cannot establish, and where the app says so:

- Whether trackers fire **before** consent, or whether "Reject All" is as easy as "Accept All". That needs a real browser session driving the page.
- Whether a described practice actually works — that a policy says "Standard Contractual Clauses" doesn't mean they're executed.
- Anything behind a login, or content rendered only after interaction.

When a page can't be retrieved at all, the affected requirements come back **Unassessed**, never Fail. "We couldn't look" and "it isn't there" are different claims.

## Safety

The service fetches URLs on request, so it takes some care not to become a tool for reaching things only it can see:

- Only `http`/`https`.
- Hostnames resolving to private, loopback, link-local, CGNAT or reserved addresses are refused — including cloud metadata endpoints at `169.254.169.254`.
- **Every redirect hop is re-validated**, because a public URL can redirect inward.
- 12s timeout per request, 2 MB body cap, max 5 redirects, max 4 policy pages.

It binds to loopback and holds no credentials or user data. It is meant to run locally alongside the app; it has not been hardened for public hosting, and putting it on a public address would expose an open fetch proxy.

## Endpoints

```
GET /api/health
  -> {"ok":true,"service":"regulatory-ledger-crawler","version":"1.1.0",
      "agent":{"available":false,"model":null,"reason":"ANTHROPIC_API_KEY is not set…"}}

GET /api/crawl?url=example.com&mode=auto|agent|links
  -> {"ok":true,"target":"https://example.com/","fetchedAt":...,"pages":[...],
      "notes":[...],"discovery":{"method":"agent","model":"…","opened":6,"selected":4}}
  -> {"ok":false,"error":"Could not retrieve https://… — the hostname did not resolve."}

POST /api/analyze  {requirements:[{id,code,text,layman,…}], pages:[{url,title,text}], strictness}
  -> {"ok":true,"findings":{"gdpr-s1":{"verdict":"satisfies","citations":[…],
      "reasoning":"…","beyondTheDocument":"…","pagesSearched":[…]}},"missing":[]}
  -> {"ok":false,"error":"…","fallback":"phrases"}

POST /api/proposal {requirements:[…], proposalText, attachments, context, strictness}
  -> {"ok":true,"findings":{"gdpr-c2":{"verdict":"would_fall_short","basis":[…],
      "gaps":[…],"evidenceToAttest":[…],"assessment":"…"}},"outOfScope":"…"}

POST /api/recommend {requirements:[{id,code,text,status,provenance,…}], context, strictness}
  -> {"ok":true,"recommendations":{"gdpr-s1":{"headline":"…","steps":[…],
      "whyThisSatisfies":"…","evidenceAfterwards":[…],"effort":"small"}}}

GET  /api/legislation/watches
  -> {"ok":true,"suggested":[…],"tracked":[…],"lastCheckedAt":…}
POST /api/legislation/check   {watches?:[{id,label,url,regions}]}
  -> {"ok":true,"results":[{id,ok,changed,added:[…],removed:[…]}],
      "changedCount":1,"failedCount":0}

POST /api/attest   {item:{code,text,layman,guidance}, description, hasScreenshot, turns, strictness}
  -> {"ok":true,"needsFollowUp":true,"followUpQuestion":"…","whyItMatters":"…"}
  -> {"ok":true,"needsFollowUp":false,"status":"Partial","basis":[…],"gaps":[…],"grounded":true}
  -> {"ok":false,"error":"…","fallback":"keyword"}
```

`mode` defaults to `auto`: the agent when it's available, link patterns otherwise. `discovery` records which one ran.

`/api/attest` holds no state — the interview transcript is passed in on every call and lives in the browser. When it returns `ok:false` the app falls back to its keyword heuristic and labels the result as such.

A failed crawl returns `ok:false` with a readable reason. The app surfaces that reason and leaves the requirements unassessed rather than presenting a failure to fetch as a compliance finding.

The same applies to the agents: an unavailable or failing model degrades to the older behaviour and says which reviewer or discovery method actually ran. A worse answer presented as the same answer would be the failure this project already had to correct once.

If no scheme is given, `https` is tried first; if that can't connect, the crawl falls back to `http` and **notes it in the results**, since a site not serving HTTPS is itself worth reviewing.
