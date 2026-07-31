'use strict';
/* ============================================================
   NAVIGATOR AGENT — finds a site's privacy documents by reading it
   ============================================================
   The alternative to POLICY_HINTS in ../crawler.js, which only finds pages
   whose link text or path uses vocabulary someone thought of in advance. A
   site filing its CCPA supplement under "Additional Disclosures for U.S.
   State Residents" is invisible to that list, and the fix is always the
   same — a human adds another regex.

   ---- What makes this an agent, and not just an LLM call ----------------
   The model is given a tool and a goal and decides for itself which pages
   to open and when it has enough. We do not supply the sequence. That
   autonomy is the point, and it is also the risk, which is why the tool
   surface is shaped the way it is.

   ---- The honesty constraint, enforced structurally ---------------------
   This repo's load-bearing rule is that nothing is presented as observed
   unless it was actually inspected (see CHANGELOG v0.9.0 — a previous
   version fabricated findings about real companies' real websites, and
   someone acted on them).

   An autonomous loop is exactly the kind of thing that regresses that:
   asked to find privacy pages, a model will cheerfully report "I reviewed
   the privacy policy and found no opt-out link" when what actually
   happened was a 404. Prompting against it is not a control. So:

     1. The agent has no field in which to express a compliance
        conclusion. `report_pages` takes URLs and why each was chosen.
        There is nowhere to put a verdict, so it cannot return one.
     2. Every URL it reports is checked against the fetch log before it
        leaves this module. A URL it never actually retrieved is dropped
        and recorded. A hallucinated page cannot survive.
     3. The agent decides *where to look*, never what anything means.
        Judgment stays in js/crawl.js, against retrieved text, under the
        user's strictness setting — exactly as before.

   Design the tool surface so the bad output has nowhere to go, rather than
   asking the model not to produce it.

   ---- Why a hand-written loop ------------------------------------------
   The SDK's tool runner (`client.beta.messages.tool_runner`) would remove
   most of the code below. It is written out because seeing the request ->
   tool_use -> tool_result -> repeat cycle explicitly is the point of a
   first agent; the runner is the shortcut you take afterwards.
   ============================================================ */

const { DEFAULT_MODEL, getClient, thinkingFor } = require('./client.js');
const {
  fetchPage, extractText, extractTitle, extractLinks, extractScripts, normalizeTarget,
} = require('../crawler.js');

/* Budgets. An agent that picks its own next step needs a hard stop that
   does not depend on it choosing to finish. */
const MAX_TOOL_CALLS = 12;   // pages the agent may open
const MAX_TURNS = 16;        // model round-trips
const TEXT_EXCERPT = 2000;   // chars of page text shown to the model per fetch
const MAX_LINKS_SHOWN = 120;

/* ---- Tools -------------------------------------------------------------
   Two tools, and the second is how the agent says it is done. Ending via an
   explicit tool call rather than prose means the final answer arrives
   already conforming to a schema we control — one with no room for a
   verdict in it. */
const TOOLS = [
  {
    name: 'fetch_page',
    description:
      'Open a page on the site being reviewed and read it. Returns the page title, ' +
      'the beginning of its readable text, and every link on it. Use this to explore ' +
      'from the starting page toward the site\'s privacy, cookie, and state-specific ' +
      'privacy documents. Only pages on the same hostname as the starting URL can be opened.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL to open. Must be on the same hostname as the starting page.' },
        reason: { type: 'string', description: 'One short sentence: why this page is worth opening.' },
      },
      required: ['url', 'reason'],
    },
  },
  {
    name: 'report_pages',
    description:
      'Finish. Report the pages you actually opened that contain the site\'s privacy, ' +
      'cookie, or state-privacy documentation. Report ONLY pages you opened with ' +
      'fetch_page and that loaded successfully — never a URL you did not open, and ' +
      'never one you assume exists. Reporting nothing is a valid and correct answer ' +
      'if the site has no such pages.',
    input_schema: {
      type: 'object',
      properties: {
        pages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'The URL, exactly as you opened it.' },
              document_type: {
                type: 'string',
                enum: ['privacy_policy', 'cookie_policy', 'state_privacy_notice',
                       'opt_out_or_choices', 'terms', 'other_legal'],
                description: 'What kind of document this is.',
              },
              why_selected: {
                type: 'string',
                description:
                  'Why this page belongs in the set — what kind of document it is and how you ' +
                  'reached it. Describe the page\'s role only. Do NOT assess whether the site ' +
                  'complies with anything, and do NOT state what the page does or does not ' +
                  'contain; that judgment happens elsewhere, against the retrieved text.',
              },
            },
            required: ['url', 'document_type', 'why_selected'],
          },
        },
        coverage_note: {
          type: 'string',
          description:
            'Optional. Only for gaps in YOUR SEARCH — e.g. "a link labelled X looked relevant ' +
            'but returned 404", or "stopped at the page budget". Not a statement about the ' +
            'site\'s compliance.',
        },
      },
      required: ['pages'],
    },
  },
];

