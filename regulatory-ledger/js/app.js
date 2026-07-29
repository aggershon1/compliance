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
  scanVariant: 'Global',
  showNewScanForm: false,
  legFilterRegion: 'All',
  legFilterStatus: 'All',
  nextDocketNum: 1,
  drafts: {},
  overrideDrafts: {},
  overrideOpen: {},
  countryPanelOpen: false,
  overrideHistory: {},
};

const SCAN_STEPS = [
  'Crawling site structure (logged-out pages only)\u2026',
  'Reading privacy policy & terms\u2026',
  'Inventorying cookies & trackers\u2026',
  'Comparing against selected regulations\u2026',
  'Compiling risk & trust assessment\u2026',
];

const VARIANTS = [
  {key:'Global', label:'Global / default'},
  {key:'US', label:'United States'},
  {key:'EU', label:'European Union'},
  {key:'CH', label:'Switzerland'},
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
function defaultCountriesFor(variant){
  if(variant==='EU') return ['DE'];
  if(variant==='US') return ['US-CA'];
  if(variant==='CH') return ['CH'];
  return [];
}
function defaultManualRegsFor(variant){
  if(variant==='EU') return {GDPR:true, CCPA:false};
  if(variant==='US') return {GDPR:false, CCPA:true};
  if(variant==='CH') return {GDPR:true, CCPA:false};
  return {GDPR:true, CCPA:true};
}
function effectiveRegs(site){
  const gdpr = site.manualRegs.GDPR || site.selectedCountries.some(c => (COUNTRIES.find(x=>x.code===c)||{}).regs && COUNTRIES.find(x=>x.code===c).regs.includes('GDPR'));
  const ccpa = site.manualRegs.CCPA || site.selectedCountries.some(c => (COUNTRIES.find(x=>x.code===c)||{}).regs && COUNTRIES.find(x=>x.code===c).regs.includes('CCPA'));
  return {GDPR: gdpr, CCPA: ccpa};
}

/* ============================================================
   EVENT HANDLERS
   ============================================================ */
function attachHandlers(site){
  const addBtn = document.getElementById('btn-add-site');
  if(addBtn) addBtn.addEventListener('click', ()=>{
    state.showNewScanForm = true;
    state.scanVariant = 'Global';
    render();
  });

  const cancelBtn = document.getElementById('btn-cancel-new');
  if(cancelBtn) cancelBtn.addEventListener('click', ()=>{ state.showNewScanForm = false; render(); });

  document.querySelectorAll('[data-variant]').forEach(el=>{
    el.addEventListener('click', ()=>{ state.scanVariant = el.getAttribute('data-variant'); render(); });
  });

  const newForm = document.getElementById('new-scan-form');
  if(newForm) newForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const val = document.getElementById('new-scan-input').value;
    if(val && val.trim()) startScan(cleanDomain(val), state.scanVariant);
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
  if(rescanBtn) rescanBtn.addEventListener('click', ()=>{ if(site) startScan(site.domain, site.variant, site); });

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

  document.querySelectorAll('.tab-btn').forEach(el=>{
    el.addEventListener('click', ()=>{ state.activeTab = el.getAttribute('data-tab'); render(); });
  });

  const regionFilter = document.getElementById('leg-region-filter');
  if(regionFilter) regionFilter.addEventListener('change', (e)=>{ state.legFilterRegion = e.target.value; render(); });
  const statusFilter = document.getElementById('leg-status-filter');
  if(statusFilter) statusFilter.addEventListener('change', (e)=>{ state.legFilterStatus = e.target.value; render(); });

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

function startScan(domain, variant, existingSite){
  state.scanning = true;
  state.scanTargetDomain = domain;
  state.scanVariant = variant || 'Global';
  state.scanStepIndex = 0;
  state.showNewScanForm = false;
  render();

  const stepInterval = setInterval(()=>{
    state.scanStepIndex++;
    if(state.scanStepIndex >= SCAN_STEPS.length){
      clearInterval(stepInterval);
      finishScan(domain, state.scanVariant, existingSite);
      return;
    }
    render();
  }, 480);
}

function finishScan(domain, variant, existingSite){
  const salt = String(Date.now());
  const scan = runScan(domain, variant, salt);

  if(existingSite){
    existingSite.scans.push(scan);
    state.selectedSiteId = existingSite.id;
  } else {
    const id = 'site-' + Date.now();
    const docketNum = state.nextDocketNum++;
    state.sites.push({
      id, domain, docketNum,
      variant: variant || 'Global',
      addedAt: Date.now(),
      manualRegs: defaultManualRegsFor(variant),
      selectedCountries: defaultCountriesFor(variant),
      scans: [scan],
      checklistState: {},
      overrides: {},
    });
    state.selectedSiteId = id;
  }
  state.scanning = false;
  state.activeTab = 'compliance';
  render();
}

render();
