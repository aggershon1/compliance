/* ============================================================
   CRAWL CLIENT — interpretation of what the server retrieved
   ============================================================
   The server fetches pages and reports their contents. This file decides
   what those contents mean for each requirement, applying the user's
   strictness setting via the same matcher the checklist reviewer uses.

   Two properties this design protects, both learned the hard way in
   v0.9.0:

   1. Every status here traces to text that was actually retrieved from a
      real page, and carries the quote and source URL to prove it.
   2. When the crawl couldn't answer a question — no policy page found, the
      site refused the request — the requirement stays **Unassessed**. It is
      never downgraded to Fail on the strength of a failed fetch, because
      "we couldn't look" and "it isn't there" are different claims. */

const DEFAULT_CRAWL_BACKEND = 'http://127.0.0.1:8787';

function crawlBackendUrl(){
  return (state.crawlBackend && state.crawlBackend.url) || DEFAULT_CRAWL_BACKEND;
}

async function checkCrawlBackend(){
  try{
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), 2500);
    const res = await fetch(crawlBackendUrl() + '/api/health', {signal: ctrl.signal});
    clearTimeout(t);
    const body = await res.json();
    state.crawlBackend = {
      url: crawlBackendUrl(),
      available: !!body.ok,
      version: body.version,
      /* Whether the service can reach a model is separate from whether it
         can fetch pages. The app offers different capabilities for each and
         says which is missing rather than degrading silently. */
      agent: body.agent || {available: false, reason: 'This crawl service predates agent support.'},
    };
  }catch(e){
    state.crawlBackend = {url: crawlBackendUrl(), available: false, agent: {available: false}};
  }
  return state.crawlBackend.available;
}

/* mode: 'auto' (agent when available), 'agent', or 'links'. */
async function requestCrawl(domain, mode){
  const q = `?url=${encodeURIComponent(domain)}&mode=${encodeURIComponent(mode || 'auto')}`;
  const res = await fetch(crawlBackendUrl() + '/api/crawl' + q);
  return await res.json();
}

/* ---- Matching --------------------------------------------------------- */

/* Pull the sentence around a match so evidence reads as a real quote rather
   than a bare keyword. */
function quoteAround(text, index, phrase){
  const start = Math.max(0, text.lastIndexOf('.', index) + 1);
  let end = text.indexOf('.', index + phrase.length);
  if(end === -1 || end - start > 320) end = Math.min(text.length, index + phrase.length + 160);
  let q = text.slice(start, end + 1).replace(/\s+/g, ' ').trim();
  if(q.length > 300) q = q.slice(0, 297) + '…';
  return q;
}

/* Honour strictness: an exact occurrence always counts; a paraphrase only
   counts at the looser settings, via the shared fuzzy matcher. */
function findPhrase(text, phrase){
  const lower = text.toLowerCase();
  const idx = lower.indexOf(phrase.toLowerCase());
  if(idx !== -1) return {index: idx, exact: true};
  if(fuzzyPhraseMatch(lower, phrase)){
    const words = significantWords(phrase);
    for(const w of words){
      const i = lower.indexOf(w.length > 5 ? w.slice(0,5) : w);
      if(i !== -1) return {index: i, exact: false};
    }
    return {index: 0, exact: false};
  }
  return null;
}

function pagesInScope(crawlResult, scope){
  if(scope === 'policy') return crawlResult.pages.filter(p => p.role === 'policy');
  return crawlResult.pages;
}

function matchPhrases(crawlResult, rule, phrases){
  const hits = [];
  if(rule.scope === 'links'){
    for(const page of crawlResult.pages){
      for(const link of (page.links || [])){
        for(const phrase of phrases){
          const f = findPhrase(link.text, phrase);
          if(f){
            hits.push({quote: link.text, url: page.url, where: `link on ${page.role === 'homepage' ? 'the homepage' : page.url}`, exact: f.exact, target: link.href});
            break;
          }
        }
        if(hits.length >= 3) break;
      }
      if(hits.length >= 3) break;
    }
    return hits;
  }
  for(const page of pagesInScope(crawlResult, rule.scope)){
    for(const phrase of phrases){
      const f = findPhrase(page.text || '', phrase);
      if(f){
        hits.push({quote: quoteAround(page.text, f.index, phrase), url: page.url, where: page.title || page.role, exact: f.exact});
        break;
      }
    }
    if(hits.length >= 3) break;
  }
  return hits;
}

