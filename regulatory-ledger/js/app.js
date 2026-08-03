/* ============================================================
   STATE
   ============================================================ */
const state = {
  sites: [],
  selectedSiteId: null,
  activeTab: 'compliance',
  showNewScanForm: false,
  newScanCountries: [],        // country codes checked in the New Scan form
  newScanManualCountries: [],  // [{name}] added via free-text in the New Scan form
  newScanInput: '',            // the website being typed — survives the re-render a country toggle causes
  newScanManualInput: '',      // draft text for the manual-add box
  newScanError: false,
  legFilterRegion: 'All',
  legFilterStatus: 'All',
  legFilterSiteOnly: true,      // default the Legislation tab to this site's countries
  nextDocketNum: 1,
  drafts: {},
  overrideDrafts: {},
  overrideOpen: {},
  countryPanelOpen: false,
  overrideHistory: {},
  collapsedItems: {},
  manualCountryInput: {},       // per-site draft text for the post-scan "add a country" box
  manualCompetitorInput: {},    // per-site draft text for the "add a competitor" box
  strictness: DEFAULT_STRICTNESS,  // how literally findings must match statutory wording
  settingsMenuOpen: false,       // top-right Settings dropdown (strictness + stored data)
  storageWarning: null,          // set by storage.js when a save can't fully succeed
  lastLoadedAt: null,            // timestamp of the restored session, if any
  importMessage: null,           // result banner after an import attempt
  crawlBackend: null,            // {url, available, agent} — detected at boot
  crawling: false,               // a crawl is in flight
  analyzing: false,              // the reviewer is reading the retrieved pages
  crawlError: null,
  /* Link patterns by default: measured against betterhelp.com the agent
     returns the same pages, so running it by default would spend tokens
     for no observed gain. It stays one click away for sites where the
     crawl comes back thin. */
  discoveryMode: 'links',        // how the crawl picks pages: auto | agent | links
  activeReg: null,               // one regulation on screen at a time
  passingOpen: {},               // regKey -> is the "Passing" drawer expanded
  focus: null,                   // {reg, i} — work through open items one at a time
  reviewing: {},                 // itemId -> true while an attestation review is in flight
};

/* Keeps any path the user typed. Entering "betterhelp.com/privacy" should
   start the crawl at that page — useful when you already know where a
   document lives and don't want to rely on link discovery finding it. */
function cleanDomain(input){
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '');
  d = d.replace(/\/+$/, '');
  return d || 'example.com';
}
function pad3(n){ return String(n).padStart(3,'0'); }
function draftKey(siteId, itemId){ return siteId+'::'+itemId; }
function getDraft(siteId, itemId){
  const k = draftKey(siteId, itemId);
  if(!state.drafts[k]) state.drafts[k] = {description:'', screenshot:null, followUpAnswer:''};
  return state.drafts[k];
}
function effectiveRegs(site){
  const gdpr = site.manualRegs.GDPR || site.selectedCountries.some(c => (COUNTRIES.find(x=>x.code===c)||{}).regs && COUNTRIES.find(x=>x.code===c).regs.includes('GDPR'));
  const ccpa = site.manualRegs.CCPA || site.selectedCountries.some(c => (COUNTRIES.find(x=>x.code===c)||{}).regs && COUNTRIES.find(x=>x.code===c).regs.includes('CCPA'));
  return {GDPR: gdpr, CCPA: ccpa};
}
function countryLabelFor(site){
  const known = (site.selectedCountries||[]).map(code=>COUNTRIES.find(c=>c.code===code)).filter(Boolean).map(c=>c.name);
  const manual = (site.manualCountries||[]).map(m=>m.name);
  const all = [...known, ...manual];
  if(all.length===0) return '';
  if(all.length===1) return all[0];
  return `${all[0]} +${all.length-1} more`;
}
function countryLabelForDraft(){
  const known = state.newScanCountries.map(code=>COUNTRIES.find(c=>c.code===code)).filter(Boolean).map(c=>c.name);
  const manual = state.newScanManualCountries.map(m=>m.name);
  const all = [...known, ...manual];
  if(all.length===0) return '';
  if(all.length===1) return all[0];
  return `${all[0]} +${all.length-1} more`;
}

