'use strict';
/* ============================================================
   CRAWLER — retrieval only
   ============================================================
   This module's job is narrow on purpose: fetch a site's public pages and
   return what they actually contain. It makes no compliance judgments.

   That split is deliberate. The browser app decides what a page's contents
   mean, applying the user's strictness setting; the server only reports
   text, links, and scripts it genuinely retrieved. Keeping interpretation
   out of here means the server can never invent a finding — the failure
   mode that made v0.9.0 necessary. */

const dns = require('node:dns').promises;
const net = require('node:net');

const FETCH_TIMEOUT_MS = 12000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const MAX_POLICY_PAGES = 4;      // per discovery level
const MAX_TOTAL_PAGES = 10;      // hard ceiling across the whole crawl
const USER_AGENT = 'RegulatoryLedger/1.0 (compliance self-audit; +https://github.com/aggershon1/compliance)';

/* ---- SSRF protection --------------------------------------------------
   This server fetches URLs on request, so without checks it could be used
   to reach things only it can see — cloud metadata endpoints, internal
   admin panels, localhost services. Every hop of every redirect is
   re-validated, because a public URL can redirect inward. */
function isBlockedIp(ip){
  if(net.isIPv4(ip)){
    const [a,b] = ip.split('.').map(Number);
    if(a === 10) return true;                          // private
    if(a === 127) return true;                         // loopback
    if(a === 0) return true;
    if(a === 169 && b === 254) return true;            // link-local incl. cloud metadata
    if(a === 172 && b >= 16 && b <= 31) return true;   // private
    if(a === 192 && b === 168) return true;            // private
    if(a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
    if(a >= 224) return true;                          // multicast / reserved
    return false;
  }
  const low = ip.toLowerCase();
  if(low === '::1' || low === '::') return true;
  if(low.startsWith('fe80') || low.startsWith('fc') || low.startsWith('fd')) return true;
  if(low.startsWith('::ffff:')) return isBlockedIp(low.slice(7));
  return false;
}

/* Test-only escape hatch. Crawling loopback/private addresses is exactly
   what the guard above prevents, so this stays off unless explicitly asked
   for, and is only used to point the crawler at a local fixture site in
   the test suite. Never set this on a shared or public deployment. */
const ALLOW_PRIVATE_HOSTS = process.env.ALLOW_PRIVATE_HOSTS === '1';

async function assertSafeUrl(u){
  const url = new URL(u);
  if(url.protocol !== 'http:' && url.protocol !== 'https:'){
    throw new Error(`Only http/https URLs can be crawled (got ${url.protocol}).`);
  }
  if(ALLOW_PRIVATE_HOSTS) return url;
  const host = url.hostname.toLowerCase();
  if(host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')){
    throw new Error('Refusing to crawl a local/internal hostname.');
  }
  let addrs;
  try{ addrs = await dns.lookup(host, {all:true}); }
  catch(e){ throw new Error(`Could not resolve ${host}.`); }
  for(const a of addrs){
    if(isBlockedIp(a.address)) throw new Error(`Refusing to crawl ${host} — it resolves to a private or reserved address.`);
  }
  return url;
}

/* ---- Fetching ---------------------------------------------------------
   Redirects are followed manually so each hop can be safety-checked, and
   the body is read through a reader so an enormous page can't exhaust
   memory. */
async function fetchPage(rawUrl){
  let current = rawUrl;
  for(let hop = 0; hop <= MAX_REDIRECTS; hop++){
    const url = await assertSafeUrl(current);
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), FETCH_TIMEOUT_MS);
    let res;
    try{
      res = await fetch(url.href, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml'},
      });
    } catch(err){
      /* Node's bare "fetch failed" tells the user nothing actionable, and
         this is the error they'll hit most (typo, DNS, TLS, or a site
         refusing an unknown agent). Say what was attempted and why. */
      const cause = (err && err.cause && err.cause.code) || (err && err.name) || '';
      const hint = cause === 'ENOTFOUND' ? ' — the hostname did not resolve.'
        : cause === 'ECONNREFUSED' ? ' — nothing accepted the connection on that port.'
        : /CERT|TLS|SSL/i.test(String(cause)) ? ' — the TLS certificate could not be verified.'
        : err && err.name === 'AbortError' ? ` — no response within ${FETCH_TIMEOUT_MS/1000}s.`
        : '';
      throw new Error(`Could not retrieve ${url.href}${hint}${cause && !hint ? ` (${cause})` : ''}`);
    } finally { clearTimeout(timer); }

    if(res.status >= 300 && res.status < 400){
      const loc = res.headers.get('location');
      if(!loc) return {url: url.href, status: res.status, html: '', truncated:false};
      current = new URL(loc, url.href).href;
      continue;
    }

    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if(!ctype.includes('html') && !ctype.includes('text/plain') && ctype !== ''){
      return {url: url.href, status: res.status, html: '', truncated:false, skipped:`not HTML (${ctype})`};
    }

    let received = 0, chunks = [], truncated = false;
    if(res.body){
      const reader = res.body.getReader();
      while(true){
        const {done, value} = await reader.read();
        if(done) break;
        received += value.length;
        if(received > MAX_BYTES){ truncated = true; try{ await reader.cancel(); }catch(e){} break; }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks.map(c=>Buffer.from(c)));
    return {url: url.href, status: res.status, html: buf.toString('utf8'), truncated};
  }
  throw new Error('Too many redirects.');
}

