'use strict';
/* ============================================================
   NAVIGATOR AGENT — spike (not wired into the app)
   ============================================================
   An agent that finds a site's privacy/legal pages by reading it, instead
   of matching link text against the hardcoded POLICY_HINTS list in
   ../crawler.js.

   The problem it exists to solve: POLICY_HINTS only finds pages whose link
   text or path uses vocabulary we thought of in advance. A site that files
   its CCPA supplement under "Additional Disclosures for U.S. State
   Residents" is invisible to it, and the fix is always the same — a human
   adds another regex. That list will need hand-tuning once per site shape,
   forever.

   ---- What makes this an agent, and not just an LLM call ----------------
   The model is given a tool and a goal, and decides for itself which pages
   to open and when it has enough. We do not tell it the sequence. That
   autonomy is the whole point, and it is also the risk, which is why the
   tool surface below is shaped the way it is.

   ---- The honesty constraint, enforced structurally ---------------------
   This repo's load-bearing rule is that nothing is presented as observed
   unless it was actually inspected (see CHANGELOG v0.9.0 — a previous
   version fabricated findings about real companies' real websites, and
   someone acted on them).

   An autonomous loop is exactly the kind of thing that drifts into
   confident narration: asked to find privacy pages, a model will happily
   report "I reviewed the privacy policy and found no opt-out link" when
   what actually happened was a 404. Prompting against that is not a
   control. So instead:

     1. The agent has no field in which to express a compliance
        conclusion. `report_pages` accepts URLs and why each was chosen.
        There is nowhere to put a verdict, so it cannot return one.
     2. Every URL it reports is checked against the fetch log before it is
        returned to the caller. A URL the agent never actually retrieved —
        or retrieved as a 404 — is dropped, and recorded in `dropped`.
        A hallucinated URL therefore cannot survive, regardless of how
        confidently it was reported.
     3. The agent decides *where to look*. It never decides what anything
        means. Judgment stays in js/crawl.js against retrieved text, under
        the user's strictness setting, exactly as it does today.

   That ordering matters: design the tool surface so fabrication is not
   expressible, rather than asking the model not to fabricate.

   ---- Why a hand-written loop ------------------------------------------
   The SDK's tool runner (`client.beta.messages.tool_runner`) would remove
   most of the code below. It is written out here because seeing the
   request -> tool_use -> tool_result -> repeat cycle explicitly is the
   point of a first agent; the runner is the shortcut you take afterwards,
   once the loop is not a mystery.
   ============================================================ */

const Anthropic = require('@anthropic-ai/sdk');
const {
  fetchPage, extractText, extractLinks, extractTitle, normalizeTarget,
} = require('../crawler.js');

const DEFAULT_MODEL = process.env.AGENT_MODEL || 'claude-opus-5';

/* Budgets. An agent that picks its own next step needs a hard stop that
   does not depend on it choosing to finish. */
const MAX_TOOL_CALLS = 12;   // pages the agent may open
const MAX_TURNS = 16;        // model round-trips
const TEXT_EXCERPT = 2000;   // chars of page text shown per fetch
const MAX_LINKS_SHOWN = 120;

/* Extended thinking: the shape differs by model family, and swapping
   models is the entire point of the eval harness, so branch here rather
   than making the caller remember.

   - 4.6 and newer take {type:'adaptive'}.
   - Haiku 4.5 predates that and rejects it with a 400; it would need
     {type:'enabled', budget_tokens:N}.

   Default is off. Choosing which of ~50 footer links is a privacy page is
   not reasoning-heavy, and leaving it off keeps the model swap a
   one-variable change. Set AGENT_THINKING=1 to try it. */
function thinkingFor(model) {
  if (process.env.AGENT_THINKING !== '1') return undefined;
  if (/haiku-4-5|claude-3/.test(model)) return undefined;  // pre-4.6 shape differs
  return { type: 'adaptive' };
}

/* ---- Tools -------------------------------------------------------------
   Two tools, and the second one is how the agent says it is done. Ending
   via an explicit tool call rather than plain prose means the final answer
   arrives already conforming to a schema — one we control, and one with no
   room for a verdict in it. */
const TOOLS = [
  {
    name: 'fetch_page',
    description:
      'Open a page on the site being reviewed and read it. Returns the page title, ' +
      'the beginning of its readable text, and every link on it. Use this to explore ' +
      'from the homepage toward the site\'s privacy, cookie, and state-specific ' +
      'privacy documents. Only pages on the same hostname as the starting URL can be opened.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Absolute URL to open. Must be on the same hostname as the starting page.',
        },
        reason: {
          type: 'string',
          description: 'One short sentence: why this page is worth opening.',
        },
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
                  'Why this page belongs in the set — what kind of document it is and how ' +
                  'you reached it. Describe the page\'s role only. Do NOT assess whether the ' +
                  'site complies with anything, and do NOT state what the page does or does ' +
                  'not contain; that judgment happens elsewhere, against the retrieved text.',
              },
            },
            required: ['url', 'document_type', 'why_selected'],
          },
        },
        coverage_note: {
          type: 'string',
          description:
            'Optional. Only for gaps in YOUR SEARCH — e.g. "a link labelled X looked ' +
            'relevant but returned 404", or "stopped at the page budget". Not a statement ' +
            'about the site\'s compliance.',
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
   prompt is a request and this is a constraint — the agent cannot be
   talked into fetching another host. */
function makeFetchTool(startUrl, log) {
  const startHost = new URL(startUrl).hostname;
  const seen = new Map();  // url -> record, so a repeat costs nothing

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

    /* Links are what the agent actually reasons over, so dedupe by path and
       drop off-site ones — it cannot open them anyway, and they are pure
       token cost. */
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
      ok: res.status >= 200 && res.status < 300 && !!text,
      status: res.status,
      title: extractTitle(res.html),
      text_length: text.length,
      text_excerpt: text.slice(0, TEXT_EXCERPT),
      links: sameSite,
    };
    log.push({ url: record.url, ok: record.ok, status: record.status, reason });
    seen.set(key, record);
    /* The full record goes to the model; the log keeps only provenance. */
    return record;
  };
}

function textOf(msg) {
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

/* ---- The loop ----------------------------------------------------------
   Send messages -> if the model asked for tools, run them and send the
   results back as a user turn -> repeat until it calls report_pages or we
   hit a budget. That is the whole of it. */
async function navigate(target, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey: opts.apiKey || process.env.ANTHROPIC_API_KEY });

  const { url: startUrl } = normalizeTarget(target);
  const fetchLog = [];
  const runFetch = makeFetchTool(startUrl, fetchLog);

  const messages = [{
    role: 'user',
    content: `Find the privacy and data-protection documents on this site. Start here: ${startUrl}`,
  }];

  let toolCalls = 0;
  let reported = null;
  let stoppedBecause = null;
  const usage = { input_tokens: 0, output_tokens: 0, turns: 0 };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const req = {
      model,
      max_tokens: 4096,
      system: SYSTEM,
      tools: TOOLS,
      messages,
    };
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
     happened. This is the difference between "the model told us it opened
     this page" and "we opened this page". */
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
    usage,
  };
}

module.exports = { navigate, TOOLS, SYSTEM, MAX_TOOL_CALLS };
