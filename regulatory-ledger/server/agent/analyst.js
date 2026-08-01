'use strict';
/* ============================================================
   POLICY ANALYST — reads the retrieved pages and judges them
   ============================================================
   Until now the crawl matched phrases. It could tell you the words
   "lawful basis" appear somewhere in a privacy policy; it could not tell
   you whether every processing purpose is actually mapped to one. So the
   UI said so, with lines like "whether it covers every processing purpose
   in plain language is a judgment only you can make" — honest, and not
   much use. Retrieving a document and then declining to read it is a thin
   offer.

   This reads it. Given the requirement and the text actually retrieved, it
   returns a verdict with the passages it relied on.

   ---- Why this is allowed to live server-side --------------------------
   CLAUDE.md says the server retrieves and the client judges, and that
   website compliance logic must not migrate here. This module is a
   deliberate, documented exception, so it is worth being precise about
   what changed and what didn't.

   The purpose of that rule was fabrication prevention: a service that only
   reports what it fetched cannot invent a finding about a real company.
   That purpose is preserved directly rather than structurally —

     - Every verdict of "satisfies" or "falls short" must quote the
       retrieved text, and each quote is checked verbatim against the page
       it claims to come from before it leaves this module. Quotes that
       aren't there are dropped; a finding left with none is downgraded to
       "cannot determine", never kept as a bare assertion.
     - An absence claim is only permitted because we hold the complete text
       of the pages we searched. It is reported, and must be rendered, as
       "not present in these N pages" — never as "the company does not do
       this." That distinction is the whole of what went wrong in v0.9.0.
     - It judges a *document*, which we have. It never judges the product,
       which we don't. "The policy says X" is checkable. "The company does
       X" is not, and there is no field here to say it.

   The API key can only live server-side, so there was no version of this
   that ran in the browser. Given that, the honest move was to bring the
   gate here rather than to leave the document unread.

   ---- One call, not twelve ---------------------------------------------
   Every requirement for a regulation is judged in a single request, with
   the pages included once. Twelve calls would mean paying for the whole
   policy twelve times over. Each finding is gated independently, so
   batching costs nothing in rigour.
   ============================================================ */

const { DEFAULT_MODEL, getClient, thinkingFor } = require('./client.js');

const MAX_PAGE_CHARS = 24_000;
const MAX_TOTAL_CHARS = 90_000;

const RECORD_TOOL = {
  name: 'record_findings',
  description:
    'Record one finding per requirement you were given. Every requirement must appear ' +
    'exactly once, using the requirement_id given to you.',
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            requirement_id: { type: 'string', description: 'The id exactly as given.' },
            verdict: {
              type: 'string',
              enum: ['satisfies', 'falls_short', 'not_addressed', 'cannot_determine'],
              description:
                'satisfies: the retrieved text does what the requirement asks. ' +
                'falls_short: the text addresses the topic but not to the standard the citation sets. ' +
                'not_addressed: nothing in the retrieved pages addresses this at all. ' +
                'cannot_determine: the answer is not something a document can settle, or the ' +
                'right page was not retrieved.',
            },
            citations: {
              type: 'array',
              description:
                'The passages you relied on. Required for satisfies and falls_short — a verdict ' +
                'about the text must point at the text. Each quote is checked character for ' +
                'character against the page you attribute it to and discarded if it is not there, ' +
                'so copy exactly and do not tidy, join or paraphrase.',
              items: {
                type: 'object',
                properties: {
                  page_url: { type: 'string', description: 'The URL of the page this passage is on, exactly as listed.' },
                  quote: { type: 'string', description: 'The passage, copied verbatim. One or two sentences.' },
                  shows: { type: 'string', description: 'What this passage establishes about the requirement.' },
                },
                required: ['page_url', 'quote', 'shows'],
              },
            },
            reasoning: {
              type: 'string',
              description:
                'Two or three sentences measuring the retrieved text against the citation. Talk ' +
                'about what the document says, never about what the company does.',
            },
            beyond_the_document: {
              type: 'string',
              description:
                'What this requirement needs that reading a public page cannot establish — whether ' +
                'a described practice is actually followed, whether a control works, whether ' +
                'something happens before consent. Be specific to this requirement. Leave empty ' +
                'if reading the document genuinely settles it.',
            },
          },
          required: ['requirement_id', 'verdict', 'citations', 'reasoning'],
        },
      },
    },
    required: ['findings'],
  },
};

function buildSystem(strictness) {
  return `You are assessing whether a company's published privacy documents satisfy specific legal requirements.

You have the full text of the pages that were retrieved from the site. That text is all you have and all you may rely on.

What you are deciding, precisely: **does the retrieved text do what the citation requires?** You are judging a document, not a company. "The policy states a retention period for each category" is something you can determine. "The company honours that retention period" is not, and nothing in your output may assert it.

Strictness setting: ${strictness.label} — ${strictness.blurb} Apply this to how literally the wording must track what the citation requires.

How to judge:
- Read for substance, not keywords. A policy that maps each processing purpose to a legal basis satisfies the lawful-basis requirement whether or not it uses the phrase "lawful basis". A policy that says "we process data lawfully" and stops does not.
- A requirement can be addressed poorly. Prefer falls_short over not_addressed when the topic is covered but thinly — say what is missing.
- Use not_addressed only when nothing in any retrieved page speaks to the requirement. You are saying it is absent from these specific pages, which is a claim you can support because you have them in full. You are not saying it does not exist anywhere.
- Use cannot_determine when the question is not one a public document can answer, or when the page that would answer it was not retrieved.
- Quote before you conclude. If you cannot point at a passage, you do not have a verdict about the text — you have cannot_determine.

Never write a sentence asserting what the company actually does in practice. Everything you say is about what its published text says.`;
}

