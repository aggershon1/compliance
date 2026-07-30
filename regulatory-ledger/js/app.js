/* ============================================================
   STATE
   ============================================================ */
const state = {
  sites: [],
  selectedSiteId: null,
  activeTab: 'compliance',
  scanning: false,
  scanStepIndex: 0,
  scanTargetDomain: '',
  scanningExistingSiteId: null,
  scanKind: 'url',              // 'url' (simulated crawl) or 'code' (real source audit)
  codeAuditProgress: null,      // {read, total} while a source audit is running
  showNewScanForm: false,
  newScanMode: 'url',           // which entry path the New Scan form is showing
  pendingCodeFileCount: 0,      // count of files picked in the folder input (files themselves live outside state)
  newScanCountries: [],        // country codes checked in the New Scan form
  newScanManualCountries: [],  // [{name}] added via free-text in the New Scan form
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
  sevWeights: {...DEFAULT_SEV_WEIGHT},
  settingsMenuOpen: false,       // top-right Settings dropdown (weighting + stored data)
  storageWarning: null,          // set by storage.js when a save can't fully succeed
  lastLoadedAt: null,            // timestamp of the restored session, if any
  importMessage: null,           // result banner after an import attempt
};

/* Selected folder files for a pending source audit. Deliberately a module
   variable, not state: render() rebuilds the DOM (losing the file input's
   selection), and File handles aren't serializable state anyway. */
let pendingCodeFiles = null;

const SCAN_STEPS = [
  'Crawling site structure (logged-out pages only)…',
  'Reading privacy policy & terms…',
  'Inventorying cookies & trackers…',
  'Comparing against selected regulations…',
  'Compiling risk & trust assessment…',
];

function cleanDomain(input){
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '');
  d = d.split('/')[0];
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

/* ============================================================
   EVENT HANDLERS
   ============================================================ */
