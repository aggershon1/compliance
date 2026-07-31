'use strict';
/* Browser smoke test of the real app, run against the actual file:// page.

   Covers the paths that only exist in a browser: the entry flow, the
   attestation review round trip with no crawl service running, how the
   interviewer's four output registers render, and — because basis text is
   model output echoed into innerHTML — that it is escaped rather than
   injected. */
/* Playwright is not a dependency of this project — the app has no build
   step and no package.json of its own. Use whichever copy is installed:
     npm i -g playwright  (or)  npx playwright
   Run: node ui.test.js */
const path = require('node:path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  try {
    ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
  } catch (e2) {
    console.log('Playwright is not installed — skipping the browser tests.');
    console.log('  npm i -g playwright   then re-run: node ui.test.js');
    process.exit(0);
  }
}

const APP = 'file://' + path.join(__dirname, 'regulatory-ledger.html');
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let failures = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION|Failed to load resource/.test(m.text())) errors.push(m.text()); });

  await page.goto(APP);
  await page.waitForTimeout(600);

  check('app loads with no JS errors', errors.length === 0, errors.join(' | '));

  // Add an entry
  await page.click('#btn-add-site');
  await page.waitForTimeout(200);
  // Country first: selecting one triggers a full re-render, which rebuilds
  // the (unbound) domain input and would discard anything typed before it.
  await page.click('[data-newscan-country]');
  await page.waitForTimeout(200);
  await page.fill('#new-scan-input', 'example.com');
  await page.waitForTimeout(100);
  await page.$eval('#new-scan-form', f => f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await page.waitForTimeout(500);
  check('entry created', await page.$('.checklist-item') !== null);

  // Open a checklist item and submit a description
  const SEL_BOX = '.checklist-item input[type=checkbox]';
  check('checklist checkbox present', await page.$(SEL_BOX) !== null);
  await page.click(SEL_BOX);            // re-render detaches handles; use selectors
  await page.waitForTimeout(300);

  check('description field appears when checked', await page.$('.checklist-textarea') !== null);
  await page.fill('.checklist-textarea', 'Users can delete their account from Settings, Privacy tab, without emailing support. It completes within 30 days and removes message history as well.');
  await page.waitForTimeout(150);

  check('reviewer hint tells the user which reviewer will run',
    await page.$('.reviewer-hint') !== null);
  const hintText = await page.$eval('.reviewer-hint', e => e.textContent);
  check('hint names the keyword fallback when no service is running',
    /keyword heuristic/.test(hintText), hintText.slice(0, 90));

  await page.click('[data-submit-for]');
  await page.waitForTimeout(700);

  const finalized = await page.$('.result-box');
  check('review completed and rendered a result', !!finalized);
  const tag = await page.$('.reviewer-tag.keyword');
  check('result is labelled as the keyword heuristic', !!tag);
  const fallbackNote = await page.$('.reviewer-fallback');
  check('fallback reason shown to the user', !!fallbackNote);
  if (fallbackNote) {
    const t = await fallbackNote.textContent();
    check('fallback names the missing service', /crawl service/.test(t), t.slice(0, 80));
  }

  /* --- The model-path rendering ---------------------------------------
     Unreachable without an API key, so inject a result of the shape the
     interviewer returns and check the four registers render distinctly —
     and that a hostile string in a quote is escaped, since basis text is
     model output echoed back into innerHTML. */
  const rendered = await page.evaluate(() => {
    const site = state.sites.find(s => s.id === state.selectedSiteId);
    const itemId = Object.keys(site.checklistState)[0];
    site.checklistState[itemId] = {
      checked: true, finalized: true, needsFollowUp: false,
      reviewer: 'model', status: 'Partial', confidence: 'Medium', grounded: true,
      rationale: 'Deletion is self-serve but the account record scope is unclear.',
      basis: [{ quote: 'delete their account from Settings <img src=x onerror=alert(1)>', establishes: 'self-serve deletion exists' }],
      gaps: ['Whether therapist session notes are erased alongside the profile'],
      turns: [{ question: 'Does deletion cover session notes?', answer: 'Not sure, I would need to check.' }],
      strictnessAtReview: state.strictness, attestedAt: Date.now(),
    };
    render();
    const body = document.body.innerHTML;
    return {
      hasBasis: !!document.querySelector('.basis-box'),
      hasGaps: !!document.querySelector('.gaps-box'),
      hasThread: !!document.querySelector('.interview-thread'),
      hasModelTag: !!document.querySelector('.reviewer-tag.model'),
      ungrounded: !!document.querySelector('.ungrounded-warn'),
      injected: body.includes('<img src=x onerror='),
      escaped: body.includes('&lt;img src=x onerror='),
    };
  });
  check('basis quotes rendered', rendered.hasBasis);
  check('gaps rendered separately from the rationale', rendered.hasGaps);
  check('interview transcript rendered', rendered.hasThread);
  check('result labelled as model-reviewed', rendered.hasModelTag);
  check('no ungrounded warning on a grounded result', rendered.ungrounded === false);
  check('model output is escaped, not injected', rendered.injected === false && rendered.escaped === true,
    JSON.stringify({ injected: rendered.injected, escaped: rendered.escaped }));

  const ung = await page.evaluate(() => {
    const site = state.sites.find(s => s.id === state.selectedSiteId);
    const itemId = Object.keys(site.checklistState)[0];
    site.checklistState[itemId].grounded = false;
    site.checklistState[itemId].basis = [];
    render();
    return !!document.querySelector('.ungrounded-warn');
  });
  check('ungrounded attestation warns prominently', ung === true);

  // Settings dropdown: discovery mode
  await page.click('.settings-gear-btn');
  await page.waitForTimeout(300);
  check('page-discovery setting rendered', await page.$('.discovery-opts') !== null);
  const opts = await page.$$('.discovery-opt');
  check('three discovery options offered', opts.length === 3, `${opts.length}`);
  const agentDisabled = await page.$('.discovery-opt.disabled');
  check('agent option disabled when unavailable', !!agentDisabled);

  // Audit log still builds
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const auditOk = await page.evaluate(() => {
    try {
      const site = state.sites.find(s => s.id === state.selectedSiteId);
      const html = buildAuditLogHTML(site);
      return html.length > 400 && /Self-attested/.test(html);
    } catch (e) { return 'ERR: ' + e.message; }
  });
  check('audit log builds with the new provenance', auditOk === true, String(auditOk));

  check('no JS errors after the full flow', errors.length === 0, errors.join(' | '));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  await browser.close();
  process.exitCode = failures ? 1 : 0;
})();