const SYSTEM = `You are locating a website's privacy and data-protection documents so a compliance tool can read them.

Your job is navigation and nothing else. You decide which pages to open; you do not evaluate them.

How to work:
- Start from the page you are given. Read its links and open the ones likely to lead to privacy, cookie, opt-out, or state-specific privacy documents.
- Policy pages routinely link to further policy pages. A privacy policy often links a separate cookie policy and a separate US-state or California notice. Follow those.
- Sites do not use consistent wording. A CCPA supplement may be titled "Additional Disclosures", "Your State Privacy Rights", "Notice at Collection", or something else entirely. Judge from the link text, the path, and what you find when you open it — not from a fixed vocabulary.
- Skip pages that are legal but not about data: DMCA, accessibility statements, imprints, licensing.
- You have a limited page budget. Prefer opening one page that is likely to link several relevant documents over several marginal pages.
- Call report_pages when you have found the site's privacy documentation or run out of promising leads.

Hard rules:
- Report only pages you actually opened and that actually loaded. Never report a URL you guessed at or assumed exists, even if it is a conventional path like /privacy.
- Never state or imply a compliance conclusion. You are not assessing whether the site satisfies any law, and you must not say what a page does or does not contain. Another part of the system reads the retrieved text and makes that judgment. If you have found nothing, say so plainly and report an empty list.`;

/* ---- The tool implementation -------------------------------------------
   Same-origin is enforced here, in code. The prompt asks for it too, but a
   prompt is a request and this is a constraint — the agent cannot be talked
   into fetching another host.

   Two representations are kept per page: a trimmed one for the model (text
   excerpt, deduped same-site links) and the full extraction for the app.
   The app needs complete text, links and script sources to apply the
   requirement rules; the model needs neither, and paying for the whole
   policy in tokens on every turn would be waste. */
function makeFetchTool(startUrl, log, fullPages) {
  const startHost = new URL(startUrl).hostname;
  const seen = new Map();

  return async function runFetch({ url, reason }) {
    let u;
    try { u = new URL(url); }
    catch { return { error: `Not a valid URL: ${url}` }; }

    if (u.hostname !== startHost) {
      return { error: `Refused: ${u.hostname} is not ${startHost}. You may only open pages on the site being reviewed.` };
    }
    const key = u.href;
    if (seen.has(key)) return { ...seen.get(key), note: 'already opened' };

    let res;
    try {
      res = await fetchPage(u.href);
    } catch (err) {
      const rec = { url: u.href, ok: false, error: err.message };
      log.push({ ...rec, reason });
      seen.set(key, rec);
      return rec;
    }

    const text = extractText(res.html);
    const links = extractLinks(res.html, res.url);
    const ok = res.status >= 200 && res.status < 300 && !!text;

    if (ok) {
      fullPages.set(res.url, {
        url: res.url,
        status: res.status,
        title: extractTitle(res.html),
        text,
        links,
        scripts: extractScripts(res.html),
        truncated: res.truncated,
      });
    }

    const sameSite = [];
    const seenPaths = new Set();
    for (const l of links) {
      let lu;
      try { lu = new URL(l.href); } catch { continue; }
      if (lu.hostname !== startHost) continue;
      if (seenPaths.has(lu.pathname)) continue;
      seenPaths.add(lu.pathname);
      sameSite.push({ text: l.text, path: lu.pathname + (lu.search || '') });
      if (sameSite.length >= MAX_LINKS_SHOWN) break;
    }

    const record = {
      url: res.url,
      ok,
      status: res.status,
      title: extractTitle(res.html),
      text_length: text.length,
      text_excerpt: text.slice(0, TEXT_EXCERPT),
      links: sameSite,
    };
    log.push({ url: record.url, ok, status: res.status, reason });
    seen.set(key, record);
    return record;
  };
}

/* ---- The loop ----------------------------------------------------------
   Send messages -> if the model asked for tools, run them and send the
   results back as a user turn -> repeat until it calls report_pages or hits
   a budget. That is the whole of it. */
