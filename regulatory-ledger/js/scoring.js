/* ============================================================
   DETERMINISTIC PSEUDO-RANDOM (seeds the simulated scan track only)
   ============================================================ */
function hashStr(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h<<5)-h+str.charCodeAt(i); h|=0; } return h; }
function seededRandom(seedStr){ let h=hashStr(seedStr); let x=Math.sin(h)*10000; return x-Math.floor(x); }

function statusFor(domain, variant, salt, req){
  const seedBase = domain + '::' + variant + '::' + salt + '::' + req.id;
  // Demonstrates the "EU vs US cookie banner" scenario explicitly for the consent requirement.
  if(req.id === 'gdpr-s2'){
    if(variant === 'EU' || variant === 'CH'){
      return seededRandom(seedBase+'::eu-consent') < 0.85 ? 'Pass' : 'Partial';
    }
    if(variant === 'US'){
      return seededRandom(seedBase+'::us-consent') < 0.55 ? 'Fail' : 'Partial';
    }
  }
  if(req.na && seededRandom(seedBase+'::na') < 0.12) return 'NA';
  const r = seededRandom(seedBase+'::status');
  if(r < 0.42) return 'Pass';
  if(r < 0.74) return 'Partial';
  return 'Fail';
}

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
  if(source === 'scanned') return scan.scanned[regKey][item.id];
  const st = site.checklistState[item.id];
  if(st && st.finalized) return st.status;
  if(st && st.checked) return 'Pending';
  return 'Fail';
}
function itemEffectiveStatus(site, scan, regKey, item, source){
  const ov = site.overrides[item.id];
  if(ov) return ov.status;
  return rawStatus(site, scan, regKey, item, source);
}

/* Severity weights are user-adjustable from the Settings tab (state.sevWeights);
   DEFAULT_SEV_WEIGHT (data.js) only seeds the initial values. */
function blendedScore(site, scan, regKey){
  const {scanned, checklist} = regDefs(regKey);
  const weights = state.sevWeights;
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
  const weights = state.sevWeights;
  const list = [];
  scanned.forEach(r=>{
    const st = itemEffectiveStatus(site, scan, regKey, r, 'scanned');
    if(st==='Fail'||st==='Partial') list.push({item:r, source:'scanned', status:st, regKey});
  });
  checklist.forEach(item=>{
    const st = itemEffectiveStatus(site, scan, regKey, item, 'attested');
    if(st==='Fail'||st==='Partial'||st==='Pending') list.push({item, source:'attested', status:st, regKey});
  });
  list.sort((a,b)=>{
    const sw = s => s==='Fail'?3:s==='Pending'?2.5:2;
    const sa = weights[a.item.sev]*10 + sw(a.status);
    const sb = weights[b.item.sev]*10 + sw(b.status);
    return sb-sa;
  });
  return list;
}

function topGapsCaption(site, scan, regKey){
  const gaps = gapItems(site, scan, regKey).slice(0,2);
  if(gaps.length===0) return 'No material gaps found in this scan — nice work.';
  const parts = gaps.map(g=>`<b>${g.item.text.split(' —')[0]}</b> (${SEV_LABEL[g.item.sev].toLowerCase()})`);
  return 'Held back mainly by: ' + parts.join(', and ') + '.';
}

function runScan(domain, variant, salt){
  const scannedGDPR = {}; GDPR_SCANNED.forEach(r=>{ scannedGDPR[r.id] = statusFor(domain, variant, salt, r); });
  const scannedCCPA = {}; CCPA_SCANNED.forEach(r=>{ scannedCCPA[r.id] = statusFor(domain, variant, salt, r); });

  const trust = {};
  TRUST_CATS.forEach(c=>{
    const r = seededRandom(domain+'::'+variant+'::'+salt+'::trust::'+c.id);
    trust[c.id] = Math.round(40 + r*58);
  });
  const trustScore = Math.round(TRUST_CATS.reduce((a,c)=>a+trust[c.id],0)/TRUST_CATS.length);

  return {
    timestamp: Date.now(),
    scanned: {GDPR: scannedGDPR, CCPA: scannedCCPA},
    trust: {scores: trust, score: trustScore},
  };
}

/* ============================================================
   COUNTRY POSTURE (replaces the old Global/US/EU/CH picker)
   ============================================================ */
/* Internal-only bucket used to seed the scanned track's simulated regional
   consent behavior (see the gdpr-s2 special case in statusFor above). It's
   derived from whichever countries are selected for the site, rather than
   being its own user-facing choice — this is what let us drop the
   "Global / Other" chip from the New Scan form while keeping the existing
   US-vs-EU cookie-banner simulation working. Manual (free-text) countries and
   sites with no GDPR/CCPA-mapped country fall back to the same neutral
   baseline behavior the old "Global" option used internally. */
function simPostureFor(countryCodes, manualCountries){
  const known = (countryCodes||[]).map(code => COUNTRIES.find(c=>c.code===code)).filter(Boolean);
  if(known.some(c=>c.code==='CH')) return 'CH';
  if(known.some(c=>c.regs.includes('GDPR') && c.code!=='CH')) return 'EU';
  if(known.some(c=>c.regs.includes('CCPA'))) return 'US';
  return 'Global';
}

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
   COMPETITOR BENCHMARK (illustrative — see data.js note on COMPETITOR_LABELS)
   ============================================================ */
function competitorScores(domain, regKey){
  return COMPETITOR_LABELS.map(label=>{
    const r = seededRandom(domain+'::'+regKey+'::competitor::'+label);
    return {label, score: Math.round(45 + r*50)};
  });
}
