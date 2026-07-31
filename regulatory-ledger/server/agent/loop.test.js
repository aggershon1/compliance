'use strict';
/* Offline check of the agent loop: stubs the API so we can exercise tool
   dispatch, budget handling, and the provenance gate without a key. */
process.env.ALLOW_PRIVATE_HOSTS = '1';

const AGENT = __dirname;
const fixture = require(AGENT + '/fixture/server.js');

let script = [];
let seen = [];
function stubMessage(content, stop_reason = 'tool_use') {
  return { content, stop_reason, usage: { input_tokens: 100, output_tokens: 50 } };
}
class FakeAnthropic {
  constructor() {
    this.messages = {
      create: async (req) => {
        seen.push(req);
        const next = script.shift();
        if (!next) throw new Error('script exhausted');
        return next(req);
      },
    };
  }
}
require.cache[require.resolve(AGENT + '/node_modules/@anthropic-ai/sdk')] = {
  id: 'stub', filename: 'stub', loaded: true, exports: FakeAnthropic,
};

const { navigate } = require(AGENT + '/navigator.js');

const use = (id, name, input) => ({ type: 'tool_use', id, name, input });

(async () => {
  const server = await fixture.start();
  const base = `http://127.0.0.1:${fixture.PORT}`;
  let failures = 0;
  const check = (label, cond, detail) => {
    console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
    if (!cond) failures++;
  };

  try {
    /* --- Scenario 1: a normal run that also fabricates one page -------- */
    script = [
      () => stubMessage([use('t1', 'fetch_page', { url: `${base}/`, reason: 'start' })]),
      (req) => {
        /* the tool result must have come back as a user turn */
        const last = req.messages[req.messages.length - 1];
        check('tool results returned as a user turn', last.role === 'user');
        const r = JSON.parse(last.content[0].content);
        check('homepage retrieved with links', r.ok === true && r.links.length > 5,
          `${r.links ? r.links.length : 0} links`);
        check('off-site links stripped from tool output',
          r.links.every(l => l.path.startsWith('/')));
        return stubMessage([use('t2', 'fetch_page', { url: `${base}/privacy`, reason: 'policy' })]);
      },
      () => stubMessage([use('t3', 'fetch_page', { url: `${base}/disclosures/us-states`, reason: 'state notice' })]),
      () => stubMessage([use('t4', 'report_pages', {
        pages: [
          { url: `${base}/privacy`, document_type: 'privacy_policy', why_selected: 'main policy' },
          { url: `${base}/disclosures/us-states`, document_type: 'state_privacy_notice', why_selected: 'CCPA supplement' },
          /* never opened — the gate must drop this */
          { url: `${base}/ccpa-notice`, document_type: 'state_privacy_notice', why_selected: 'fabricated' },
        ],
        coverage_note: 'test',
      })]),
    ];
    seen = [];
    let run = await navigate(base);

    check('loop terminated on report_pages', run.stoppedBecause === null, String(run.stoppedBecause));
    check('genuine pages survive', run.pages.length === 2, `${run.pages.length} kept`);
    check('fabricated page DROPPED', run.dropped.length === 1 && /ccpa-notice/.test(run.dropped[0].url),
      JSON.stringify(run.dropped.map(d => d.url)));
    check('usage accumulated across turns', run.usage.turns === 4 && run.usage.input_tokens === 400,
      `${run.usage.turns} turns / ${run.usage.input_tokens} in`);
    check('fetch log records every attempt', run.fetchLog.length === 3);
    check('tools + system sent on every request',
      seen.every(r => r.tools.length === 2 && typeof r.system === 'string'));
    check('thinking omitted by default', seen.every(r => r.thinking === undefined));

    /* --- Scenario 2: off-host fetch is refused in code ---------------- */
    script = [
      () => stubMessage([use('x1', 'fetch_page', { url: 'https://example.com/privacy', reason: 'wander off' })]),
      (req) => {
        const last = req.messages[req.messages.length - 1];
        const r = JSON.parse(last.content[0].content);
        check('off-host fetch refused', !!r.error && /not 127\.0\.0\.1/.test(r.error), r.error);
        return stubMessage([use('x2', 'report_pages', { pages: [] })]);
      },
    ];
    run = await navigate(base);
    check('empty report is a valid outcome', run.pages.length === 0 && run.dropped.length === 0);

    /* --- Scenario 3: the page budget actually binds -------------------- */
    const paths = ['/', '/privacy', '/cookies', '/opt-out', '/legal/terms', '/legal/dmca',
                   '/legal/accessibility', '/about', '/careers', '/press', '/blog', '/contact', '/help'];
    script = paths.map((p, i) => () =>
      stubMessage([use('b' + i, 'fetch_page', { url: base + p, reason: 'crawl everything' })]));
    script.push((req) => {
      const last = req.messages[req.messages.length - 1];
      check('budget refusal surfaced as an error result',
        last.content[0].is_error === true && /budget/i.test(last.content[0].content),
        last.content[0].content);
      return stubMessage([use('bz', 'report_pages', { pages: [] })]);
    });
    run = await navigate(base);
    check('no more than MAX_TOOL_CALLS pages opened',
      run.fetchLog.length === 12, `${run.fetchLog.length} fetched`);

    /* --- Scenario 4: model stops without reporting --------------------- */
    script = [() => stubMessage([{ type: 'text', text: 'I think I am done.' }], 'end_turn')];
    run = await navigate(base);
    check('bare stop is reported, not silently treated as success',
      run.pages.length === 0 && /without calling report_pages/.test(run.stoppedBecause || ''),
      run.stoppedBecause);

    console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
    process.exitCode = failures ? 1 : 0;
  } finally {
    server.close();
  }
})();