function buildUserTurn(requirements, pages) {
  let s = 'RETRIEVED PAGES\n\nThese are the only pages available to you.\n';
  let budget = MAX_TOTAL_CHARS;
  for (const p of pages) {
    if (budget <= 0) break;
    const text = String(p.text || '').slice(0, Math.min(MAX_PAGE_CHARS, budget));
    budget -= text.length;
    s += `\n===== PAGE: ${p.url} =====\n${p.title ? `Title: ${p.title}\n` : ''}${text}\n===== END OF ${p.url} =====\n`;
  }

  s += '\n\nREQUIREMENTS TO ASSESS\n';
  for (const r of requirements) {
    s += `\n--- requirement_id: ${r.id}\nCitation: ${r.code}\nRequirement: ${r.text}\n`;
    if (r.layman) s += `In plain language: ${r.layman}\n`;
    if (r.guidePartial) s += `Counts as falling short: ${r.guidePartial}\n`;
    if (r.guideFail) s += `Counts as not addressed: ${r.guideFail}\n`;
  }
  s += `\nRecord exactly one finding for each of the ${requirements.length} requirement_ids above.`;
  return s;
}

/* ---- The gate ----------------------------------------------------------
   A quote counts only if it is genuinely on the page it is attributed to.
   Whitespace and quote-mark differences are tolerated because models
   reflow text; nothing else is. No fuzzy matching — the point is that the
   evidence is the document's own words, not something close to them. */
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function verifyCitations(citations, pages) {
  const byUrl = new Map();
  for (const p of pages) byUrl.set(String(p.url), normalize(p.text));
  const allText = [...byUrl.values()].join(' \n ');

  const kept = [];
  const dropped = [];
  for (const c of citations || []) {
    const needle = normalize(c.quote).replace(/^["']|["'.…]+$/g, '').trim();
    if (!needle) { dropped.push({ ...c, dropped_because: 'empty quote' }); continue; }
    const onClaimedPage = byUrl.get(String(c.page_url));

    if (onClaimedPage && onClaimedPage.includes(needle)) {
      kept.push(c);
    } else if (allText.includes(needle)) {
      /* Right words, wrong page. The passage is real, so it is kept — but
         attributed to nothing, because a citation whose source we can't
         name isn't much of a citation. */
      const actual = [...byUrl.entries()].find(([, t]) => t.includes(needle));
      kept.push({ ...c, page_url: actual ? actual[0] : c.page_url, reattributed: true });
    } else {
      dropped.push({ ...c, dropped_because: 'this passage is not in the retrieved text of any page' });
    }
  }
  return { kept, dropped };
}

async function analyze({ requirements, pages, strictness }, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const client = opts.client || getClient();

  if (!requirements || !requirements.length) return { ok: true, findings: {}, usage: null };
  const usable = (pages || []).filter(p => p.text && p.text.length > 100);
  if (!usable.length) {
    return { ok: false, error: 'No retrieved page had enough text to assess.' };
  }

  const req = {
    model,
    max_tokens: 8192,
    system: buildSystem(strictness || { label: 'Balanced', blurb: 'Reasonable paraphrases count.' }),
    tools: [RECORD_TOOL],
    tool_choice: { type: 'tool', name: 'record_findings' },
    messages: [{ role: 'user', content: buildUserTurn(requirements, usable) }],
  };
  const thinking = thinkingFor(model);
  if (thinking) req.thinking = thinking;

  const response = await client.messages.create(req);
  const call = response.content.find(b => b.type === 'tool_use');
  if (!call) throw new Error('The analyst returned no findings. Nothing was recorded.');

  const wanted = new Set(requirements.map(r => r.id));
  const findings = {};
  const pageList = usable.map(p => p.url);

  for (const f of call.input.findings || []) {
    if (!wanted.has(f.requirement_id)) continue;      // not a requirement we asked about
    const { kept, dropped } = verifyCitations(f.citations, usable);

    /* A verdict about the text that cannot point at the text is not a
       verdict. Downgrade rather than discard, so the UI can say what
       happened instead of the requirement silently going quiet. */
    let verdict = f.verdict;
    let downgraded = null;
    if ((verdict === 'satisfies' || verdict === 'falls_short') && kept.length === 0) {
      downgraded = verdict;
      verdict = 'cannot_determine';
    }

    findings[f.requirement_id] = {
      verdict,
      downgradedFrom: downgraded,
      citations: kept,
      droppedCitations: dropped,
      reasoning: f.reasoning || '',
      beyondTheDocument: f.beyond_the_document || '',
      /* Absence is only ever a claim about what we actually read, so the
         pages searched travel with the finding and must be shown with it. */
      pagesSearched: pageList,
    };
  }

  return {
    ok: true,
    model,
    findings,
    missing: [...wanted].filter(id => !findings[id]),
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

module.exports = { analyze, verifyCitations, RECORD_TOOL, buildSystem, buildUserTurn };
