'use strict';
/* ============================================================
   END TO END — the whole thing, actually running
   ============================================================
   Every other suite tests a piece: the analyst's gate with a stub, the
   render functions with injected state, the HTTP surface with curl-shaped
   calls. All of them passed while the feature did not work in the browser,
   which is the point of this file.

   It starts the real fixture site, the real crawl service as a child
   process, opens the real page, clicks the real Crawl button, and checks
   what a person would see afterwards. The only thing faked is the model
   itself — an SDK stub preloaded into the service — so no API key and no
   network are needed.

   If this passes and the app still misbehaves for someone, the problem is
   their environment rather than the code, and that is worth being able to
   say with confidence.

   Run: node e2e.test.js
   ============================================================ */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
  catch (e2) { console.log('Playwright not installed — skipping.'); process.exit(0); }
}

const ROOT = __dirname;
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FIXTURE_PORT = 8511;
const SERVICE_PORT = 8797;

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

/* The model, faked inside the service process. Quotes are copied out of
   the fixture's privacy page so the analyst's own citation gate passes —
   if it didn't, this test would be asserting on a downgraded verdict. */
const STUB = `
const p = require.resolve('${path.join(ROOT, 'server/agent/node_modules/@anthropic-ai/sdk')}');
const findings = [
  { requirement_id: 'gdpr-s1', verdict: 'satisfies',
    citations: [{ page_url: 'PRIVACY_URL', quote: 'we rely on contract, consent, legal obligation, and legitimate interests depending on the purpose', shows: 'each purpose carries a basis' }],
    reasoning: 'The policy names a lawful basis and ties it to the purpose of processing.',
    beyond_the_document: 'Whether the stated bases match what is actually done cannot be seen from a public page.' },
  { requirement_id: 'gdpr-s3', verdict: 'satisfies',
    citations: [{ page_url: 'PRIVACY_URL', quote: 'This policy explains what personal information', shows: 'the notice states its scope' }],
    reasoning: 'The notice sets out the categories collected and the rights available in plain language.',
    beyond_the_document: '' },
  { requirement_id: 'gdpr-s6', verdict: 'not_addressed', citations: [],
    reasoning: 'Nothing in the retrieved pages speaks to records of processing activities.',
    beyond_the_document: 'Records of processing are internal documents.' },
  { requirement_id: 'ccpa-s2', verdict: 'falls_short', citations: [],
    reasoning: 'The notice describes collection but not at the point of collection.',
    beyond_the_document: 'Notice at collection appears on forms a crawl does not reach.' },
];
class Fake {
  constructor(){
    this.messages = { create: async (req) => {
      const asked = JSON.stringify(req.messages);
      const wanted = findings.filter(f => asked.includes(f.requirement_id));
      return {
        content: [{ type:'tool_use', id:'t', name:'record_findings', input:{ findings: wanted } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 9000, output_tokens: 600 },
      };
    }};
  }
}
require.cache[p] = { id:'stub', filename:'stub', loaded:true, exports: Fake };
`;

function start(cmd, args, env, readyRe) {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  return new Promise(resolve => {
    const poll = () => (readyRe.test(log) ? resolve({ child, log: () => log }) : setTimeout(poll, 60));
    poll();
  });
}