/* ---- Extraction -------------------------------------------------------
   Deliberately regex-based rather than a DOM parser: it keeps this server
   dependency-free, and the app only needs readable text plus links and
   script sources. It is not a correct HTML parser and doesn't pretend to
   be — malformed markup degrades to slightly messier text, which is
   acceptable for keyword evidence and is why quoted evidence always
   carries the source URL for a human to verify. */
const ENTITIES = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&apos;':"'",'&nbsp;':' ','&mdash;':'—','&ndash;':'–','&rsquo;':'’','&lsquo;':'‘','&ldquo;':'“','&rdquo;':'”'};
function decodeEntities(s){
  return s.replace(/&[a-z#0-9]+;/gi, m => {
    if(ENTITIES[m] !== undefined) return ENTITIES[m];
    const num = /^&#(\d+);$/.exec(m);
    if(num) { try { return String.fromCodePoint(Number(num[1])); } catch(e){ return m; } }
    return m;
  });
}
function extractText(html){
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n\s*/g, '\n').trim();
}
function extractTitle(html){
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g,' ').trim().slice(0,200) : '';
}
function extractLinks(html, baseUrl){
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m = re.exec(html)) !== null){
    const href = m[2] || m[3] || m[4] || '';
    const text = decodeEntities(m[5].replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
    if(!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) continue;
    let abs;
    try{ abs = new URL(href, baseUrl).href; }catch(e){ continue; }
    out.push({text: text.slice(0,160), href: abs});
    if(out.length > 800) break;
  }
  return out;
}
function extractScripts(html){
  const out = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while((m = re.exec(html)) !== null){
    const src = m[2] || m[3] || m[4] || '';
    if(src) out.push(src.slice(0,300));
    if(out.length > 200) break;
  }
  return out;
}

/* Which linked pages are worth fetching for compliance language. */
const POLICY_HINTS = [
  /privacy/i, /data[-\s]?protection/i, /cookie/i, /do[-\s]?not[-\s]?sell/i,
  /your[-\s]privacy[-\s]choices/i, /legal/i, /gdpr/i, /ccpa/i,
  /terms/i, /notice/i, /opt[-\s]?out/i, /california/i, /consumer[-\s]rights/i,
  /limit[-\s]the[-\s]use/i, /sensitive[-\s]information/i,
];
/* Sites link the same document several ways: /privacy and /privacy/, with a
   tracking query attached, from the header and again from the footer, on
   www and on the apex. Comparing literal URLs treats those as different
   pages, so the page budget gets spent fetching one policy three times —
   which is the same loss of reach that made depth-2 discovery necessary.

   Dedupe on host + path instead, case- and trailing-slash-insensitive, and
   ignore the query and fragment. Two policy pages distinguished only by a
   query string would collapse together, which is a trade worth making: it
   is far rarer than the same page linked three ways. */
function canonicalKey(rawUrl){
  try{
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '').toLowerCase() || '/';
    return host + path;
  }catch(e){
    return String(rawUrl);
  }
}

/* `exclude` holds the canonical keys already fetched or queued, so pages we
   have in hand don't consume discovery slots. */
function discoverPolicyLinks(links, baseUrl, exclude){
  const base = new URL(baseUrl);
  const seen = new Set();
  const picked = [];
  for(const l of links){
    let u;
    try{ u = new URL(l.href); }catch(e){ continue; }
    if(u.hostname !== base.hostname) continue;        // stay on the site
    const hay = `${l.text} ${u.pathname}`;
    if(!POLICY_HINTS.some(re => re.test(hay))) continue;
    const key = canonicalKey(u.href);
    if(seen.has(key)) continue;
    if(exclude && exclude.has(key)) continue;
    seen.add(key);
    picked.push({url: u.href, linkText: l.text});
    if(picked.length >= MAX_POLICY_PAGES) break;
  }
  return picked;
}