/* Re-run the automated review of every self-attestation that was judged
   from a written description, using the current strictness setting. Same
   input, same reviewer — only the tolerance changed, so the recorded status
   should move with it rather than reflect a threshold the user has since
   dialled away from.

   Deliberately untouched: manual overrides (an explicit human verdict
   outranks the reviewer at any strictness), items still awaiting a
   follow-up answer, and `attestedAt` — staleness tracks when a person
   attested, not when we recomputed. */
function reevaluateAttestations(){
  const allItems = [...GDPR_CHECKLIST, ...CCPA_CHECKLIST];
  state.sites.forEach(site=>{
    allItems.forEach(item=>{
      const st = site.checklistState[item.id];
      if(!st || !st.finalized || st.fromCode) return;
      if(site.overrides[item.id]) return;
      const draft = state.drafts[draftKey(site.id, item.id)];
      if(!draft || !draft.description) return;

      /* Model-reviewed attestations are not silently re-run. Re-reviewing
         means a network call the user didn't ask for and a bill they
         didn't expect, and quietly changing a recorded verdict behind
         their back is worse than showing it's out of date. Flag it and
         offer the button instead. */
      if(st.reviewer === 'model'){
        st.strictnessStale = st.strictnessAtReview !== undefined && st.strictnessAtReview !== state.strictness;
        return;
      }

      const answers = (st.turns || []).map(t=>t.answer).filter(Boolean).join(' ');
      const result = reviewSubmission(item, draft.description, !!draft.screenshot, answers || draft.followUpAnswer || '');
      if(result.needsFollowUp) return;   // wouldn't clear review at this strictness; leave the recorded verdict
      st.status = result.status;
      st.confidence = result.confidence;
      st.rationale = result.rationale;
    });
  });
}

/* Move to the next outstanding requirement in focus mode. The queue is
   recomputed rather than remembered: the item just answered has usually
   left the list, so holding an index into a stale array would skip the
   one after it. Staying put is therefore "advance" in most cases. */
function advanceFocus(site, manual){
  if(!state.focus) return;
  const scan = site.scans[site.scans.length-1];
  const before = state.focus.i;
  const remaining = openRows(allRequirementRows(site, scan, state.focus.reg)).length;
  if(remaining === 0) return;                 // the panel shows its done state
  if(manual){
    state.focus.i = (before + 1) % remaining;  // Skip wraps, so nothing is stranded
  } else {
    state.focus.i = Math.min(before, remaining - 1);
  }
}

/* ============================================================
   EVENT HANDLERS
   ============================================================ */