(async () => {
  const stubPath = path.join(os.tmpdir(), `rl-sdk-stub-${process.pid}.js`);
  fs.writeFileSync(stubPath, STUB.replace(/PRIVACY_URL/g, `http://127.0.0.1:${FIXTURE_PORT}/privacy`));

  const fixture = await start(process.execPath,
    [path.join(ROOT, 'server/agent/fixture/server.js')],
    { FIXTURE_PORT: String(FIXTURE_PORT) }, /Fixture site on/);

  const service = await start(process.execPath, [path.join(ROOT, 'server/index.js')], {
    PORT: String(SERVICE_PORT),
    ALLOW_PRIVATE_HOSTS: '1',
    ANTHROPIC_API_KEY: 'sk-ant-stub',
    NODE_OPTIONS: `-r ${stubPath}`,
  }, /listening on/);

  check('service starts with agents enabled', /agents: enabled/.test(service.log()),
    (service.log().match(/agents:.*/) || [''])[0]);

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  try {
    await page.goto('file://' + path.join(ROOT, 'regulatory-ledger.html'));
    await page.waitForTimeout(400);

    /* Point the app at this test's service instead of the default port. */
    await page.evaluate((port) => {
      state.crawlBackend = { url: `http://127.0.0.1:${port}` };
    }, SERVICE_PORT);
    const healthy = await page.evaluate(() => checkCrawlBackend().then(() => ({
      available: state.crawlBackend.available,
      agent: state.crawlBackend.agent,
    })));
    check('app sees the service', healthy.available === true);
    check('app sees the reviewer as available', healthy.agent && healthy.agent.available === true,
      JSON.stringify(healthy.agent));

    // Create an entry pointed at the fixture site
    await page.click('#btn-add-site');
    await page.waitForTimeout(200);
    await page.click('[data-newscan-country="DE"], [data-newscan-country]');
    await page.waitForTimeout(200);
    await page.fill('#new-scan-input', `127.0.0.1:${FIXTURE_PORT}`);
    await page.waitForTimeout(100);
    await page.$eval('#new-scan-form', f => f.requestSubmit());
    await page.waitForTimeout(400);
    /* Deliberately crawl with only GDPR in scope. Analysis used to be
       limited to whatever was selected at that moment, so CCPA
       requirements were never read and kept phrase findings forever. */
    await page.evaluate(() => {
      const s = state.sites.find(x => x.id === state.selectedSiteId);
      s.manualRegs.GDPR = true;
      s.manualRegs.CCPA = false;
      s.selectedCountries = [];
      state.activeReg = 'GDPR';
      render();
    });
    await page.waitForTimeout(200);

    check('crawl button offered', await page.$('#btn-crawl') !== null);
    await page.click('#btn-crawl');

    // Wait for the crawl + analysis to finish
    for (let i = 0; i < 60; i++) {
      const busy = await page.evaluate(() => state.crawling || state.analyzing);
      if (!busy) break;
      await page.waitForTimeout(250);
    }

    const result = await page.evaluate(() => {
      const s = state.sites.find(x => x.id === state.selectedSiteId);
      const f = s.crawlFindings || {};
      return {
        error: state.crawlError,
        pages: s.crawl ? s.crawl.raw.pages.length : 0,
        notes: (s.crawl && s.crawl.notes) || [],
        s1: f['gdpr-s1'], s3: f['gdpr-s3'], s6: f['gdpr-s6'], ccpa2: f['ccpa-s2'],
        analysisMeta: s.analysisMeta,
      };
    });

    check('the crawl completed', !result.error && result.pages > 1,
      result.error || `${result.pages} pages`);
    check('the analyst actually ran', !!result.analysisMeta,
      JSON.stringify(result.notes));
    check('findings are marked as read, not matched',
      result.s1 && result.s1.via === 'analyst', result.s1 && result.s1.via);

    /* The reported bug: this requirement kept showing the phrase-rule
       limitation text after a re-crawl. */
    const stale = 'judgment only you can make';
    check('gdpr-s3 no longer shows the "judgment only you can make" text',
      result.s3 && !(result.s3.limitation || '').includes(stale),
      result.s3 && result.s3.limitation);
    check('gdpr-s3 carries the reviewer’s own limitation instead',
      result.s3 && result.s3.via === 'analyst', result.s3 && result.s3.via);
    check('a cap that existed only because matching could not read is lifted',
      result.s3 && result.s3.status === 'Pass', result.s3 && result.s3.status);
    check('absence is scoped to the pages searched',
      result.s6 && /statement about these pages/.test(result.s6.rationale || ''),
      result.s6 && (result.s6.rationale || '').slice(-70));

    check('requirements outside the crawl-time scope are still read',
      result.ccpa2 && result.ccpa2.via === 'analyst',
      result.ccpa2 ? result.ccpa2.via : 'no finding at all');

    /* Re-reading a stored crawl must not hit the site again. */
    const before = await page.evaluate(() => state.sites.find(x => x.id === state.selectedSiteId).analysisMeta.at);
    await page.waitForTimeout(1100);
    await page.click('#btn-analyze');
    for (let i = 0; i < 40; i++) {
      if (!(await page.evaluate(() => state.analyzing))) break;
      await page.waitForTimeout(200);
    }
    const after = await page.evaluate(() => state.sites.find(x => x.id === state.selectedSiteId).analysisMeta.at);
    check('“Read the retrieved pages” re-runs analysis without re-crawling', after > before,
      `${before} -> ${after}`);

    const shown = await page.evaluate(() => document.body.innerText);
    check('the stale sentence is gone from the page', !shown.includes(stale));
    check('the banner says the pages were read',
      /assessed by reading the retrieved text/.test(shown),
      (shown.match(/.{0,60}assessed by reading.{0,40}/) || [''])[0]);
    /* innerText applies text-transform in Chromium, and the tag is
       uppercased in CSS — match case-insensitively rather than against
       what the stylesheet happens to do today. */
    check('rows are labelled "Read & assessed"', /read & assessed/i.test(shown));
    check('no JS errors during the whole run', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    service.child.kill();
    fixture.child.kill();
    try { fs.unlinkSync(stubPath); } catch (e) {}
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
})();