/* Returns the URL to try plus whether the scheme was assumed. The app
   stores bare domains, so most requests arrive without one; we assume
   https (correct and safer) and only fall back if that can't connect. */
function normalizeTarget(input){
  let t = String(input || '').trim();
  if(!t) throw new Error('No URL provided.');
  const hadScheme = /^https?:\/\//i.test(t);
  if(!hadScheme) t = 'https://' + t;
  return {url: t, schemeAssumed: !hadScheme};
}

async function crawl(target){
  const startedAt = Date.now();
  const {url: home, schemeAssumed} = normalizeTarget(target);
  const pages = [];
  const notes = [];

  let homeRes;
  try{
    homeRes = await fetchPage(home);
  }catch(err){
    /* Only fall back when we were the ones who assumed https. That a site
       is reachable over http but not https is itself worth surfacing —
       it's a security posture signal, not just a retrieval detail. */
    if(!schemeAssumed) throw err;
    const httpUrl = home.replace(/^https:\/\//i, 'http://');
    homeRes = await fetchPage(httpUrl);
    notes.push('This site did not respond over HTTPS; the crawl fell back to plain HTTP. Serving a site without HTTPS is itself worth reviewing.');
  }
  const homeLinks = extractLinks(homeRes.html, homeRes.url);
  pages.push({
    role: 'homepage',
    url: homeRes.url,
    status: homeRes.status,
    title: extractTitle(homeRes.html),
    text: extractText(homeRes.html),
    links: homeLinks,
    scripts: extractScripts(homeRes.html),
    truncated: homeRes.truncated,
  });
  if(homeRes.truncated) notes.push('The homepage was larger than the size cap and was truncated.');

  /* Two levels, deliberately. Sites routinely link only "Privacy Policy"
     from the homepage and keep the California notice, cookie policy and
     opt-out pages one click further in — a single level misses exactly the
     documents several CCPA requirements depend on. Depth stops at two:
     enough to reach real sub-policies, not so much that this becomes a
     general-purpose spider hammering someone's site. */
  const seenUrls = new Set(pages.map(p => canonicalKey(p.url)));
  const policyLinks = discoverPolicyLinks(homeLinks, homeRes.url, seenUrls);
  if(policyLinks.length === 0){
    notes.push('No privacy/legal links were found on the homepage, so policy text could not be retrieved. Requirements that depend on policy wording are reported as not determinable rather than failing.');
  }
  let frontier = policyLinks;
  for(let depth = 0; depth < 2 && frontier.length; depth++){
    const nextFrontier = [];
    for(const pl of frontier){
      if(pages.length >= MAX_TOTAL_PAGES) break;
      const key = canonicalKey(pl.url);
      if(seenUrls.has(key)) continue;
      seenUrls.add(key);
      try{
        const r = await fetchPage(pl.url);
        /* Redirects are the other half of this: /privacy and /privacy/ are
           two queue entries that land on one page. Check again on the URL
           we actually ended up at, not just the one we asked for. */
        const finalKey = canonicalKey(r.url);
        if(finalKey !== key){
          if(seenUrls.has(finalKey)) continue;
          seenUrls.add(finalKey);
        }
        if(!r.html){ notes.push(`Skipped ${pl.url} (${r.skipped || 'status '+r.status}).`); continue; }
        const pageLinks = extractLinks(r.html, r.url);
        pages.push({
          role: 'policy',
          url: r.url,
          status: r.status,
          depth: depth + 1,
          title: extractTitle(r.html),
          linkText: pl.linkText,
          text: extractText(r.html),
          links: pageLinks,
          scripts: extractScripts(r.html),
          truncated: r.truncated,
        });
        if(depth === 0){
          for(const cand of discoverPolicyLinks(pageLinks, r.url, seenUrls)){
            if(!seenUrls.has(canonicalKey(cand.url))) nextFrontier.push(cand);
          }
        }
      }catch(e){
        notes.push(`Could not retrieve ${pl.url}: ${e.message}`);
      }
    }
    frontier = nextFrontier;
  }
  if(pages.length >= MAX_TOTAL_PAGES){
    notes.push(`Stopped at the ${MAX_TOTAL_PAGES}-page ceiling; some linked policy pages may not have been retrieved.`);
  }

  return {
    ok: true,
    target: homeRes.url,
    fetchedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    pages,
    notes,
  };
}

module.exports = { crawl, fetchPage, extractText, extractTitle, extractLinks, extractScripts, discoverPolicyLinks, canonicalKey, assertSafeUrl, isBlockedIp, normalizeTarget };