function attachHandlers(site){
  const addBtn = document.getElementById('btn-add-site');
  if(addBtn) addBtn.addEventListener('click', ()=>{
    state.showNewScanForm = true;
    state.newScanInput = '';
    state.newScanCountries = [];
    state.newScanManualCountries = [];
    state.newScanManualInput = '';
    state.newScanError = false;
    render();
  });

  const cancelBtn = document.getElementById('btn-cancel-new');
  if(cancelBtn) cancelBtn.addEventListener('click', ()=>{ state.showNewScanForm = false; render(); });

  document.querySelectorAll('[data-newscan-country]').forEach(el=>{
    el.addEventListener('change', (e)=>{
      const code = el.getAttribute('data-newscan-country');
      if(e.target.checked){
        if(!state.newScanCountries.includes(code)) state.newScanCountries.push(code);
      } else {
        state.newScanCountries = state.newScanCountries.filter(c=>c!==code);
      }
      state.newScanError = false;
      render();
    });
  });
  /* Selecting a country re-renders the whole form, so an unbound input
     loses whatever was typed — you entered the site, picked a region, and
     the site was gone. Mirror it into state on every keystroke, and render
     it back from there. No render() here: that would reset the caret. */
  const newScanInput = document.getElementById('new-scan-input');
  if(newScanInput) newScanInput.addEventListener('input', (e)=>{ state.newScanInput = e.target.value; });

  const newScanManualInput = document.getElementById('new-scan-manual-input');
  if(newScanManualInput) newScanManualInput.addEventListener('input', (e)=>{ state.newScanManualInput = e.target.value; });
  const newScanManualAdd = document.getElementById('btn-new-scan-manual-add');
  if(newScanManualAdd) newScanManualAdd.addEventListener('click', (e)=>{
    e.preventDefault();
    const name = (state.newScanManualInput||'').trim();
    if(!name) return;
    state.newScanManualCountries.push({name});
    state.newScanManualInput = '';
    state.newScanError = false;
    render();
  });
  document.querySelectorAll('[data-newscan-remove-manual]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.newScanManualCountries.splice(Number(el.getAttribute('data-newscan-remove-manual')), 1);
      render();
    });
  });

  const newForm = document.getElementById('new-scan-form');
  if(newForm) newForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    if(state.newScanCountries.length===0 && state.newScanManualCountries.length===0){
      state.newScanError = 'Select or add at least one country before scanning.';
      render();
      return;
    }
    const val = (document.getElementById('new-scan-input') || {}).value || state.newScanInput || '';
    if(val && val.trim()){
      state.newScanInput = '';
      createEntry(cleanDomain(val));
    }
  });

  document.querySelectorAll('[data-site-id]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.selectedSiteId = el.getAttribute('data-site-id');
      state.activeTab = 'compliance';
      state.showNewScanForm = false;
      render();
    });
  });

  const exportBtn = document.getElementById('btn-export');
  if(exportBtn) exportBtn.addEventListener('click', ()=>{
    if(!site) return;
    const scan = site.scans[site.scans.length-1];
    document.getElementById('print-report').innerHTML = buildPrintReportHTML(site, scan);
    window.print();
  });

  const crawlBtn = document.getElementById('btn-crawl');
  if(crawlBtn) crawlBtn.addEventListener('click', ()=>{ if(site) runCrawl(site); });

  const exportAuditBtn = document.getElementById('btn-export-audit');
  if(exportAuditBtn) exportAuditBtn.addEventListener('click', ()=>{
    if(!site) return;
    document.getElementById('print-report').innerHTML = buildAuditLogHTML(site);
    window.print();
  });

  const ffBtn = document.getElementById('btn-fastforward');
  if(ffBtn) ffBtn.addEventListener('click', ()=>{
    if(!site) return;
    Object.values(site.checklistState).forEach(st=>{
      if(st && st.attestedAt) st.attestedAt -= 100*86400000;
    });
    render();
  });

  document.querySelectorAll('.reg-toggle').forEach(el=>{
    el.addEventListener('click', ()=>{
      if(!site) return;
      site.manualRegs[el.getAttribute('data-reg')] = !site.manualRegs[el.getAttribute('data-reg')];
      render();
    });
  });

  const countryToggle = document.getElementById('btn-country-toggle');
  if(countryToggle) countryToggle.addEventListener('click', ()=>{ state.countryPanelOpen = !state.countryPanelOpen; render(); });

  document.querySelectorAll('[data-country-for]').forEach(el=>{
    el.addEventListener('change', (e)=>{
      if(!site) return;
      const code = el.getAttribute('data-country-for');
      if(e.target.checked){
        if(!site.selectedCountries.includes(code)) site.selectedCountries.push(code);
      } else {
        site.selectedCountries = site.selectedCountries.filter(c=>c!==code);
      }
      render();
    });
  });
  const panelManualInput = document.getElementById('country-panel-manual-input');
  if(panelManualInput) panelManualInput.addEventListener('input', (e)=>{
    if(!site) return;
    state.manualCountryInput[site.id] = e.target.value;
  });
  const panelManualAdd = document.getElementById('btn-country-panel-manual-add');
  if(panelManualAdd) panelManualAdd.addEventListener('click', ()=>{
    if(!site) return;
    const name = (state.manualCountryInput[site.id]||'').trim();
    if(!name) return;
    site.manualCountries = site.manualCountries || [];
    site.manualCountries.push({name});
    state.manualCountryInput[site.id] = '';
    render();
  });
  document.querySelectorAll('[data-remove-manual-country]').forEach(el=>{
    el.addEventListener('click', ()=>{
      if(!site) return;
      site.manualCountries.splice(Number(el.getAttribute('data-remove-manual-country')), 1);
      render();
    });
  });

  const competitorManualInput = document.getElementById('competitor-manual-input');
  if(competitorManualInput) competitorManualInput.addEventListener('input', (e)=>{
    if(!site) return;
    state.manualCompetitorInput[site.id] = e.target.value;
  });
  const competitorManualAdd = document.getElementById('btn-competitor-manual-add');
  if(competitorManualAdd) competitorManualAdd.addEventListener('click', ()=>{
    if(!site) return;
    const name = (state.manualCompetitorInput[site.id]||'').trim();
    if(!name) return;
    site.manualCompetitors = site.manualCompetitors || [];
    site.manualCompetitors.push({name});
    state.manualCompetitorInput[site.id] = '';
    render();
  });
  document.querySelectorAll('[data-remove-manual-competitor]').forEach(el=>{
    el.addEventListener('click', ()=>{
      if(!site) return;
      site.manualCompetitors.splice(Number(el.getAttribute('data-remove-manual-competitor')), 1);
      render();
    });
  });

  document.querySelectorAll('.tab-btn').forEach(el=>{
    el.addEventListener('click', ()=>{ state.activeTab = el.getAttribute('data-tab'); render(); });
  });

  const settingsToggle = document.getElementById('btn-settings-toggle');
  if(settingsToggle) settingsToggle.addEventListener('click', ()=>{
    state.settingsMenuOpen = !state.settingsMenuOpen;
    state.importMessage = null;
    render();
  });

  const exportDataBtn = document.getElementById('btn-export-data');
  if(exportDataBtn) exportDataBtn.addEventListener('click', ()=>{ exportStateFile(); });

  const importDataInput = document.getElementById('import-data-input');
  if(importDataInput) importDataInput.addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const result = await importStateFile(file);
    state.importMessage = result.ok
      ? `Imported ${result.siteCount} entr${result.siteCount===1?'y':'ies'}.`
      : result.error;
    render();
  });

  const clearDataBtn = document.getElementById('btn-clear-data');
  if(clearDataBtn) clearDataBtn.addEventListener('click', ()=>{
    if(!window.confirm('Delete all saved entries, overrides, and attestations from this browser? This cannot be undone — export first if you want a copy.')) return;
    clearPersistedState();
    state.sites = [];
    state.selectedSiteId = null;
    state.drafts = {};
    state.overrideHistory = {};
    state.nextDocketNum = 1;
    state.settingsMenuOpen = false;
    state.importMessage = null;
    render();
  });

  const regionFilter = document.getElementById('leg-region-filter');
  if(regionFilter) regionFilter.addEventListener('change', (e)=>{ state.legFilterRegion = e.target.value; render(); });
  const statusFilter = document.getElementById('leg-status-filter');
  if(statusFilter) statusFilter.addEventListener('change', (e)=>{ state.legFilterStatus = e.target.value; render(); });
  const siteOnlyToggle = document.getElementById('leg-site-only-toggle');
  if(siteOnlyToggle) siteOnlyToggle.addEventListener('change', (e)=>{ state.legFilterSiteOnly = e.target.checked; render(); });

  const strictnessSlider = document.getElementById('strictness-slider');
  if(strictnessSlider) strictnessSlider.addEventListener('input', (e)=>{
    const v = Number(e.target.value);
    if(isNaN(v) || !STRICTNESS_LEVELS[v]) return;
    state.strictness = v;
    reevaluateAttestations();
    recomputeCrawlFindings();   // stored crawl text, re-judged at the new strictness
    render();
  });

  document.querySelectorAll('input[name="discovery-mode"]').forEach(el=>{
    el.addEventListener('change', (e)=>{
      if(!e.target.checked) return;
      state.discoveryMode = e.target.value;
      render();
    });
  });

  /* ---- Region selector, passing drawer, focus mode ------------------- */
  const analyzeBtn = document.getElementById('btn-analyze');
  if(analyzeBtn) analyzeBtn.addEventListener('click', ()=>{ runAnalysis(site); });

  const copyStart = document.querySelector('[data-copy-start]');
  if(copyStart) copyStart.addEventListener('click', async ()=>{
    try{
      await navigator.clipboard.writeText(START_COMMANDS);
      copyStart.textContent = 'Copied';
      setTimeout(()=>{ copyStart.textContent = 'Copy'; }, 1600);
    }catch(e){
      /* Clipboard access is refused on file:// in some browsers. Select the
         text instead so ⌘C still works — better than a dead button. */
      const pre = document.querySelector('.start-cmd-block');
      if(pre){
        const r = document.createRange();
        r.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        copyStart.textContent = 'Selected — press ⌘C';
      }
    }
  });

  document.querySelectorAll('[data-select-reg]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.activeReg = el.getAttribute('data-select-reg');
      state.focus = null;      // a different regulation is a different queue
      render();
    });
  });

  document.querySelectorAll('[data-toggle-passing]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const reg = el.getAttribute('data-toggle-passing');
      state.passingOpen[reg] = !state.passingOpen[reg];
      render();
    });
  });

  document.querySelectorAll('[data-focus-start]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.focus = {reg: el.getAttribute('data-focus-start'), i: 0};
      render();
    });
  });
  const focusPrev = document.querySelector('[data-focus-prev]');
  if(focusPrev) focusPrev.addEventListener('click', ()=>{
    if(state.focus && state.focus.i > 0) state.focus.i--;
    render();
  });
  const focusNext = document.querySelector('[data-focus-next]');
  if(focusNext) focusNext.addEventListener('click', ()=>{ advanceFocus(site, true); render(); });
  document.querySelectorAll('[data-focus-exit]').forEach(el=>{
    el.addEventListener('click', ()=>{ state.focus = null; render(); });
  });

  /* ---- Evidence attachments ------------------------------------------ */
  document.querySelectorAll('[data-att-add]').forEach(el=>{
    el.addEventListener('change', async (e)=>{
      const itemId = el.getAttribute('data-att-add');
      const files = [...(e.target.files || [])];
      if(!files.length) return;
      for(const f of files) await attAddFile(site, itemId, f);
      render();
    });
  });
  document.querySelectorAll('[data-att-link]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const itemId = el.getAttribute('data-att-link');
      const url = prompt('Paste the link (Figma, Google Doc, Notion, a recording…).\n\nLinks are filed as a reference for a human reviewer — they are not opened or read.');
      if(!url || !url.trim()) return;
      const label = prompt('Label for this link (optional):', url.trim());
      attAddLink(site, itemId, url.trim(), (label||'').trim() || url.trim());
      render();
    });
  });
  document.querySelectorAll('[data-att-remove]').forEach(el=>{
    el.addEventListener('click', ()=>{
      attRemove(site, el.getAttribute('data-att-item'), el.getAttribute('data-att-remove'));
      render();
    });
  });

  document.querySelectorAll('[data-collapse-toggle]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = el.getAttribute('data-collapse-toggle');
      const currentlyCollapsed = el.getAttribute('data-currently-collapsed') === 'true';
      state.collapsedItems[id] = !currentlyCollapsed;
      render();
    });
  });
  document.querySelectorAll('[data-collapse-all]').forEach(el=>{
    el.addEventListener('click', ()=>{
      el.getAttribute('data-collapse-all').split(',').forEach(id=>{ state.collapsedItems[id] = true; });
      render();
    });
  });
  document.querySelectorAll('[data-expand-all]').forEach(el=>{
    el.addEventListener('click', ()=>{
      el.getAttribute('data-expand-all').split(',').forEach(id=>{ state.collapsedItems[id] = false; });
      render();
    });
  });

  if(!site) return;

  document.querySelectorAll('[data-check-for]').forEach(el=>{
    el.addEventListener('change', (e)=>{
      const itemId = el.getAttribute('data-check-for');
      const checked = e.target.checked;
      site.checklistState[itemId] = checked ? {checked:true} : {checked:false};
      render();
    });
  });

  document.querySelectorAll('[data-desc-for]').forEach(el=>{
    el.addEventListener('input', (e)=>{ getDraft(site.id, el.getAttribute('data-desc-for')).description = e.target.value; });
  });
  document.querySelectorAll('[data-followup-for]').forEach(el=>{
    el.addEventListener('input', (e)=>{ getDraft(site.id, el.getAttribute('data-followup-for')).followUpAnswer = e.target.value; });
  });
  document.querySelectorAll('[data-shot-for]').forEach(el=>{
    el.addEventListener('change', (e)=>{
      const itemId = el.getAttribute('data-shot-for');
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{ getDraft(site.id, itemId).screenshot = reader.result; render(); };
      reader.readAsDataURL(file);
    });
  });

  /* One handler drives the whole interview. Each click carries the answer
     to the outstanding question (if there is one) into the transcript and
     asks the reviewer to decide again — probe further, or record. The
     reviewer, not the UI, decides which of those happens, and the
     follow-up budget lives server-side so the loop always terminates. */
  document.querySelectorAll('[data-submit-for]').forEach(el=>{
    el.addEventListener('click', async ()=>{
      const itemId = el.getAttribute('data-submit-for');
      const item = [...GDPR_CHECKLIST, ...CCPA_CHECKLIST].find(i=>i.id===itemId);
      const draft = getDraft(site.id, itemId);
      const prev = site.checklistState[itemId] || {};
      const declining = el.hasAttribute('data-decline');

      const turns = (prev.turns || []).slice();
      if(prev.needsFollowUp && prev.followUpQuestion){
        turns.push({
          question: prev.followUpQuestion,
          answer: declining ? '(the user chose not to answer)' : (draft.followUpAnswer || '(no answer given)'),
        });
      }

      state.reviewing[itemId] = true;
      site.checklistState[itemId] = {...prev, checked:true, turns};
      render();

      const result = await reviewAttested(item, draft.description, {site, turns});
      delete state.reviewing[itemId];

      if(result.needsFollowUp && !declining){
        site.checklistState[itemId] = {
          checked:true, finalized:false, needsFollowUp:true, turns,
          followUpQuestion: result.followUpQuestion,
          whyItMatters: result.whyItMatters || null,
          sketch: result.sketch || null,
          reviewer: result.reviewer,
          fallbackReason: result.fallbackReason || null,
        };
      } else {
        site.checklistState[itemId] = {
          checked:true, finalized:true, needsFollowUp:false, turns,
          status: result.status, confidence: result.confidence, rationale: result.rationale,
          basis: result.basis || [], gaps: result.gaps || [],
          evidence: result.evidence || [], reference: result.reference || [],
          grounded: !!result.grounded,
          reviewer: result.reviewer,
          fallbackReason: result.fallbackReason || null,
          strictnessAtReview: state.strictness,
          attestedAt: Date.now(),
        };
      }
      draft.followUpAnswer = '';
      /* Focus mode's whole promise is answer → save → next. Advance only
         once the item is actually finalized; a follow-up question means
         we're still on this one. */
      if(state.focus && site.checklistState[itemId].finalized) advanceFocus(site);
      render();
    });
  });

  document.querySelectorAll('[data-override-open-for]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.overrideOpen[site.id+'::'+el.getAttribute('data-override-open-for')] = true;
      render();
    });
  });
  document.querySelectorAll('[data-override-cancel-for]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const itemId = el.getAttribute('data-override-cancel-for');
      delete state.overrideOpen[site.id+'::'+itemId];
      delete state.overrideDrafts[site.id+'::'+itemId];
      render();
    });
  });
  document.querySelectorAll('[data-override-status-for]').forEach(el=>{
    el.addEventListener('change', (e)=>{
      const itemId = el.getAttribute('data-override-status-for');
      const key = site.id+'::'+itemId;
      if(!state.overrideDrafts[key]) state.overrideDrafts[key] = {status:e.target.value, explanation:''};
      state.overrideDrafts[key].status = e.target.value;
    });
  });
  document.querySelectorAll('[data-override-explain-for]').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const itemId = el.getAttribute('data-override-explain-for');
      const key = site.id+'::'+itemId;
      if(!state.overrideDrafts[key]) state.overrideDrafts[key] = {status:'Pass', explanation:''};
      state.overrideDrafts[key].explanation = e.target.value;
      state.overrideDrafts[key].error = false;
    });
  });
  document.querySelectorAll('[data-override-submit-for]').forEach(el=>{
    el.addEventListener('click', async ()=>{
      const itemId = el.getAttribute('data-override-submit-for');
      const key = site.id+'::'+itemId;
      const draft = state.overrideDrafts[key];
      if(!draft || !draft.explanation || draft.explanation.trim().length < 5){
        if(draft) draft.error = true;
        render();
        return;
      }
      // determine previous (pre-override) status
      const isGdprScanned = GDPR_SCANNED.find(r=>r.id===itemId);
      const isCcpaScanned = CCPA_SCANNED.find(r=>r.id===itemId);
      const isGdprChecklist = GDPR_CHECKLIST.find(r=>r.id===itemId);
      const scan = site.scans[site.scans.length-1];
      let regKey, source, reqObj;
      if(isGdprScanned){ regKey='GDPR'; source='scanned'; reqObj=isGdprScanned; }
      else if(isCcpaScanned){ regKey='CCPA'; source='scanned'; reqObj=isCcpaScanned; }
      else if(isGdprChecklist){ regKey='GDPR'; source='attested'; reqObj=isGdprChecklist; }
      else { regKey='CCPA'; source='attested'; reqObj=CCPA_CHECKLIST.find(r=>r.id===itemId); }
      const previousStatus = rawStatus(site, scan, regKey, reqObj, source);

      const explanation = draft.explanation.trim();
      site.overrides[itemId] = { status: draft.status, explanation, previousStatus, timestamp: Date.now() };
      if(!state.overrideHistory[itemId]) state.overrideHistory[itemId] = [];
      state.overrideHistory[itemId].push({domain: site.domain, explanation, timestamp: Date.now()});
      delete state.overrideOpen[key];
      delete state.overrideDrafts[key];

      /* The status you recorded is the status — a person's judgment
         outranks the reviewer on an observable requirement, by design. But
         if evidence was attached, it's worth reading it back to you against
         the citation. Advisory only: it never changes what you recorded. */
      if(!site.evidenceReviews) site.evidenceReviews = {};
      if(attCounts(site, itemId).total > 0 && attestBackendReady()){
        state.reviewing[itemId] = true;
        render();
        const review = await reviewAttested(reqObj, explanation, {site, mode:'observable'});
        delete state.reviewing[itemId];
        site.evidenceReviews[itemId] = {
          advisory: true,
          rationale: review.rationale || '',
          evidence: review.evidence || [],
          reference: review.reference || [],
          gaps: review.gaps || [],
          reviewer: review.reviewer,
          at: Date.now(),
        };
      }

      if(state.focus) advanceFocus(site);
      render();
    });
  });
  document.querySelectorAll('[data-clear-override]').forEach(el=>{
    el.addEventListener('click', ()=>{
      delete site.overrides[el.getAttribute('data-clear-override')];
      render();
    });
  });
}

