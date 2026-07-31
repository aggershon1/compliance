'use strict';
/* Offline checks for the navigator agent: the loop, tool dispatch, the page
   budget, same-origin enforcement, the provenance gate, and the adapter that
   turns a navigator run into the crawl contract the app consumes.

   No API key and no network. The model is a scripted stub injected through
   `opts.client`, so every check here is about our code rather than the
   model's judgment. Whether the model picks good links is what eval.js
   measures, and that needs a real key.

   Run: node loop.test.js */
process.env.ALLOW_PRIVATE_HOSTS = '1';

const fixture = require('./fixture/server.js');
const { navigate, crawlWithAgent } = require('./navigator.js');

let script = [];
let seen = [];
const stub = (content, stop_reason = 'tool_use') =>
  ({ content, stop_reason, usage: { input_tokens: 100, output_tokens: 50 } });
const use = (id, name, input) => ({ type: 'tool_use', id, name, input });

const fakeClient = {
  messages: {
    create: async (req) => {
      seen.push(req);
      const next = script.shift();
      if (!next) throw new Error('script exhausted');
      return next(req);
    },
  },
};

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

(async () => {
  const server = await fixture.start();
  const base = `http://127.0.0.1:${fixture.PORT}`;
  const run = (t) => navigate(t || base, { client: fakeClient });

  try {
    /* --- A normal run that also fabricates one page -------------------- */
    script = [
      () => stub([use('t1', 'fetch_page', { url: `${base}/`, reason: 'start' })]),
      (req) => {
        const last = req.messages[req.messages.length - 1];
        check('tool results come back as a user turn', last.role === 'user');
        const r = JSON.parse(last.content[0].content);
        check('homepage retrieved with links', r.ok === true && r.links.length > 5,
          `${r.links ? r.links.length : 0} links`);
        check('off-site links stripped from tool output', r.links.every(l => l.path.startsWith('/')));
        check('model sees an excerpt, not the whole page',
          r.text_excerpt.length <= 2000 && typeof r.text_length === 'number');
        return stub([use('t2', 'fetch_page', { url: `${base}/privacy`, reason: 'policy' })]);
      },
      () => stub([use('t3', 'fetch_page', { url: `${base}/disclosures/us-states`, reason: 'state notice' })]),
      () => stub([use('t4', 'report_pages', {
        pages: [
          { url: `${base}/privacy`, document_type: 'privacy_policy', why_selected: 'main policy' },
          { url: `${base}/disclosures/us-states`, document_type: 'state_privacy_notice', why_selected: 'CCPA supplement' },
          { url: `${base}/ccpa-notice`, document_type: 'state_privacy_notice', why_selected: 'never opened' },
        ],
        coverage_note: 'test',
      })]),
    ];
    seen = [];
    let r = await run();

    check('loop terminates on report_pages', r.stoppedBecause === null, String(r.stoppedBecause));
    check('genuine pages survive', r.pages.length === 2, `${r.pages.length} kept`);
    check('fabricated page DROPPED', r.dropped.length === 1 && /ccpa-notice/.test(r.dropped[0].url),
      JSON.stringify(r.dropped.map(d => d.url)));
    check('usage accumulated across turns', r.usage.turns === 4 && r.usage.input_tokens === 400,
      `${r.usage.turns} turns / ${r.usage.input_tokens} in`);
    check('fetch log records every attempt', r.fetchLog.length === 3);
    check('full page text kept for the app, separately from the excerpt',
      r.fullPages.get(`${base}/privacy`).text.length > 500);
    check('tools + system sent on every request',
      seen.every(q => q.tools.length === 2 && typeof q.system === 'string'));
    check('thinking omitted by default', seen.every(q => q.thinking === undefined));

    /* --- Off-host fetch is refused in code, not by prompt --------------- */
    script = [
      () => stub([use('x1', 'fetch_page', { url: 'https://example.com/privacy', reason: 'wander off' })]),
      (req) => {
        const out = JSON.parse(req.messages[req.messages.length - 1].content[0].content);
        check('off-host fetch refused', !!out.error && /not 127\.0\.0\.1/.test(out.error), out.error);
        return stub([use('x2', 'report_pages', { pages: [] })]);
      },
    ];
    r = await run();
    check('empty report is a valid outcome', r.pages.length === 0 && r.dropped.length === 0);

    /* --- The page budget binds ----------------------------------------- */
    const paths = ['/', '/privacy', '/cookies', '/opt-out', '/legal/terms', '/legal/dmca',
                   '/legal/accessibility', '/about', '/careers', '/press', '/blog', '/contact', '/help'];
    script = paths.map((p, i) => () => stub([use('b' + i, 'fetch_page', { url: base + p, reason: 'everything' })]));
    script.push((req) => {
      const res = req.messages[req.messages.length - 1].content[0];
      check('budget refusal surfaced as an error result',
        res.is_error === true && /budget/i.test(res.content), res.content);
      return stub([use('bz', 'report_pages', { pages: [] })]);
    });
    r = await run();
    check('no more than MAX_TOOL_CALLS pages opened', r.fetchLog.length === 12, `${r.fetchLog.length} fetched`);

    /* --- Model stops without reporting --------------------------------- */
    script = [() => stub([{ type: 'text', text: 'I think I am done.' }], 'end_turn')];
    r = await run();
    check('bare stop reported, not silently treated as success',
      r.pages.length === 0 && /without calling report_pages/.test(r.stoppedBecause || ''), r.stoppedBecause);

    /* --- The adapter to the crawl contract ------------------------------ */
    script = [
      () => stub([use('c1', 'fetch_page', { url: `${base}/`, reason: 'start' })]),
      () => stub([use('c2', 'fetch_page', { url: `${base}/privacy`, reason: 'policy' })]),
      () => stub([use('c3', 'fetch_page', { url: `${base}/disclosures/us-states`, reason: 'state notice' })]),
      () => stub([use('c4', 'report_pages', {
        pages: [
          { url: `${base}/privacy`, document_type: 'privacy_policy', why_selected: 'the policy' },
          { url: `${base}/disclosures/us-states`, document_type: 'state_privacy_notice', why_selected: 'supplement' },
        ],
      })]),
    ];
    const crawled = await crawlWithAgent(base, { client: fakeClient });

    check('adapter returns the crawl contract',
      crawled.ok === true && Array.isArray(crawled.pages) && Array.isArray(crawled.notes));
    check('start page always included, even unreported',
      crawled.pages[0].role === 'homepage' && crawled.pages[0].links.length > 5);
    check('reported pages carry full text, links and scripts',
      crawled.pages.slice(1).every(p => p.role === 'policy' && p.text && Array.isArray(p.links) && Array.isArray(p.scripts)));
    check('discovery provenance recorded',
      crawled.discovery.method === 'agent' && crawled.discovery.opened === 3 && crawled.discovery.trail.length === 3,
      JSON.stringify({ opened: crawled.discovery.opened, trail: crawled.discovery.trail.length }));
    check('page the agent never reported is not in the crawl',
      !crawled.pages.some(p => /\/cookies$/.test(p.url)));

    /* The whole point of the exercise: the app's rule engine must be able
       to read an agent-discovered crawl exactly as it reads a hint-list one. */
    const heuristicShape = ['role', 'url', 'status', 'title', 'text', 'links', 'scripts'];
    check('page objects have the fields the rule engine reads',
      crawled.pages.every(p => heuristicShape.every(k => k in p)));

    console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
    process.exitCode = failures ? 1 : 0;
  } finally {
    server.close();
  }
})();