function attachHandlers(site){
  const addBtn = document.getElementById('btn-add-site');
  if(addBtn) addBtn.addEventListener('click', ()=>{
    state.showNewScanForm = true;
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

  document.querySelectorAll('[data-scan-mode]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.newScanMode = el.getAttribute('data-scan-mode');
      state.newScanError = false;
      render();
    });
  });

  const codeFolderInput = document.getElementById('code-folder-input');
  if(codeFolderInput) codeFolderInput.addEventListener('change', (e)=>{
    pendingCodeFiles = e.target.files.length ? Array.from(e.target.files) : null;
    state.pendingCodeFileCount = pendingCodeFiles ? pendingCodeFiles.length : 0;
    state.newScanError = false;
    render();
  });

  const newForm = document.getElementById('new-scan-form');
  if(newForm) newForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    if(state.newScanCountries.length===0 && state.newScanManualCountries.length===0){
      state.newScanError = 'Select or add at least one country before scanning.';
      render();
      return;
    }
    if(state.newScanMode === 'code'){
      if(pendingCodeFiles && pendingCodeFiles.length) startCodeAudit(pendingCodeFiles);
      else { state.newScanError = 'Choose your repo folder before running the audit.'; render(); }
      return;
    }
    const val = document.getElementById('new-scan-input').value;
    if(val && val.trim()) startScan(cleanDomain(val));
  });

  document.querySelectorAll('[data-site-id]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.selectedSiteId = el.getAttribute('data-site-id');
      state.activeTab = 'compliance';
      state.showNewScanForm = false;
      render();
    });
  });

  const rescanBtn = document.getElementById('btn-rescan');
  if(rescanBtn) rescanBtn.addEventListener('click', ()=>{ if(site && site.kind!=='code') startScan(site.domain, site); });

  const exportBtn = document.getElementById('btn-export');
  if(exportBtn) exportBtn.addEventListener('click', ()=>{
    if(!site) return;
    const scan = site.scans[site.scans.length-1];
    document.getElementById('print-report').innerHTML = buildPrintReportHTML(site, scan);
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

  const reauditInput = document.getElementById('reaudit-folder-input');
  if(reauditInput) reauditInput.addEventListener('change', (e)=>{
    if(!site) return;
    const files = Array.from(e.target.files || []);
    if(files.length) startCodeAudit(files, site);
  });

  const regionFilter = document.getElementById('leg-region-filter');
  if(regionFilter) regionFilter.addEventListener('change', (e)=>{ state.legFilterRegion = e.target.value; render(); });
  const statusFilter = document.getElementById('leg-status-filter');
  if(statusFilter) statusFilter.addEventListener('change', (e)=>{ state.legFilterStatus = e.target.value; render(); });
  const siteOnlyToggle = document.getElementById('leg-site-only-toggle');
  if(siteOnlyToggle) siteOnlyToggle.addEventListener('change', (e)=>{ state.legFilterSiteOnly = e.target.checked; render(); });

  document.querySelectorAll('[data-weight-for]').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const sev = el.getAttribute('data-weight-for');
      const v = Number(e.target.value);
      if(!isNaN(v)) state.sevWeights[sev] = v;
      render();
    });
  });
  const resetWeightsBtn = document.getElementById('btn-reset-weights');
  if(resetWeightsBtn) resetWeightsBtn.addEventListener('click', ()=>{
    state.sevWeights = {...DEFAULT_SEV_WEIGHT};
    render();
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

  document.querySelectorAll('[data-submit-for]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const itemId = el.getAttribute('data-submit-for');
      const item = [...GDPR_CHECKLIST, ...CCPA_CHECKLIST].find(i=>i.id===itemId);
      const draft = getDraft(site.id, itemId);
      const result = reviewSubmission(item, draft.description, !!draft.screenshot, '');
      if(result.needsFollowUp){
        site.checklistState[itemId] = { checked:true, finalized:false, needsFollowUp:true, followUpQuestion: result.followUpQuestion, sketch: result.sketch };
      } else {
        site.checklistState[itemId] = { checked:true, finalized:true, needsFollowUp:false, status: result.status, confidence: result.confidence, rationale: result.rationale, attestedAt: Date.now() };
      }
      render();
    });
  });

  document.querySelectorAll('[data-finalize-for]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const itemId = el.getAttribute('data-finalize-for');
      const item = [...GDPR_CHECKLIST, ...CCPA_CHECKLIST].find(i=>i.id===itemId);
      const draft = getDraft(site.id, itemId);
      const result = reviewSubmission(item, draft.description, !!draft.screenshot, draft.followUpAnswer || 'no further detail provided');
      site.checklistState[itemId] = { checked:true, finalized:true, needsFollowUp:false, status: result.status, confidence: result.confidence, rationale: result.rationale, attestedAt: Date.now() };
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
    el.addEventListener('click', ()=>{
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

      site.overrides[itemId] = { status: draft.status, explanation: draft.explanation.trim(), previousStatus, timestamp: Date.now() };
      if(!state.overrideHistory[itemId]) state.overrideHistory[itemId] = [];
      state.overrideHistory[itemId].push({domain: site.domain, explanation: draft.explanation.trim(), timestamp: Date.now()});
      delete state.overrideOpen[key];
      delete state.overrideDrafts[key];
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

function startScan(domain, existingSite){
  state.scanning = true;
  state.scanKind = 'url';
  state.scanningExistingSiteId = existingSite ? existingSite.id : null;
  state.scanTargetDomain = domain;
  state.scanStepIndex = 0;
  state.showNewScanForm = false;
  render();

  const stepInterval = setInterval(()=>{
    state.scanStepIndex++;
    if(state.scanStepIndex >= SCAN_STEPS.length){
      clearInterval(stepInterval);
      finishScan(domain, existingSite);
      return;
    }
    render();
  }, 480);
}

function finishScan(domain, existingSite){
  const salt = String(Date.now());
  const countryCodes = existingSite ? existingSite.selectedCountries : state.newScanCountries;
  const manualCountries = existingSite ? existingSite.manualCountries : state.newScanManualCountries;
  const posture = simPostureFor(countryCodes, manualCountries);
  const scan = runScan(domain, posture, salt);

  if(existingSite){
    existingSite.scans.push(scan);
    state.selectedSiteId = existingSite.id;
  } else {
    const id = 'site-' + Date.now();
    const docketNum = state.nextDocketNum++;
    state.sites.push({
      id, domain, docketNum,
      addedAt: Date.now(),
      manualRegs: defaultManualRegsFromCountries(countryCodes),
      selectedCountries: [...countryCodes],
      manualCountries: manualCountries.map(m=>({...m})),
      manualCompetitors: [],
      scans: [scan],
      checklistState: {},
      overrides: {},
    });
    state.selectedSiteId = id;
  }
  state.scanning = false;
  state.scanningExistingSiteId = null;
  state.activeTab = 'compliance';
  render();
}

/* ============================================================
   SOURCE AUDIT LIFECYCLE (Track 3 — real analysis, NOT simulated)
   ============================================================ */
async function startCodeAudit(files, existingSite){
  const rootName = existingSite ? existingSite.domain : codeAuditRootName(files);
  state.scanning = true;
  state.scanKind = 'code';
  state.scanningExistingSiteId = existingSite ? existingSite.id : null;
  state.scanTargetDomain = rootName;
  state.codeAuditProgress = {read:0, total:0};
  state.showNewScanForm = false;
  render();

  const audit = await analyzeCodebase(files, (read, total)=>{
    state.codeAuditProgress = {read, total};
    render();
  });

  if(audit.analyzedFiles === 0){
    state.scanning = false;
    state.scanningExistingSiteId = null;
    state.codeAuditProgress = null;
    const msg = 'No readable source files found in that folder — check that you selected the repo root, not a build output or empty directory.';
    if(existingSite){ state.reauditError = msg; }
    else { state.showNewScanForm = true; state.newScanError = msg; }
    render();
    return;
  }
  finishCodeAudit(rootName, audit, existingSite);
}

/* Build the scanned-track statuses + code-derived attestations from a fresh
   audit. Shared by first-time audits and re-audits. */
function codeAuditScanRecord(audit){
  const scannedGDPR = {}; GDPR_SCANNED.forEach(r=>{ scannedGDPR[r.id] = audit.results[r.id].status; });
  const scannedCCPA = {}; CCPA_SCANNED.forEach(r=>{ scannedCCPA[r.id] = audit.results[r.id].status; });
  return {
    timestamp: audit.analyzedAt,
    scanned: {GDPR: scannedGDPR, CCPA: scannedCCPA},
    trust: null,   // Privacy Trust measures the public-facing site, not source — see renderTrustTab
    source: 'code',
  };
}
function codeAuditAttestation(audit, itemId){
  const r = audit.results[itemId];
  if(!r || !r.found) return null;
  return {
    checked:true, finalized:true, needsFollowUp:false,
    status:r.status, confidence:r.confidence, rationale:r.rationale,
    attestedAt: audit.analyzedAt, fromCode:true,
  };
}

function finishCodeAudit(rootName, audit, existingSite){
  const scan = codeAuditScanRecord(audit);

  if(existingSite){
    /* Re-audit: the whole point is that manual work survives. Overrides are
       left completely untouched. Checklist entries you attested by hand are
       preserved as-is; entries that were derived from the previous audit
       (fromCode) are refreshed against the new evidence, because derived
       data should track the code rather than go stale silently. */
    existingSite.scans.push(scan);
    [...GDPR_CHECKLIST, ...CCPA_CHECKLIST].forEach(item=>{
      const prev = existingSite.checklistState[item.id];
      const isManual = prev && prev.checked && !prev.fromCode;
      if(isManual) return;
      const fresh = codeAuditAttestation(audit, item.id);
      if(fresh) existingSite.checklistState[item.id] = fresh;
      else if(prev && prev.fromCode) delete existingSite.checklistState[item.id];
    });
    existingSite.codeEvidence = audit.results;
    existingSite.codeStats = {totalFiles: audit.totalFiles, analyzedFiles: audit.analyzedFiles, skippedFiles: audit.skippedFiles};
    state.selectedSiteId = existingSite.id;
  } else {
    const countryCodes = state.newScanCountries;
    const manualCountries = state.newScanManualCountries;
    const checklistState = {};
    [...GDPR_CHECKLIST, ...CCPA_CHECKLIST].forEach(item=>{
      const fresh = codeAuditAttestation(audit, item.id);
      if(fresh) checklistState[item.id] = fresh;
    });

    const id = 'site-' + Date.now();
    const docketNum = state.nextDocketNum++;
    state.sites.push({
      id, domain: rootName, docketNum,
      kind: 'code',
      addedAt: Date.now(),
      manualRegs: defaultManualRegsFromCountries(countryCodes),
      selectedCountries: [...countryCodes],
      manualCountries: manualCountries.map(m=>({...m})),
      manualCompetitors: [],
      scans: [scan],
      checklistState,
      overrides: {},
      codeEvidence: audit.results,
      codeStats: {totalFiles: audit.totalFiles, analyzedFiles: audit.analyzedFiles, skippedFiles: audit.skippedFiles},
    });
    state.selectedSiteId = id;
  }

  pendingCodeFiles = null;
  state.pendingCodeFileCount = 0;
  state.codeAuditProgress = null;
  state.scanningExistingSiteId = null;
  state.reauditError = null;
  state.scanning = false;
  state.activeTab = 'compliance';
  render();
}

/* Restore any previously saved session before the first paint, so manual
   overrides and attestations from earlier runs are already in place. */
loadPersistedState();
render();