async function navigate(target, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const client = opts.client || getClient();

  const { url: startUrl } = normalizeTarget(target);
  const fetchLog = [];
  const fullPages = new Map();
  const runFetch = makeFetchTool(startUrl, fetchLog, fullPages);

  const messages = [{
    role: 'user',
    content: `Find the privacy and data-protection documents on this site. Start here: ${startUrl}`,
  }];

  let toolCalls = 0;
  let reported = null;
  let stoppedBecause = null;
  const usage = { input_tokens: 0, output_tokens: 0, turns: 0 };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const req = { model, max_tokens: 4096, system: SYSTEM, tools: TOOLS, messages };
    const thinking = thinkingFor(model);
    if (thinking) req.thinking = thinking;

    const response = await client.messages.create(req);
    usage.turns++;
    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;

    /* Push the assistant turn back verbatim. This matters when thinking is
       enabled: thinking blocks must survive into the next request, and
       copying the content array wholesale is how that happens without
       special-casing anything. */
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      stoppedBecause = 'the model stopped without calling report_pages';
      break;
    }

    const results = [];
    let done = false;
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      if (block.name === 'report_pages') {
        reported = block.input;
        results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Recorded.' });
        done = true;
        continue;
      }

      if (block.name === 'fetch_page') {
        if (toolCalls >= MAX_TOOL_CALLS) {
          results.push({
            type: 'tool_result', tool_use_id: block.id, is_error: true,
            content: `Page budget of ${MAX_TOOL_CALLS} reached. Call report_pages now with what you have opened so far.`,
          });
          continue;
        }
        toolCalls++;
        const out = await runFetch(block.input);
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
        continue;
      }

      results.push({
        type: 'tool_result', tool_use_id: block.id, is_error: true,
        content: `Unknown tool: ${block.name}`,
      });
    }

    messages.push({ role: 'user', content: results });
    if (done) break;
  }

  if (!reported && !stoppedBecause) stoppedBecause = `hit the ${MAX_TURNS}-turn ceiling without reporting`;

  /* ---- The provenance gate ---------------------------------------------
     Nothing the agent says survives unless the fetch log agrees it
     happened. The difference between "the model told us it opened this
     page" and "we opened this page". */
  const retrieved = new Map(fetchLog.filter(e => e.ok).map(e => [e.url, e]));
  const pages = [];
  const dropped = [];
  for (const p of (reported && reported.pages) || []) {
    const hit = retrieved.get(p.url)
      || retrieved.get(p.url.replace(/\/$/, ''))
      || retrieved.get(p.url + '/');
    if (hit) pages.push({ ...p, url: hit.url });
    else dropped.push({ ...p, dropped_because: 'not present in the fetch log as a successful retrieval' });
  }

  return {
    ok: true,
    target: startUrl,
    model,
    pages,
    dropped,
    coverage_note: (reported && reported.coverage_note) || null,
    stoppedBecause,
    fetchLog,
    fullPages,
    usage,
  };
}

/* ---- Adapter to the crawl contract -------------------------------------
   Returns exactly the shape ../crawler.js `crawl()` returns, so the app's
   rule engine consumes an agent-discovered crawl and a hint-list crawl
   identically. Only `discovery` differs, and that exists so the UI can say
   which one produced the pages.

   The start page is always included regardless of whether the agent
   reported it: several requirements are evidenced by homepage *links* (the
   "Do Not Sell or Share" link, most obviously), so the app needs it even
   though it is not itself a privacy document. */
async function crawlWithAgent(target, opts = {}) {
  const startedAt = Date.now();
  const run = await navigate(target, opts);

  const notes = [];
  const pages = [];
  const startPage = run.fullPages.get(run.target)
    || [...run.fullPages.values()].find(p => p.url.replace(/\/$/, '') === run.target.replace(/\/$/, ''));

  if (startPage) {
    pages.push({ role: 'homepage', ...startPage });
  } else {
    notes.push('The starting page could not be retrieved, so requirements evidenced by homepage links could not be checked.');
  }

  const typeLabel = {
    privacy_policy: 'privacy policy', cookie_policy: 'cookie policy',
    state_privacy_notice: 'US state privacy notice', opt_out_or_choices: 'opt-out / privacy choices',
    terms: 'terms', other_legal: 'other legal page',
  };

  for (const p of run.pages) {
    if (startPage && p.url === startPage.url) continue;
    const full = run.fullPages.get(p.url);
    if (!full) continue;   // belt and braces; the gate should already have caught this
    pages.push({
      role: 'policy',
      ...full,
      documentType: p.document_type,
      linkText: typeLabel[p.document_type] || p.document_type,
      selectedBecause: p.why_selected,
    });
  }

  if (pages.filter(p => p.role === 'policy').length === 0) {
    notes.push('The navigator did not find any privacy or policy pages on this site. Requirements that depend on policy wording are reported as not determinable rather than failing.');
  }
  if (run.coverage_note) notes.push(`Navigator note: ${run.coverage_note}`);
  if (run.stoppedBecause) notes.push(`The navigator ${run.stoppedBecause}; coverage may be incomplete.`);
  if (run.dropped.length) {
    notes.push(`${run.dropped.length} page(s) the navigator reported were discarded because they were not in its fetch log — they were never successfully retrieved, so nothing was assessed from them.`);
  }
  for (const e of run.fetchLog) {
    if (!e.ok && e.error) notes.push(`Could not retrieve ${e.url}: ${e.error}`);
  }

  return {
    ok: true,
    target: run.target,
    fetchedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    pages,
    notes,
    discovery: {
      method: 'agent',
      model: run.model,
      opened: run.fetchLog.length,
      selected: pages.length,
      dropped: run.dropped,
      usage: run.usage,
      trail: run.fetchLog.map(e => ({ url: e.url, ok: e.ok, reason: e.reason || null, error: e.error || null })),
    },
  };
}

module.exports = { navigate, crawlWithAgent, TOOLS, SYSTEM, MAX_TOOL_CALLS };