/* Creating an entry no longer "scans" anything — there is no crawler, and
   pretending otherwise is exactly what produced fabricated findings about
   real sites. An entry starts with every requirement Unassessed; you record
   what's actually true, and the audit log keeps the provenance. */
function createEntry(domain){
  const id = 'site-' + Date.now();
  const docketNum = state.nextDocketNum++;
  state.sites.push({
    id, domain, docketNum,
    kind: 'manual',
    addedAt: Date.now(),
    manualRegs: defaultManualRegsFromCountries(state.newScanCountries),
    selectedCountries: [...state.newScanCountries],
    manualCountries: state.newScanManualCountries.map(m=>({...m})),
    manualCompetitors: [],
    scans: [{timestamp: Date.now(), scanned:{GDPR:{}, CCPA:{}}, trust:null, source:'manual'}],
    checklistState: {},
    evidenceReviews: {},   // advisory reviewer readings of evidence on observable items
    overrides: {},
  });
  state.selectedSiteId = id;
  state.showNewScanForm = false;
  state.activeTab = 'compliance';
  render();
}

/* Read the pages of a stored crawl. Separate from runCrawl so it can be
   re-run without re-fetching the site — you should not have to hit a real
   site again because the reviewer wasn't reachable the first time, or
   because you turned a regulation on afterwards. */
