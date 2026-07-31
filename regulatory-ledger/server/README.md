# Crawl service

A small local service that fetches a site's public pages so the app can check them.

## Why this exists

A browser cannot read another site's pages. When JavaScript on the app's page calls `fetch('https://example.com/privacy')`, the browser blocks reading the response unless that server explicitly opts in with an `Access-Control-Allow-Origin` header naming your origin. Sites don't do that for arbitrary third parties, and they shouldn't — the restriction is what stops any page you open from reading your webmail or your intranet.

So retrieval has to happen somewhere without that restriction. This is that somewhere.

## Running it

```bash
node server/index.js
```

Node 18+ required (it uses built-in `fetch`). **No dependencies, no install step.** Then open `regulatory-ledger.html` — it detects the service automatically and shows a **Crawl site** action. If the service isn't running, the app still works; every requirement is simply assessed by hand.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Port to listen on |
| `HOST` | `127.0.0.1` | Bind address — loopback by default |
| `ALLOW_PRIVATE_HOSTS` | unset | **Test only.** Disables the private-address guard so the test suite can crawl a local fixture. Never set this on a shared machine. |

## What it does and doesn't do

It **retrieves**: the starting page, then privacy/legal/cookie/terms pages linked from it, then one further level of policy pages linked from *those* — capped at 10 pages total. For each it returns the readable text, links, and script sources.

Two levels matter in practice. Sites commonly link only "Privacy Policy" from the homepage and keep the California notice, cookie policy and opt-out pages one click deeper — which is exactly where several CCPA requirements are evidenced. Depth stops at two so this stays a targeted retriever rather than a general-purpose spider.

You can also start from a specific page (`betterhelp.com/privacy`) rather than a bare domain, which skips link discovery entirely when you already know where a document lives.

It **does not judge**. No compliance logic lives here. The app applies the requirement rules and your strictness setting to what was actually retrieved. That split is deliberate: a server that only reports what it fetched cannot invent a finding, which is the failure this project already had to correct once (see CHANGELOG v0.9.0).

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
  -> {"ok":true,"service":"regulatory-ledger-crawler","version":"1.0.0"}

GET /api/crawl?url=example.com
  -> {"ok":true,"target":"https://example.com/","fetchedAt":...,"pages":[...],"notes":[...]}
  -> {"ok":false,"error":"Could not retrieve https://… — the hostname did not resolve."}
```

A failed crawl returns `ok:false` with a readable reason. The app surfaces that reason and leaves the requirements unassessed rather than presenting a failure to fetch as a compliance finding.

If no scheme is given, `https` is tried first; if that can't connect, the crawl falls back to `http` and **notes it in the results**, since a site not serving HTTPS is itself worth reviewing.
