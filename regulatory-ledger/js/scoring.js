/* ============================================================
   SCORING
   ============================================================
   Nothing here invents a result. Every status comes from something a person
   recorded: a self-attestation, or an explicit assessment/override with a
   stated reason. Requirements nobody has assessed yet report 'Unassessed'
   and earn zero credit — the same as a Fail — so an untouched entry can
   never look compliant. */

function gradeLabel(score){
  if(score>=90) return 'A';
  if(score>=80) return 'B';
  if(score>=70) return 'C';
  if(score>=60) return 'D';
  return 'F';
}
function tierClass(grade){
  if(grade==='A') return 'tier-a';
  if(grade==='B') return 'tier-b';
  if(grade==='C') return 'tier-c';
  if(grade==='D') return 'tier-d';
  return 'tier-f';
}

function regDefs(regKey){
  return regKey==='GDPR'
    ? {scanned:GDPR_SCANNED, checklist:GDPR_CHECKLIST, label:'General Data Protection Regulation — EU / EEA'}
    : {scanned:CCPA_SCANNED, checklist:CCPA_CHECKLIST, label:'California Consumer Privacy Act, as amended by CPRA'};
}

function rawStatus(site, scan, regKey, item, source){
  /* The publicly-observable track has no automated judgment behind it: the
     simulated crawler was removed in v0.9.0 because it fabricated findings
     about real sites. Until a real crawler exists these are assessed by a
     person, recorded through the same override mechanism as any other
     correction, so `itemEffectiveStatus` picks it up. */
  if(source === 'scanned'){
    /* A crawl finding is a real observation of a real page, so it stands as
       the recorded status — but only where the crawl could actually answer
       the question. Anything it couldn't determine stays Unassessed. */
    const f = site.crawlFindings && site.crawlFindings[item.id];
    if(f && f.determinable && f.status) return f.status;
    return 'Unassessed';
  }
  const st = site.checklistState[item.id];
  if(st && st.finalized) return st.status;
  if(st && st.checked) return 'Pending';
  /* Nobody has attested this. That's unknown, not failing — reporting 'Fail'
     would assert non-compliance no one verified. It still earns zero credit
     in blendedScore, so the score is unchanged; only the claim is. */
  return 'Unassessed';
}
function itemEffectiveStatus(site, scan, regKey, item, source){
  const ov = site.overrides[item.id];
  if(ov) return ov.status;
  return rawStatus(site, scan, regKey, item, source);
}

function blendedScore(site, scan, regKey){
  const {scanned, checklist} = regDefs(regKey);
  const weights = DEFAULT_SEV_WEIGHT;
  let total=0, earned=0;
  scanned.forEach(r=>{
    const st = itemEffectiveStatus(site, scan, regKey, r, 'scanned');
    if(st==='NA') return;
    const w = weights[r.sev]; total+=w;
    if(st==='Pass') earned+=w; else if(st==='Partial') earned+=w*0.5;
  });
  checklist.forEach(item=>{
    const st = itemEffectiveStatus(site, scan, regKey, item, 'attested');
    if(st==='NA') return;
    const w = weights[item.sev]; total+=w;
    if(st==='Pass') earned+=w; else if(st==='Partial') earned+=w*0.5;
  });
  if(total===0) return 100;
  return Math.round((earned/total)*100);
}

function gapItems(site, scan, regKey){
  const {scanned, checklist} = regDefs(regKey);
  const weights = DEFAULT_SEV_WEIGHT;
  const list = [];
  scanned.forEach(r=>{
    const st = itemEffectiveStatus(site, scan, regKey, r, 'scanned');
    if(st==='Fail'||st==='Partial'||st==='Unassessed') list.push({item:r, source:'scanned', status:st, regKey});
  });
  checklist.forEach(item=>{
    const st = itemEffectiveStatus(site, scan, regKey, item, 'attested');
    if(st==='Fail'||st==='Partial'||st==='Pending'||st==='Unassessed') list.push({item, source:'attested', status:st, regKey});
  });
  list.sort((a,b)=>{
    const sw = s => s==='Fail'?3:s==='Unassessed'?2.8:s==='Pending'?2.5:2;
    const sa = weights[a.item.sev]*10 + sw(a.status);
    const sb = weights[b.item.sev]*10 + sw(b.status);
    return sb-sa;
  });
  return list;
}

function topGapsCaption(site, scan, regKey){
  const gaps = gapItems(site, scan, regKey).slice(0,2);
  if(gaps.length===0) return 'Every requirement assessed, with no open gaps recorded.';
  const parts = gaps.map(g=>`<b>${g.item.text.split(' —')[0]}</b> (${SEV_LABEL[g.item.sev].toLowerCase()})`);
  return 'Held back mainly by: ' + parts.join(', and ') + '.';
}

/* ============================================================
   COUNTRY SCOPE
   ============================================================ */
function defaultManualRegsFromCountries(countryCodes){
  const known = (countryCodes||[]).map(code => COUNTRIES.find(c=>c.code===code)).filter(Boolean);
  return {
    GDPR: known.some(c=>c.regs.includes('GDPR')),
    CCPA: known.some(c=>c.regs.includes('CCPA')),
  };
}