async function runAnalysis(site){
  if(!site.crawl) return;
  state.analyzing = true;
  render();
  try{
    const analysis = await requestAnalysis(site);
    if(analysis && analysis.ok){
      const n = applyAnalysis(site, analysis);
      site.crawl.notes = n
        ? site.crawl.notes.filter(x => !/were retrieved but not read|but returned no findings|was not read in full|were not read in full/.test(x))
        : [...site.crawl.notes, 'The reviewer read the pages but returned no findings. Everything below comes from wording matches only.'];

      /* Fetching more pages than the reviewer can read makes a crawl look
         thorough while it isn't. Say which pages were cut short and by how
         much, rather than letting a partial read pass for a complete one. */
      const cut = analysis.truncated || [];
      if(cut.length){
        const worst = cut.map(t => `${t.url} (${t.kept ? `${Math.round(100*t.kept/t.total)}% read` : 'not read at all'})`).join('; ');
        site.crawl.notes = [...site.crawl.notes,
          `${cut.length} page(s) exceeded the reviewer's reading budget and ${cut.length===1?'was':'were'} not read in full: ${worst}. Raise ANALYST_TOTAL_CHARS on the crawl service to read more.`];
      }
    } else {
      /* Any non-ok outcome, including one with no error text, has to say
         something. Silence here is what made a stale phrase-rule line look
         like a considered verdict. */
      const why = (analysis && analysis.error) || 'the reviewer returned nothing.';
      site.crawl.notes = [...site.crawl.notes, `The pages were retrieved but not read: ${why} Findings below come from wording matches only.`];
    }
  }catch(e){
    site.crawl.notes = [...site.crawl.notes, `The pages were retrieved but not read (${e.message}). Findings below come from wording matches only.`];
  }
  state.analyzing = false;
  render();
}

