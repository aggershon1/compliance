'use strict';
/* Offline checks for the policy analyst — the module that reads the pages
   the crawl retrieved and judges them against the requirements.

   This is the one agent that renders a verdict about a real company's
   published documents, so its gate matters more than the others'. The
   checks that count: a quote that isn't in the text is dropped, a verdict
   left without any surviving quote is downgraded rather than kept, and an
   absence claim carries the list of pages it is scoped to.

   Run: node analyst.test.js */

const { analyze, verifyCitations } = require('./analyst.js');

let script = [];
let seen = [];
const stub = (input) => ({
  content: [{ type: 'tool_use', id: 'x', name: 'record_findings', input }],
  stop_reason: 'tool_use',
  usage: { input_tokens: 9000, output_tokens: 700 },
});
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

const PAGES = [
  {
    url: 'https://calmly.example/privacy',
    title: 'Privacy Policy',
    text: 'We process your account data to provide the service under our contract with you. ' +
          'Marketing emails are sent only with your consent, which you may withdraw at any time. ' +
          'Where information leaves the EEA we rely on the Standard Contractual Clauses.',
  },
  {
    url: 'https://calmly.example/cookies',
    title: 'Cookie Policy',
    text: 'We use strictly necessary cookies to keep you signed in, and analytics cookies where you have consented.',
  },
];

const REQS = [
  { id: 'gdpr-s1', code: 'GDPR Art. 6', text: 'A lawful basis is identified for each processing purpose.' },
  { id: 'gdpr-s5', code: 'GDPR Art. 46', text: 'Safeguards for international transfers are documented.' },
  { id: 'gdpr-s6', code: 'GDPR Art. 30', text: 'Records of processing activities are maintained.' },
];

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

(async () => {
  /* --- The citation gate on its own ----------------------------------- */
  let g = verifyCitations([
    { page_url: 'https://calmly.example/privacy', quote: 'under our contract with you', shows: 'contract basis' },
    { page_url: 'https://calmly.example/privacy', quote: 'Marketing   emails are sent   ONLY with your consent', shows: 'whitespace and case differ' },
    { page_url: 'https://calmly.example/privacy', quote: 'we retain data for seven years', shows: 'not in the text' },
  ], PAGES);
  check('verbatim quote kept', g.kept.some(c => /contract with you/.test(c.quote)));
  check('whitespace and case differences tolerated', g.kept.length === 2, `${g.kept.length} kept`);
  check('quote that is not in the text DROPPED',
    g.dropped.length === 1 && /seven years/.test(g.dropped[0].quote));

  /* A real passage attributed to the wrong page keeps the passage but
     corrects the attribution — a citation whose source we can't name is
     not much of a citation. */
  g = verifyCitations([
    { page_url: 'https://calmly.example/privacy', quote: 'strictly necessary cookies', shows: 'wrong page' },
  ], PAGES);
  check('passage on the wrong page is re-attributed, not dropped',
    g.kept.length === 1 && /cookies$/.test(g.kept[0].page_url) && g.kept[0].reattributed === true,
    JSON.stringify(g.kept));

  /* --- A full run ------------------------------------------------------ */
  script = [() => stub({
    findings: [
      {
        requirement_id: 'gdpr-s1', verdict: 'satisfies',
        citations: [{ page_url: 'https://calmly.example/privacy', quote: 'to provide the service under our contract with you', shows: 'contract as a basis' }],
        reasoning: 'The policy names a basis for each purpose it describes.',
        beyond_the_document: '',
      },
      {
        requirement_id: 'gdpr-s5', verdict: 'satisfies',
        citations: [{ page_url: 'https://calmly.example/privacy', quote: 'we rely on the Standard Contractual Clauses', shows: 'SCCs named' }],
        reasoning: 'SCCs are named as the transfer mechanism.',
        beyond_the_document: 'Whether the clauses are actually executed with each recipient cannot be seen from a public page.',
      },
      {
        requirement_id: 'gdpr-s6', verdict: 'not_addressed', citations: [],
        reasoning: 'Nothing in the retrieved pages speaks to records of processing.',
        beyond_the_document: 'Records of processing are internal; a public policy rarely evidences them either way.',
      },
    ],
  })];
  seen = [];
  let r = await analyze({ requirements: REQS, pages: PAGES }, { client: fakeClient });

  check('one call for all requirements', seen.length === 1, `${seen.length} calls`);
  check('a finding per requirement', Object.keys(r.findings).length === 3);
  check('tool_choice forces the tool, not prose', seen[0].tool_choice.name === 'record_findings');
  check('page text is actually sent', /Standard Contractual Clauses/.test(JSON.stringify(seen[0].messages)));
  check('grounded verdict survives', r.findings['gdpr-s1'].verdict === 'satisfies' && r.findings['gdpr-s1'].citations.length === 1);
  check('per-requirement limitation captured',
    /actually executed/.test(r.findings['gdpr-s5'].beyondTheDocument));
  check('absence claim carries the pages it is scoped to',
    r.findings['gdpr-s6'].pagesSearched.length === 2, JSON.stringify(r.findings['gdpr-s6'].pagesSearched));
  check('absence needs no citation', r.findings['gdpr-s6'].verdict === 'not_addressed');

  /* --- A verdict with no surviving quote must not stand ---------------- */
  script = [() => stub({
    findings: [{
      requirement_id: 'gdpr-s1', verdict: 'satisfies',
      citations: [{ page_url: 'https://calmly.example/privacy', quote: 'every purpose is mapped to an Article 6 basis', shows: 'invented' }],
      reasoning: 'Reads well, cites nothing real.',
    }],
  })];
  r = await analyze({ requirements: REQS, pages: PAGES }, { client: fakeClient });
  const f = r.findings['gdpr-s1'];
  check('invented citation dropped', f.citations.length === 0 && f.droppedCitations.length === 1);
  check('unsupported verdict DOWNGRADED, not kept', f.verdict === 'cannot_determine', f.verdict);
  check('the downgrade is recorded, not silent', f.downgradedFrom === 'satisfies', String(f.downgradedFrom));

  /* --- Requirements it was not asked about are ignored ----------------- */
  script = [() => stub({
    findings: [
      { requirement_id: 'not-a-requirement', verdict: 'satisfies', citations: [], reasoning: 'x' },
      { requirement_id: 'gdpr-s1', verdict: 'cannot_determine', citations: [], reasoning: 'y' },
    ],
  })];
  r = await analyze({ requirements: REQS, pages: PAGES }, { client: fakeClient });
  check('unknown requirement id ignored', !r.findings['not-a-requirement']);
  check('requirements with no finding are reported as missing',
    r.missing.includes('gdpr-s5') && r.missing.includes('gdpr-s6'), JSON.stringify(r.missing));

  /* --- Nothing to read ------------------------------------------------- */
  r = await analyze({ requirements: REQS, pages: [{ url: 'x', text: 'tiny' }] }, { client: fakeClient });
  check('refuses to judge when no page had usable text', r.ok === false && /enough text/.test(r.error));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
})();