/* Consent tooling is visible in script sources even when banner markup is
   injected later, so it's worth reporting as corroborating evidence. */
function matchScripts(crawlResult, names){
  const hits = [];
  for(const page of crawlResult.pages){
    for(const src of (page.scripts || [])){
      const low = src.toLowerCase();
      const hit = (names || []).find(n => low.includes(n));
      if(hit) hits.push({quote: src, url: page.url, where: 'script tag', exact: true, vendor: hit});
      if(hits.length >= 4) break;
    }
    if(hits.length >= 4) break;
  }
  return hits;
}

function applyCrawlRules(crawlResult){
  const findings = {};
  const gotPolicy = crawlResult.pages.some(p => p.role === 'policy');
  const gotHomepage = crawlResult.pages.some(p => p.role === 'homepage');

  Object.entries(CRAWL_RULES).forEach(([id, rule]) => {
    const needMet = rule.needs === 'policy' ? gotPolicy : rule.needs === 'homepage' ? gotHomepage : true;
    if(!needMet){
      findings[id] = {
        determinable: false, status: null, evidence: [],
        rationale: rule.needs === 'policy'
          ? 'No policy page could be retrieved, so this could not be checked. Left unassessed rather than failed — the crawl not finding a policy is not evidence there isn’t one.'
          : 'The site’s homepage could not be retrieved, so this could not be checked.',
        limitation: rule.limitation || null,
      };
      return;
    }

    const strong = matchPhrases(crawlResult, rule, rule.strong || []);
    const weak = strong.length ? [] : matchPhrases(crawlResult, rule, rule.weak || []);
    const cmp = rule.cmpScripts ? matchScripts(crawlResult, rule.cmpScripts) : [];
    const trackers = rule.trackerScripts ? matchScripts(crawlResult, rule.trackerScripts) : [];

    let status, rationale;
    const evidence = [...strong, ...weak, ...cmp];

    if(strong.length || cmp.length){
      status = rule.cap === 'Partial' ? 'Partial' : 'Pass';
      const how = strong.length && strong.every(h => h.exact) ? 'the expected wording' : 'wording matching this requirement at your current strictness setting';
      rationale = `Found ${how} in the retrieved page${evidence.length > 1 ? 's' : ''}.`;
      if(cmp.length) rationale += ` A consent-management tool (${cmp[0].vendor}) is loaded on the site.`;
      if(rule.cap === 'Partial') rationale += ' Capped at Partial because presence is checkable but sufficiency is not.';
    } else if(weak.length){
      status = 'Partial';
      rationale = 'Only related or looser wording was found — enough to show the topic is addressed, not that the requirement is met as worded.';
    } else {
      status = 'Fail';
      rationale = `The expected wording was not present in the ${rule.scope === 'links' ? 'site’s links' : 'retrieved page text'}.`;
    }

    if(trackers.length && (rule.trackerScripts)){
      rationale += ` Third-party trackers were loaded on the page (${[...new Set(trackers.map(t=>t.vendor))].join(', ')}) — whether they fire before consent is not determinable from a fetch.`;
    }

    findings[id] = {
      determinable: true,
      status,
      confidence: strong.length ? (strong.every(h=>h.exact) ? 'High' : 'Medium') : (weak.length ? 'Low' : 'Medium'),
      rationale,
      evidence: evidence.slice(0, 4),
      limitation: rule.limitation || null,
    };
  });

  return findings;
}

/* Re-derive statuses from a stored crawl without re-fetching. Called when
   strictness changes, so the dial governs real retrieved text — a stricter
   setting can turn a loosely-worded link from Pass into Fail without
   touching the network. */
function recomputeCrawlFindings(){
  state.sites.forEach(site=>{
    if(site.crawl && site.crawl.raw){
      site.crawlFindings = applyCrawlRules(site.crawl.raw);
    }
  });
}


/* ============================================================
   POLICY ANALYSIS — the reviewer reads what was retrieved
   ============================================================
   Phrase matching can tell you "lawful basis" appears in a policy. It
   cannot tell you whether every processing purpose is mapped to one, which
   is what the citation actually asks — so the UI used to say the judgment
   was yours alone. Retrieving a document and then declining to read it is
   a thin offer, and this closes it.

   The analyst's findings are merged into the same `crawlFindings` shape the
   phrase rules produce, so scoring, overrides, the audit log and every
   render path work unchanged. What differs is `via`, so the UI can say
   which one produced a given result — the two are not equally strong and
   the difference is provenance. */