async function runCrawl(site){
  state.crawling = true;
  state.crawlError = null;
  render();
  try{
    const raw = await requestCrawl(site.domain, state.discoveryMode);
    if(!raw.ok){
      state.crawlError = raw.error || 'The crawl did not complete.';
    } else {
      site.crawl = {raw, at: raw.fetchedAt, notes: raw.notes || []};
      site.crawlFindings = applyCrawlRules(raw);
      site.scans.push({timestamp: raw.fetchedAt, scanned:{GDPR:{}, CCPA:{}}, trust:null, source:'crawl'});

      /* Phrase matching is the baseline and always runs. If the reviewer is
         available it then reads the same pages properly and supersedes what
         it could judge — a keyword hit and a read assessment are not the
         same evidence, so which one produced a finding is recorded on it. */
      /* Health is checked once at boot, so a service started (or given a
         key) after the page loaded would look unavailable forever. Re-ask
         before deciding we can't read the pages. */
      if(!attestBackendReady()) await checkCrawlBackend();

      if(!attestBackendReady()){
        /* Never skip silently. Falling back to wording matches without
           saying so is how a weaker result gets mistaken for the same
           result — the exact thing this app is careful about elsewhere. */
        const svc = state.crawlBackend || {};
        const why = !svc.available
          ? `the crawl service at ${crawlBackendUrl()} isn’t reachable`
          : ((svc.agent && svc.agent.reason) || 'the reviewer isn’t configured');
        site.crawl.notes = [...site.crawl.notes,
          `The pages were retrieved but not read — ${why}. Findings below come from matching expected wording only, which is why some say the judgment is yours.`];
      } else {
        await runAnalysis(site);
      }
    }
  }catch(e){
    state.crawlError = `Could not reach the crawl service at ${crawlBackendUrl()} — is it running? (${e.message})`;
  }
  state.crawling = false;
  render();
}

/* Restore any previously saved session before the first paint, so manual
   overrides and attestations from earlier runs are already in place. */
loadPersistedState();
render();
/* Detect the crawl service in the background. The crawl action only appears
   once it answers, so the button never promises something isn't listening. */
checkCrawlBackend().then(()=>render());
