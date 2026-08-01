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

  /* --- One region at a time, selected by the grade stamp --------------- */
  const regInfo = await page.evaluate(() => {
    const site = state.sites.find(s => s.id === state.selectedSiteId);
    site.manualRegs.GDPR = true; site.manualRegs.CCPA = true;   // both in scope
    state.focus = null;
    render();
    return {
      stamps: document.querySelectorAll('[data-select-reg]').length,
      active: document.querySelectorAll('.stamp-wrap.active').length,
      blocks: document.querySelectorAll('.reg-block').length,
      showing: state.activeReg || (document.querySelector('.stamp-wrap.active') || {}).getAttribute?.('data-select-reg'),
    };
  });
  check('both regulations offered as selectable stamps', regInfo.stamps === 2, String(regInfo.stamps));
  check('exactly one stamp is active', regInfo.active === 1, String(regInfo.active));
  check('only ONE regulation block rendered at a time', regInfo.blocks === 1, String(regInfo.blocks));

  await page.click('[data-select-reg="CCPA"]');
  await page.waitForTimeout(250);
  const switched = await page.evaluate(() => ({
    active: state.activeReg,
    blocks: document.querySelectorAll('.reg-block').length,
  }));
  check('clicking a stamp switches region', switched.active === 'CCPA' && switched.blocks === 1,
    JSON.stringify(switched));

  /* --- Open items above, passing collapsed at the bottom --------------- */
  const grouping = await page.evaluate(() => {
    const drawer = document.querySelector('[data-toggle-passing]');
    const openLabel = document.querySelector('.ledger-section-label');
    const body = document.body.innerHTML;
    return {
      hasDrawer: !!drawer,
      drawerCollapsed: drawer && !drawer.classList.contains('open'),
      drawerText: drawer ? drawer.textContent.trim().replace(/\s+/g, ' ') : '',
      needsLabel: openLabel ? openLabel.textContent.trim() : '',
      // the drawer must come after the open list in document order
      drawerAfterOpen: body.indexOf('data-toggle-passing') > body.indexOf('Needs attention'),
    };
  });
  check('passing items are in a drawer', grouping.hasDrawer);
  check('passing drawer starts collapsed', grouping.drawerCollapsed === true);
  check('passing drawer sits below the open items', grouping.drawerAfterOpen === true);
  check('open items are headed "Needs attention"', /Needs attention/.test(grouping.needsLabel), grouping.needsLabel);

  await page.click('[data-toggle-passing]');
  await page.waitForTimeout(200);
  check('passing drawer expands on click',
    await page.$eval('[data-toggle-passing]', e => e.classList.contains('open')) === true);
  await page.click('[data-toggle-passing]');
  await page.waitForTimeout(150);

  /* --- Focus mode: one at a time -------------------------------------- */
  await page.click('[data-focus-start]');
  await page.waitForTimeout(300);
  const focus = await page.evaluate(() => {
    const panel = document.querySelector('.focus-panel');
    return {
      open: !!panel,
      count: (document.querySelector('.focus-count') || {}).textContent || '',
      items: document.querySelectorAll('.focus-item .ledger-row, .focus-item .checklist-item').length,
      regBlocks: document.querySelectorAll('.reg-block').length,
    };
  });
  check('focus mode opens', focus.open);
  check('focus mode shows exactly one requirement', focus.items === 1, String(focus.items));
  check('focus mode shows queue position', /\d+ of \d+ outstanding/.test(focus.count), focus.count);
  check('focus mode replaces the full list', focus.regBlocks === 0, String(focus.regBlocks));

  const firstItem = await page.$eval('.focus-item', e => e.textContent.slice(0, 60));
  await page.click('[data-focus-next]');
  await page.waitForTimeout(250);
  const secondItem = await page.$eval('.focus-item', e => e.textContent.slice(0, 60));
  check('Skip advances to a different requirement', firstItem !== secondItem);

  await page.click('[data-focus-exit]');
  await page.waitForTimeout(250);
  check('closing focus returns to the list',
    await page.$('.focus-panel') === null && await page.$('.reg-block') !== null);

  /* --- Attachments: the readable / filed-only split -------------------- */
  const attItem = await page.evaluate(() => {
    const el = document.querySelector('[data-att-add]');
    return el ? el.getAttribute('data-att-add') : null;
  });
  check('attachment control present on requirements', !!attItem, String(attItem));

  await page.setInputFiles(`[data-att-add="${attItem}"]`, [
    { name: 'delete-flow.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') },
    { name: 'walkthrough.mp4', mimeType: 'video/mp4', buffer: Buffer.from('0000001c66747970', 'hex') },
  ]);
  await page.waitForTimeout(500);

  const atts = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.att-row')];
    return rows.map(r => ({
      name: (r.querySelector('.att-name') || {}).textContent || '',
      tier: (r.querySelector('.att-tier') || {}).textContent || '',
      why: (r.querySelector('.att-why') || {}).textContent || '',
    }));
  });
  const png = atts.find(a => /delete-flow/.test(a.name));
  const mp4 = atts.find(a => /walkthrough/.test(a.name));
  check('both files attached', atts.length === 2, JSON.stringify(atts.map(a => a.name)));
  check('image marked as readable', png && /Will be read/.test(png.tier), png && png.tier);
  check('video marked as filed-only', mp4 && /Filed, not read/.test(mp4.tier), mp4 && mp4.tier);
  check('video says WHY it will not be read', mp4 && /cannot be watched|can’t be watched/.test(mp4.why), mp4 && mp4.why);
  check('the honest split is stated up front',
    await page.$eval('.att-legend', e => /never described|not.*evidence/i.test(e.textContent)));

  const payload = await page.evaluate((id) => {
    const site = state.sites.find(s => s.id === state.selectedSiteId);
    const p = attPayload(site, id);
    return p.map(a => ({name: a.name, hasData: !!a.data}));
  }, attItem);
  check('readable file bytes are sent, unreadable ones are not',
    payload.find(a => /delete-flow/.test(a.name)).hasData === true &&
    payload.find(a => /walkthrough/.test(a.name)).hasData === false,
    JSON.stringify(payload));

  const attAudit = await page.evaluate(() => {
    const site = state.sites.find(s => s.id === state.selectedSiteId);
    const html = buildAuditLogHTML(site);
    return {
      hasVideo: /walkthrough\.mp4/.test(html),
      marksNotInspected: /filed only — not inspected/.test(html),
      marksRead: /read by the reviewer/.test(html),
    };
  });
  check('audit log records every attachment, inspected or not', attAudit.hasVideo);
  check('audit log marks which files were actually inspected',
    attAudit.marksNotInspected && attAudit.marksRead, JSON.stringify(attAudit));

  /* --- Partial gets the same record-assessment flow as Fail ------------ */
  const flows = await page.evaluate(() => {
    const site = state.sites.find(s => s.id === state.selectedSiteId);
    state.focus = null; state.activeReg = 'GDPR';
    site.crawlFindings = site.crawlFindings || {};
    // one of each status, straight from the rule engine
    site.crawlFindings['gdpr-s1'] = {determinable:true, status:'Partial', rationale:'partial', evidence:[]};
    site.crawlFindings['gdpr-s3'] = {determinable:true, status:'Fail', rationale:'fail', evidence:[]};
    site.crawlFindings['gdpr-s4'] = {determinable:true, status:'Pass', rationale:'pass', evidence:[]};
    state.collapsedItems['gdpr-s1'] = false;
    state.collapsedItems['gdpr-s3'] = false;
    state.collapsedItems['gdpr-s4'] = false;
    state.passingOpen['GDPR'] = true;
    render();
    const labelFor = id => {
      const b = document.querySelector(`[data-override-open-for="${id}"]`);
      return b ? b.textContent.trim() : null;
    };
    return {partial: labelFor('gdpr-s1'), fail: labelFor('gdpr-s3'), pass: labelFor('gdpr-s4')};
  });
  check('Partial offers the record-assessment flow', /Record your assessment/.test(flows.partial || ''), flows.partial);
  check('Fail offers the same flow', /Record your assessment/.test(flows.fail || ''), flows.fail);
  check('Partial and Fail are now identical', flows.partial === flows.fail);
  check('only a Pass is framed as an override', /Override/.test(flows.pass || ''), flows.pass);

  const prompts = await page.evaluate(() => {
    state.overrideOpen[state.selectedSiteId + '::gdpr-s1'] = true;
    state.overrideOpen[state.selectedSiteId + '::gdpr-s3'] = true;
    render();
    const ph = id => {
      const t = document.querySelector(`[data-override-explain-for="${id}"]`);
      return t ? t.getAttribute('placeholder') : null;
    };
    return {partial: ph('gdpr-s1'), fail: ph('gdpr-s3')};
  });
  check('Partial asks what you checked, not why the tool is wrong',
    /What did you check/.test(prompts.partial || ''), prompts.partial);
  check('Fail asks the same thing', prompts.partial === prompts.fail);

  /* --- Analyst findings render with their own provenance --------------- */
  const analysed = await page.evaluate(() => {
    const site = state.sites.find(s => s.id === state.selectedSiteId);
    Object.keys(state.overrideOpen).forEach(k => delete state.overrideOpen[k]);
    site.crawlFindings['gdpr-s3'] = {
      determinable: true, status: 'Pass', confidence: 'High', via: 'analyst',
      rationale: 'The policy maps each described purpose to a stated basis.',
      evidence: [{quote: 'we rely on your consent for marketing', url: 'https://x.example/privacy', where: 'consent basis', exact: true}],
      limitation: 'Whether the described practice is actually followed cannot be seen from a public page.',
    };
    render();
    const row = [...document.querySelectorAll('.ledger-row')]
      .find(r => /Privacy notice|privacy/i.test(r.textContent));
    const body = document.body.innerHTML;
    return {
      hasAnalysedTag: !!document.querySelector('.source-tag.analysed'),
      limitationWording: (document.querySelector('.crawl-limitation') || {}).textContent || '',
      body,
    };
  });
  check('an analyst finding is labelled "Read & assessed"', analysed.hasAnalysedTag);
  check('the limitation line no longer claims only you can judge it',
    /What reading the document can’t establish/.test(analysed.limitationWording),
    analysed.limitationWording.slice(0, 80));

  /* The cap rule: lifted where it existed because matching couldn't read,
     kept where the answer lives outside the document. */
  const caps = await page.evaluate(() => {
    const mk = (verdict) => ({verdict, citations:[{page_url:'u', quote:'q', shows:'s'}], reasoning:'r', beyondTheDocument:'', pagesSearched:['u']});
    return {
      liftable: analysisToFinding('gdpr-s3', mk('satisfies')).status,   // analystLiftsCap
      runtime:  analysisToFinding('gdpr-s2', mk('satisfies')).status,   // tracker timing
      short:    analysisToFinding('gdpr-s1', mk('falls_short')).status,
      absent:   analysisToFinding('gdpr-s1', mk('not_addressed')).status,
      absentWording: analysisToFinding('gdpr-s1', mk('not_addressed')).rationale,
    };
  });
  check('reading lifts a cap that existed because matching could not read',
    caps.liftable === 'Pass', caps.liftable);
  check('a cap about runtime behaviour survives reading', caps.runtime === 'Partial', caps.runtime);
  check('falls_short maps to Partial', caps.short === 'Partial', caps.short);
  check('absence maps to Fail', caps.absent === 'Fail', caps.absent);
  check('absence is scoped to the pages searched, not the company',
    /statement about these pages, not about the company/.test(caps.absentWording),
    caps.absentWording.slice(-90));

  /* --- Never fall back silently -------------------------------------- */
  const banners = await page.evaluate(() => {
    const site = state.sites.find(s => s.id === state.selectedSiteId);
    site.crawl = {raw: {pages: [{role:'homepage', url:'https://x.example/', text:'x'}], discovery:{method:'links'}, notes:[]}, at: Date.now(), notes: []};
    site.crawlFindings = {'gdpr-s1': {determinable:true, status:'Partial', rationale:'phrase match', evidence:[]}};
    render();
    const matched = (document.querySelector('.honesty-banner') || {}).textContent || '';

    site.crawlFindings['gdpr-s1'] = {determinable:true, status:'Pass', via:'analyst', rationale:'read it', evidence:[], limitation:'x'};
    site.analysisMeta = {model: 'claude-opus-5'};
    render();
    const read = (document.querySelector('.honesty-banner') || {}).textContent || '';
    return {matched, read};
  });
  check('banner says plainly when the pages were NOT read',
    /pages were not read/i.test(banners.matched), banners.matched.slice(-140));
  check('banner explains why some findings defer to you',
    /judgment is yours/i.test(banners.matched));
  check('banner reports how many were assessed by reading',
    /assessed by reading the retrieved text/i.test(banners.read), banners.read.slice(-140));
  check('banner names the model that read them', /claude-opus-5/.test(banners.read));

  /* --- Strictness must not silently discard a read assessment ---------- */
  const survived = await page.evaluate(() => {
    const site = state.sites.find(s => s.id === state.selectedSiteId);
    site.crawlFindings['gdpr-s1'] = {determinable:true, status:'Pass', via:'analyst', rationale:'read it', evidence:[], limitation:'x'};
    site.crawlFindings['gdpr-s4'] = {determinable:true, status:'Pass', rationale:'phrase', evidence:[]};
    state.strictness = 5;
    recomputeCrawlFindings();
    const f = site.crawlFindings['gdpr-s1'];
    return {via: f && f.via, stale: f && f.strictnessStale, phraseRedone: site.crawlFindings['gdpr-s4'].via};
  });
  check('changing strictness keeps the analyst finding', survived.via === 'analyst', String(survived.via));
  check('the kept finding is flagged as assessed at a different strictness', survived.stale === true);
  check('phrase findings are still recomputed', survived.phraseRedone === undefined);

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