async function requestAnalysis(site, regKeys){
  if(!site.crawl || !site.crawl.raw || !site.crawl.raw.pages) return null;
  const pages = site.crawl.raw.pages
    .filter(p => p.text && p.text.length > 100)
    .map(p => ({url: p.url, title: p.title, text: p.text}));
  if(!pages.length) return null;

  /* Only requirements that have a crawl rule: the rule is what says this
     is checkable from a public page at all, and it carries the cap. */
  const reqs = [];
  regKeys.forEach(regKey=>{
    regDefs(regKey).scanned.forEach(r=>{
      if(!CRAWL_RULES[r.id]) return;
      reqs.push({
        id: r.id, code: r.code, text: r.text, layman: r.layman,
        guidePartial: r.guide && r.guide.partial,
        guideFail: r.guide && r.guide.fail,
      });
    });
  });
  if(!reqs.length) return null;

  const res = await fetch(crawlBackendUrl() + '/api/analyze', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({requirements: reqs, pages, strictness: strictnessSetting()}),
  });
  return await res.json();
}

/* Absence is only ever a claim about the pages we actually read, so the
   list travels with the rationale and is shown with it. "Not in these four
   pages" is checkable; "the company doesn't do this" is the v0.9.0
   failure. */
function pagesSearchedNote(f){
  const n = (f.pagesSearched || []).length;
  if(!n) return '';
  return ` Not present in the ${n} page${n===1?'':'s'} retrieved (${f.pagesSearched.join(', ')}) — that is a statement about these pages, not about the company.`;
}

function analysisToFinding(reqId, f){
  const rule = CRAWL_RULES[reqId] || {};
  const cap = rule.cap;
  /* The cap survives analysis only where it exists for a reason reading
     can't fix — tracker timing, a form the crawl never reached. Where it
     existed because keyword matching couldn't read, reading lifts it. */
  const capApplies = cap && !rule.analystLiftsCap;

  let status = null, determinable = true, confidence = 'Medium';
  if(f.verdict === 'satisfies'){
    status = capApplies ? cap : 'Pass';
    confidence = f.citations.length ? 'High' : 'Medium';
  } else if(f.verdict === 'falls_short'){
    status = 'Partial';
    confidence = f.citations.length ? 'High' : 'Medium';
  } else if(f.verdict === 'not_addressed'){
    status = 'Fail';
    confidence = 'Medium';
  } else {
    determinable = false;
    confidence = 'Low';
  }

  let rationale = f.reasoning || '';
  if(f.verdict === 'not_addressed') rationale += pagesSearchedNote(f);
  if(capApplies && f.verdict === 'satisfies'){
    rationale += ` Capped at ${cap}: the document says what the requirement asks, but what it claims can’t be confirmed by reading alone.`;
  }
  if(f.downgradedFrom){
    rationale += ` The reviewer initially read this as “${f.downgradedFrom.replace('_',' ')}” but could not point to a passage supporting it, so it is left undetermined rather than recorded.`;
  }

  return {
    determinable,
    status,
    confidence,
    rationale,
    via: 'analyst',
    evidence: (f.citations || []).map(c=>({
      quote: c.quote, url: c.page_url, where: c.shows, exact: true, reattributed: !!c.reattributed,
    })).slice(0, 4),
    /* The analyst's own statement of what reading can't settle is specific
       to this requirement; the static rule text is the generic fallback. */
    limitation: f.beyondTheDocument || rule.limitation || null,
    droppedCitations: (f.droppedCitations || []).length,
  };
}

/* Merge over the phrase-matched baseline. Anything the analyst didn't
   return a finding for keeps whatever the rules produced, so a partial
   response degrades to the old behaviour rather than blanking the page. */
function applyAnalysis(site, analysis){
  if(!analysis || !analysis.ok || !analysis.findings) return 0;
  let n = 0;
  Object.entries(analysis.findings).forEach(([reqId, f])=>{
    site.crawlFindings[reqId] = analysisToFinding(reqId, f);
    n++;
  });
  site.analysisMeta = {
    at: Date.now(),
    model: analysis.model,
    count: n,
    missing: analysis.missing || [],
    strictness: state.strictness,
  };
  return n;
}