/* Per-country + overall grading (Homepage request #4). Each selected country
   is scored using whichever regulation it maps to via COUNTRIES — this
   prototype doesn't fabricate independent per-country variance for a single
   regulation (e.g. Germany vs. France don't get different fake GDPR numbers);
   they show the same GDPR score because it IS the same underlying
   determination. Manual / unmapped countries are listed but not scored,
   since this MVP's requirement set only covers GDPR & CCPA (see SPEC.md). */
function countryScoreRows(site, scan){
  const rows = [];
  (site.selectedCountries||[]).forEach(code=>{
    const c = COUNTRIES.find(x=>x.code===code);
    if(!c) return;
    if(c.regs.length===0){
      rows.push({label:c.name, regKey:null, score:null, grade:null,
        note:'Not mapped to GDPR or CCPA in this prototype.'});
      return;
    }
    c.regs.forEach(regKey=>{
      const score = blendedScore(site, scan, regKey);
      rows.push({label:c.name, regKey, score, grade:gradeLabel(score), note:null});
    });
  });
  (site.manualCountries||[]).forEach(m=>{
    rows.push({label:m.name, regKey:null, score:null, grade:null,
      note:'Manually entered — not mapped to a regulation in this prototype (MVP covers GDPR & CCPA only).'});
  });
  return rows;
}

function overallScore(site, scan){
  const eff = effectiveRegs(site);
  const active = [];
  if(eff.GDPR) active.push(blendedScore(site, scan, 'GDPR'));
  if(eff.CCPA) active.push(blendedScore(site, scan, 'CCPA'));
  if(active.length===0) return null;
  return Math.round(active.reduce((a,b)=>a+b,0)/active.length);
}

/* Best-effort match from a site's countries to the BILLS `region` tags, used
   to default the Upcoming Legislation tab to what's relevant to this site. */
function regionsForSite(site){
  const regions = new Set();
  (site.selectedCountries||[]).forEach(code=>{
    (COUNTRY_BILL_REGIONS[code]||[]).forEach(r=>regions.add(r));
  });
  (site.manualCountries||[]).forEach(m=>{
    const name = m.name.trim().toLowerCase();
    MANUAL_COUNTRY_BILL_ALIASES.forEach(alias=>{
      if(alias.match.some(m2=>name.includes(m2))) alias.regions.forEach(r=>regions.add(r));
    });
  });
  return [...regions];
}

/* ============================================================
   SELF-ATTESTED GATING (Compliance Results request #4)
   ============================================================ */
/* A checklist item counts as "resolved" once it's either been finalized
   through the normal describe→review flow, or manually overridden — an
   override is an authoritative status too, so it shouldn't leave the final
   grade stuck pending. Overriding a scanned (automated) item never affects
   this gate; only the self-attested items do, per the request. */
function isChecklistItemResolved(site, item){
  if(site.overrides[item.id]) return true;
  const st = site.checklistState[item.id];
  return !!(st && st.finalized);
}
/* A final grade requires every requirement to have been assessed by someone
   — both the publicly-observable ones and the behind-login ones. Before
   v0.9.0 only the checklist gated the grade, because the observable track
   was auto-filled with simulated results; with those gone, an unassessed
   requirement is genuinely unknown and must not be graded around. */
function hasObservableAssessment(site, r){
  if(site.overrides[r.id]) return true;
  const f = site.crawlFindings && site.crawlFindings[r.id];
  return !!(f && f.determinable && f.status);
}
function allRequirementsAssessed(site, regKey){
  const {scanned, checklist} = regDefs(regKey);
  return scanned.every(r => hasObservableAssessment(site, r))
      && checklist.every(item => isChecklistItemResolved(site, item));
}
function assessmentProgress(site, regKey){
  const {scanned, checklist} = regDefs(regKey);
  const total = scanned.length + checklist.length;
  const done = scanned.filter(r=>hasObservableAssessment(site, r)).length
             + checklist.filter(i=>isChecklistItemResolved(site, i)).length;
  return {done, total};
}

/* ============================================================
   RISK EXPOSURE (merged from the old standalone Risk & Precedent tab)
   ============================================================ */
function formatMoney(n){
  if(n>=1e9) return (n/1e9).toFixed(1).replace(/\.0$/,'') + 'B';
  if(n>=1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if(n>=1e3) return (n/1e3).toFixed(0) + 'K';
  return String(n);
}
const CURRENCY_SYMBOL = {EUR:'€', GBP:'£', USD:'$'};

/* Aggregates the real enforcement cases (FINES) matching the site's current
   gaps into a min–max range per currency, so the Compliance Results header
   can show "potential exposure" without mixing EUR/GBP/USD together. */
function exposureSummary(site, scan){
  const eff = effectiveRegs(site);
  const regs = []; if(eff.GDPR) regs.push('GDPR'); if(eff.CCPA) regs.push('CCPA');
  const matched = [];
  regs.forEach(regKey=>{
    gapItems(site, scan, regKey).forEach(g=>{
      if(g.status === 'Unassessed') return;   // unknown is not a finding
      const fine = FINES[g.item.id];
      if(fine) matched.push(fine);
    });
  });
  if(matched.length===0) return null;
  const byCurrency = {};
  matched.forEach(f=>{
    (byCurrency[f.currency] = byCurrency[f.currency] || []).push(f.amount);
  });
  const ranges = Object.entries(byCurrency).map(([currency, amounts])=>({
    currency, symbol: CURRENCY_SYMBOL[currency] || '',
    min: Math.min(...amounts), max: Math.max(...amounts),
  }));
  return { ranges, caseCount: matched.length };
}
