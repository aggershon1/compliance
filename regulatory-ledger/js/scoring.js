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
    ? {scanned:GDPR_SCANNED, checklist:GDPR_CHECKLIST, label:'General Data Protection Regulation \u2014 EU / EEA'}
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

function blendedScore(site, scan, regKey){
  const {scanned, checklist} = regDefs(regKey);
  let total=0, earned=0;
  scanned.forEach(r=>{
    const st = itemEffectiveStatus(site, scan, regKey, r, 'scanned');
    if(st==='NA') return;
    const w = SEV_WEIGHT[r.sev]; total+=w;
    if(st==='Pass') earned+=w; else if(st==='Partial') earned+=w*0.5;
  });
  checklist.forEach(item=>{
    const st = itemEffectiveStatus(site, scan, regKey, item, 'attested');
    if(st==='NA') return;
    const w = SEV_WEIGHT[item.sev]; total+=w;
    if(st==='Pass') earned+=w; else if(st==='Partial') earned+=w*0.5;
  });
  if(total===0) return 100;
  return Math.round((earned/total)*100);
}

function gapItems(site, scan, regKey){
  const {scanned, checklist} = regDefs(regKey);
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
    const sa = SEV_WEIGHT[a.item.sev]*10 + sw(a.status);
    const sb = SEV_WEIGHT[b.item.sev]*10 + sw(b.status);
    return sb-sa;
  });
  return list;
}

function topGapsCaption(site, scan, regKey){
  const gaps = gapItems(site, scan, regKey).slice(0,2);
  if(gaps.length===0) return 'No material gaps found in this scan \u2014 nice work.';
  const parts = gaps.map(g=>`<b>${g.item.text.split(' \u2014')[0]}</b> (${SEV_LABEL[g.item.sev].toLowerCase()})`);
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
