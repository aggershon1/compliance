/* ============================================================
   RENDER
   ============================================================ */
function render(){
  const app = document.getElementById('app');
  const site = state.sites.find(s=>s.id===state.selectedSiteId);

  app.innerHTML = `
    <div class="shell">
      <div class="masthead">
        <div class="wordmark disp">The Regulatory Ledger<small>Compliance &amp; privacy audit workbench — prototype</small></div>
        <div class="dateline mono">DOCKET OPEN<br>${new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</div>
      </div>
      <div class="docket">
        <div class="docket-head">
          <h2>Docket</h2>
          <button class="btn-new" id="btn-add-site">+ New scan</button>
        </div>
        <div class="docket-list">${renderDocketList()}</div>
        <div class="disclaimer-foot">
          This tool provides informational guidance only, not legal advice. Consult qualified counsel before making formal compliance decisions. Enforcement figures and the checklist review shown here are simulated for this prototype.
        </div>
      </div>
      <div class="main">${renderMain(site)}</div>
    </div>
  `;
  attachHandlers(site);
}

function renderDocketList(){
  if(state.sites.length===0 && !state.scanning){
    return `<div class="docket-empty">No sites scanned yet. Add a site to begin the first audit.</div>`;
  }
  let html = '';
  if(state.scanning){
    html += `<div class="docket-entry active"><div class="docket-num mono">NO. ${pad3(state.nextDocketNum)}</div>
      <div class="docket-domain">${state.scanTargetDomain}</div>
      <div class="docket-chips"><span class="chip-mini">scanning…</span></div></div>`;
  }
  [...state.sites].reverse().forEach(s=>{
    const scan = s.scans[s.scans.length-1];
    const g = blendedScore(s, scan, 'GDPR');
    const c = blendedScore(s, scan, 'CCPA');
    const label = countryLabelFor(s);
    html += `<button class="docket-entry ${s.id===state.selectedSiteId?'active':''}" data-site-id="${s.id}">
      <div class="docket-num mono">NO. ${pad3(s.docketNum)}</div>
      <div class="docket-domain">${s.domain}${label?`<span class="variant-tag">${label}</span>`:''}</div>
      <div class="docket-chips">
        <span class="chip-mini ${chipClass(g)}">GDPR ${gradeLabel(g)}</span>
        <span class="chip-mini ${chipClass(c)}">CCPA ${gradeLabel(c)}</span>
      </div>
    </button>`;
  });
  return html;
}
function chipClass(score){
  const g = gradeLabel(score);
  if(g==='A'||g==='B') return 'pass';
  if(g==='C') return 'partial';
  return 'fail';
}

function renderMain(site){
  if(state.scanning) return renderScanningView();
  if(state.showNewScanForm || !site) return renderNewScanForm(state.sites.length>0);

  const scan = site.scans[site.scans.length-1];
  const prevScan = site.scans.length>1 ? site.scans[site.scans.length-2] : null;

  let body = '';
  if(state.activeTab==='compliance') body = renderComplianceTab(site, scan);
  else if(state.activeTab==='recommendations') body = renderRecommendationsTab(site, scan);
  else if(state.activeTab==='legislation') body = renderLegislationTab(site);
  else if(state.activeTab==='risk') body = renderRiskTab(site, scan);
  else if(state.activeTab==='trust') body = renderTrustTab(scan);
  else if(state.activeTab==='competitors') body = renderCompetitorsTab(site, scan);
  else if(state.activeTab==='settings') body = renderSettingsTab();

  const label = countryLabelFor(site);

  return `
    <div class="site-header">
      <div>
        <h1 class="disp">${site.domain}${label?`<span class="variant-tag">${label}</span>`:''}</h1>
        <div class="site-meta">
          NO. ${pad3(site.docketNum)} · LAST SCANNED ${new Date(scan.timestamp).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
          ${prevScan ? renderDelta(site, prevScan) : ''}
        </div>
      </div>
      <div class="header-actions">
        <button class="export-btn" id="btn-export">↓ Export PDF report</button>
        <button class="ff-btn" id="btn-fastforward" title="Demo only: ages all self-attested items by 100 days">⏩ Simulate 100 days (demo)</button>
        <button class="rescan-btn" id="btn-rescan">Re-scan now</button>
      </div>
    </div>

    <div class="reg-picker">
      <span class="label">Regulations in scope</span>
      <button class="reg-toggle ${effectiveRegs(site).GDPR?'on':''}" data-reg="GDPR">GDPR</button>
      <button class="reg-toggle ${effectiveRegs(site).CCPA?'on':''}" data-reg="CCPA">CCPA / CPRA</button>
      <button class="country-toggle-btn ${state.countryPanelOpen?'open':''}" id="btn-country-toggle">Filter by country ${state.countryPanelOpen?'▴':'▾'}</button>
    </div>
    <p class="picker-tip">Tip: selecting a country below can keep a regulation active even if its direct toggle looks off — the picker shows the combined result of both.</p>
    ${renderCountryPanel(site)}

    <div class="tabs">
      <button class="tab-btn ${state.activeTab==='compliance'?'active':''}" data-tab="compliance">COMPLIANCE RESULTS</button>
      <button class="tab-btn ${state.activeTab==='recommendations'?'active':''}" data-tab="recommendations">RECOMMENDATIONS</button>
      <button class="tab-btn ${state.activeTab==='legislation'?'active':''}" data-tab="legislation">UPCOMING LEGISLATION</button>
      <button class="tab-btn ${state.activeTab==='risk'?'active':''}" data-tab="risk">RISK &amp; PRECEDENT</button>
      <button class="tab-btn ${state.activeTab==='trust'?'active':''}" data-tab="trust">PRIVACY TRUST</button>
      <button class="tab-btn ${state.activeTab==='competitors'?'active':''}" data-tab="competitors">VS. COMPETITORS</button>
      <button class="tab-btn ${state.activeTab==='settings'?'active':''}" data-tab="settings">SETTINGS</button>
    </div>
    ${body}
    <div class="foot-space"></div>
  `;
}

function renderCountryPanel(site){
  if(!state.countryPanelOpen) return '';
  const rows = COUNTRIES.map(c=>{
    const checked = site.selectedCountries.includes(c.code);
    return `<label class="country-row"><input type="checkbox" data-country-for="${c.code}" ${checked?'checked':''}> ${c.name}${c.note?` <span class="country-note">*</span>`:''}</label>`;
  }).join('');
  const manualChips = (site.manualCountries||[]).map((m,i)=>
    `<span class="manual-country-chip">${m.name} <button type="button" class="chip-remove" data-remove-manual-country="${i}" aria-label="Remove ${m.name}">×</button></span>`
  ).join('');
  return `
    <div class="country-panel">${rows}
      <div class="country-footnote">* Switzerland is approximated to the GDPR baseline in this prototype — its own law (FADP) is distinct and has its own nuances.</div>
    </div>
    <div class="add-country-row">
      <input type="text" id="country-panel-manual-input" placeholder="Country not listed? Type it here…" value="${state.manualCountryInput[site.id]||''}" autocomplete="off">
      <button type="button" id="btn-country-panel-manual-add" class="file-btn">+ Add</button>
    </div>
    ${manualChips ? `<div class="manual-country-chips">${manualChips}</div>` : ''}
  `;
}

function renderDelta(site, prevScan){
  const cur = overallScore(site, site.scans[site.scans.length-1]);
  const prev = overallScore(site, prevScan);
  if(cur===null || prev===null) return '';
  const diff = cur - prev;
  if(diff===0) return ' · UNCHANGED SINCE LAST SCAN';
  if(diff>0) return ` · <span class="delta-up">+${diff} PTS SINCE LAST SCAN</span>`;
  return ` · <span class="delta-down">${diff} PTS SINCE LAST SCAN</span>`;
}

function renderNewScanForm(canCancel){
  const rows = COUNTRIES.map(c=>{
    const checked = state.newScanCountries.includes(c.code);
    return `<label class="country-row"><input type="checkbox" data-newscan-country="${c.code}" ${checked?'checked':''}> ${c.name}${c.note?` <span class="country-note">*</span>`:''}</label>`;
  }).join('');
  const manualChips = state.newScanManualCountries.map((m,i)=>
    `<span class="manual-country-chip">${m.name} <button type="button" class="chip-remove" data-newscan-remove-manual="${i}" aria-label="Remove ${m.name}">×</button></span>`
  ).join('');
  return `
    <div class="empty-state">
      <h1 class="disp">${canCancel ? 'Start a new scan.' : 'Open a new case file.'}</h1>
      <p>Enter a website to run a full-site crawl of its logged-out surface against GDPR and CCPA/CPRA, then fill out the self-attested checklist for what happens behind login. Select every country this scan should cover — it drives which regulations apply, the scoring breakdown, and which upcoming legislation is shown.</p>
      <form class="scan-form" id="new-scan-form">
        <label>Website</label>
        <div class="scan-form-row">
          <input type="text" id="new-scan-input" placeholder="e.g. acmehealth.com" autocomplete="off">
          <button type="submit" class="go-btn">Scan site</button>
        </div>
        <label>Countries this scan covers</label>
        <div class="country-panel" style="margin-bottom:14px;">
          ${rows}
          <div class="country-footnote">* Switzerland is approximated to the GDPR baseline in this prototype — its own law (FADP) is distinct and has its own nuances.</div>
        </div>
        <div class="add-country-row">
          <input type="text" id="new-scan-manual-input" placeholder="Country not listed? Type it here…" value="${state.newScanManualInput}" autocomplete="off">
          <button type="button" id="btn-new-scan-manual-add" class="file-btn">+ Add</button>
        </div>
        ${manualChips ? `<div class="manual-country-chips">${manualChips}</div>` : ''}
        ${state.newScanError ? `<div class="err">Select or add at least one country before scanning.</div>` : ''}
      </form>
      ${canCancel ? `<button class="cancel-link" id="btn-cancel-new">Cancel</button>` : ''}
    </div>
  `;
}

function renderScanningView(){
  const existingSite = state.scanningExistingSiteId ? state.sites.find(s=>s.id===state.scanningExistingSiteId) : null;
  const label = existingSite ? countryLabelFor(existingSite) : countryLabelForDraft();
  const stepsHtml = SCAN_STEPS.map((s,i)=>{
    let cls='scanning-step', mark='·';
    if(i<state.scanStepIndex){ cls+=' done'; mark='✓'; }
    else if(i===state.scanStepIndex){ cls+=' current'; mark='→'; }
    return `<div class="${cls}"><span class="mark">${mark}</span>${s}</div>`;
  }).join('');
  return `
    <div class="empty-state">
      <h1 class="disp">Scanning ${state.scanTargetDomain}${label?` (${label})`:''}</h1>
      <div class="scanning-box">
        <div class="cursor mono" style="margin-bottom:10px;">Running full-site crawl of the logged-out surface — simulated for the prototype.</div>
        ${stepsHtml}
      </div>
    </div>
  `;
}

function citeHover(item){
  return `<span class="cite-hover"><span class="req-code">${item.code}</span><span class="cite-tooltip"><div class="ct-title">${item.articleTitle}</div>${item.articleText}</span></span>`;
}

function evidenceHover(req, status){
  const ev = req.evidence && req.evidence[status.toLowerCase()];
  if(!ev) return '';
  return `<span class="cite-hover evidence-hover"><span class="evidence-trigger">why?</span><span class="cite-tooltip evidence-tooltip">
    <div class="ct-title">Simulated evidence</div>
    <div class="evidence-quote">“${ev.snippet}”</div>
    <div class="evidence-location">Found at: ${ev.location}</div>
    <div class="evidence-disclaimer">Illustrative for this prototype — a live crawler would cite the actual page and exact text found.</div>
  </span></span>`;
}

function renderCountryBreakdown(site, scan){
  const rows = countryScoreRows(site, scan);
  if(rows.length===0) return '';
  const rowsHtml = rows.map(r=>{
    if(r.score===null){
      return `<div class="country-score-row"><span class="country-score-name">${r.label}</span><span class="country-score-note">${r.note}</span></div>`;
    }
    return `<div class="country-score-row"><span class="country-score-name">${r.label}</span><span class="chip-mini ${chipClass(r.score)}">${r.regKey} ${r.grade} · ${r.score}/100</span></div>`;
  }).join('');
  const overall = overallScore(site, scan);
  const overallHtml = overall===null ? '' : `<div class="country-score-overall">Overall (blended across selected regulations): <b>${overall}/100</b> (${gradeLabel(overall)})</div>`;
  return `<div class="country-score-list"><div class="section-note" style="margin-bottom:8px;">Score by country</div>${rowsHtml}${overallHtml}</div>`;
}

function renderComplianceTab(site, scan){
  const eff = effectiveRegs(site);
  const regs = [];
  if(eff.GDPR) regs.push('GDPR');
  if(eff.CCPA) regs.push('CCPA');

  if(regs.length===0) return `<p class="section-note">No regulation selected — toggle GDPR or CCPA/CPRA, or pick a country, above to see results.</p>`;

  const stampsHtml = regs.map(regKey=>{
    const {label} = regDefs(regKey);
    const score = blendedScore(site, scan, regKey);
    const grade = gradeLabel(score);
    return `
      <div class="stamp-wrap">
        <div class="stamp ${tierClass(grade)}"><div class="grade disp">${grade}</div><div class="glabel">${regKey}</div></div>
        <div>
          <div class="stamp-num mono">${score}/100</div>
          <div class="stamp-caption">${topGapsCaption(site, scan, regKey)}</div>
        </div>
      </div>
    `;
  }).join('');

  const blocksHtml = regs.map(regKey=>{
    const {scanned, checklist, label} = regDefs(regKey);
    const allIds = scanned.map(r=>r.id).concat(checklist.map(i=>i.id)).join(',');

    const scannedRows = scanned.map(req=>{
      const raw = rawStatus(site, scan, regKey, req, 'scanned');
      const eff = itemEffectiveStatus(site, scan, regKey, req, 'scanned');
      const stClass = eff.toLowerCase();
      const collapsed = !!state.collapsedItems[req.id];
      let note = '';
      if(eff==='Fail') note = `<div class="req-note fail">${req.hints.fail}${evidenceHover(req, eff)}</div>`;
      else if(eff==='Partial') note = `<div class="req-note partial">${req.hints.partial}${evidenceHover(req, eff)}</div>`;
      return `
        <div class="ledger-row">
          <div>
            <div class="req-text"><button type="button" class="collapse-toggle" data-collapse-toggle="${req.id}" aria-label="Toggle details">${collapsed?'▸':'▾'}</button><span class="source-tag">Scanned</span>${citeHover(req)} ${req.text}</div>
            ${!collapsed ? `
              <div class="layman-text">${req.layman}</div>
              ${note}
              <div class="override-wrap">${renderOverrideControl(site, req.id, raw)}</div>
            ` : ''}
          </div>
          <div class="status-badge ${stClass}">${eff}</div>
        </div>
      `;
    }).join('');

    const checklistRows = checklist.map(item=>renderChecklistItem(site, scan, regKey, item)).join('');

    return `
      <div class="reg-block">
        <h3 class="disp">${regKey}</h3>
        <div class="reg-sub">${label}
          <button type="button" class="link-btn" style="margin-left:12px;" data-collapse-all="${allIds}">Collapse all</button>
          <button type="button" class="link-btn" style="margin-left:8px;" data-expand-all="${allIds}">Expand all</button>
        </div>
        <div class="ledger">${scannedRows}</div>
        <div class="ledger">${checklistRows}</div>
      </div>
    `;
  }).join('');

  return `<div class="stamp-row">${stampsHtml}</div>${renderCountryBreakdown(site, scan)}${blocksHtml}`;
}

function renderOverrideControl(site, itemId, rawCurrentStatus){
  const key = site.id+'::'+itemId;
  const ov = site.overrides[itemId];
  const isOpen = !!state.overrideOpen[key];
  const historyCount = (state.overrideHistory[itemId]||[]).length;
  let html = '';
  if(ov){
    html += `<div class="override-note"><span class="override-badge">Overridden</span>${ov.previousStatus} → ${ov.status} — “${ov.explanation}”
      <div style="margin-top:6px;"><button class="link-btn" data-clear-override="${itemId}">Clear override</button></div></div>`;
  } else if(isOpen){
    const draft = state.overrideDrafts[key] || (state.overrideDrafts[key] = {status: rawCurrentStatus==='NA'?'Pass':rawCurrentStatus, explanation:''});
    html += `<div class="override-form">
      <div><select data-override-status-for="${itemId}">
        ${['Pass','Partial','Fail','NA'].map(s=>`<option value="${s}" ${draft.status===s?'selected':''}>${s}</option>`).join('')}
      </select></div>
      <textarea class="checklist-textarea" data-override-explain-for="${itemId}" placeholder="Why is the system's read wrong? (required)">${draft.explanation}</textarea>
      ${draft.error ? `<div class="err">Please add a brief explanation before saving.</div>` : ''}
      <div style="margin-top:9px;">
        <button class="submit-btn" data-override-submit-for="${itemId}">Save override</button>
        <button class="link-btn" style="margin-left:12px;" data-override-cancel-for="${itemId}">Cancel</button>
      </div>
    </div>`;
  } else {
    html += `<button class="link-btn" data-override-open-for="${itemId}">Override this result</button>`;
  }
  if(historyCount >= 2 && !ov){
    html += `<div class="learn-flag">⚠ Overridden ${historyCount} times across scans in this session — detection logic for this requirement may need recalibrating.</div>`;
  }
  return html;
}

function renderChecklistItem(site, scan, regKey, item){
  const st = site.checklistState[item.id];
  const draft = getDraft(site.id, item.id);
  const checked = !!(st && st.checked);
  const raw = rawStatus(site, scan, regKey, item, 'attested');
  const eff = itemEffectiveStatus(site, scan, regKey, item, 'attested');
  const collapsed = !!state.collapsedItems[item.id];

  let statusBadge = `<span class="status-badge ${eff.toLowerCase()}">${eff}</span>`;

  let bodyHtml = '';
  if(checked){
    if(st.needsFollowUp && !st.finalized){
      bodyHtml = `
        <div class="checklist-body">
          <textarea class="checklist-textarea" data-desc-for="${item.id}" placeholder="Briefly describe how this works today…">${draft.description}</textarea>
          <div class="checklist-file-row">
            <label class="file-btn">📎 Attach screenshot (optional)
              <input type="file" accept="image/*" data-shot-for="${item.id}" style="display:none;">
            </label>
            ${draft.screenshot ? `<img class="thumb-preview" src="${draft.screenshot}">` : ''}
          </div>
          <div class="followup-box">
            <div class="followup-q">${st.followUpQuestion}</div>
            <div class="followup-sketch">${st.sketch}</div>
            <textarea class="checklist-textarea" data-followup-for="${item.id}" placeholder="Your answer…">${draft.followUpAnswer}</textarea>
            <button class="submit-btn" data-finalize-for="${item.id}">Submit answer for review</button>
          </div>
        </div>
      `;
    } else if(st.finalized){
      const staleDays = st.attestedAt ? Math.floor((Date.now()-st.attestedAt)/86400000) : 0;
      const isStale = staleDays > STALE_DAYS;
      bodyHtml = `
        <div class="checklist-body">
          <div class="result-box">
            <span class="confidence-tag">Confidence: ${st.confidence}</span>
            ${isStale ? `<span class="stale-badge">Needs re-attestation</span>` : ''}
          </div>
          <div class="rationale-text">${st.rationale}</div>
          <div class="attested-meta">Attested ${staleDays===0?'today':staleDays+' day'+(staleDays===1?'':'s')+' ago'}${isStale ? ' — stale, last-known status still counted toward score.' : '.'}</div>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="checklist-body">
          <textarea class="checklist-textarea" data-desc-for="${item.id}" placeholder="Briefly describe how this works today…">${draft.description}</textarea>
          <div class="checklist-file-row">
            <label class="file-btn">📎 Attach screenshot (optional)
              <input type="file" accept="image/*" data-shot-for="${item.id}" style="display:none;">
            </label>
            ${draft.screenshot ? `<img class="thumb-preview" src="${draft.screenshot}">` : ''}
          </div>
          <button class="submit-btn" data-submit-for="${item.id}">Submit for review</button>
        </div>
      `;
    }
  }

  return `
    <div class="checklist-item">
      <div class="checklist-head-row">
        <div class="checklist-check-row">
          <input type="checkbox" id="chk-${item.id}" data-check-for="${item.id}" ${checked?'checked':''}>
          <button type="button" class="collapse-toggle" data-collapse-toggle="${item.id}" aria-label="Toggle details">${collapsed?'▸':'▾'}</button>
          <div>
            <label class="checklist-label" for="chk-${item.id}"><span class="source-tag attested">Self-attested</span>${citeHover(item)} ${item.text}</label>
            ${!collapsed ? `
              <div class="layman-text" style="margin-left:27px;">${item.layman}</div>
              <div class="checklist-guidance">${item.guidance}</div>
            ` : ''}
          </div>
        </div>
        ${statusBadge}
      </div>
      ${!collapsed ? bodyHtml : ''}
      ${!collapsed ? `<div class="override-wrap" style="margin-left:27px;">${renderOverrideControl(site, item.id, raw)}</div>` : ''}
    </div>
  `;
}

function renderRecommendationsTab(site, scan){
  const eff = effectiveRegs(site);
  let gaps = [];
  if(eff.GDPR) gaps = gaps.concat(gapItems(site, scan, 'GDPR'));
  if(eff.CCPA) gaps = gaps.concat(gapItems(site, scan, 'CCPA'));

  if(gaps.length===0){
    return `<p class="section-note">No open gaps across the selected regulations right now — nothing to recommend.</p>`;
  }

  const cardsHtml = gaps.map(g=>{
    const sevClass = g.item.sev==='high'?'high':g.item.sev==='med'?'med':'';
    return `
      <div class="rec-card ${sevClass}">
        <div class="rec-top">
          <div class="rec-title disp">[${g.regKey}] ${g.item.text}</div>
          <span class="status-badge ${g.status.toLowerCase()}">${g.status}</span>
        </div>
        <div class="rec-layman">${g.item.layman}</div>
        <ul class="rec-proposals">
          ${g.item.proposals.map(p=>`<li>${p}</li>`).join('')}
        </ul>
      </div>
    `;
  }).join('');

  return `
    <p class="rec-intro">Concrete directions for closing the gaps found above — written to be spec-ready for a product manager, not a legal opinion. Validate specifics with counsel before shipping.</p>
    ${cardsHtml}
  `;
}

function renderLegislationTab(site){
  const regions = ['All', ...new Set(BILLS.map(b=>b.region))];
  const statuses = ['All', ...new Set(BILLS.map(b=>b.status))];
  const siteRegions = site ? regionsForSite(site) : [];
  const filtered = BILLS.filter(b=>{
    const rOk = state.legFilterRegion==='All' || b.region===state.legFilterRegion;
    const sOk = state.legFilterStatus==='All' || b.status===state.legFilterStatus;
    const siteOk = !state.legFilterSiteOnly || siteRegions.length===0 || siteRegions.includes(b.region);
    return rOk && sOk && siteOk;
  });
  const cardsHtml = filtered.map(b=>`
    <div class="bill-card">
      <div class="bill-top">
        <div class="bill-name disp">${b.name}</div>
        <div class="bill-tags"><span class="tag">${b.region}</span><span class="tag">${b.status}</span></div>
      </div>
      <div class="bill-summary">${b.summary}</div>
      <div class="bill-meta">
        <div class="relevance"><b>Effective:</b> ${b.effective}</div>
        <div class="relevance"><b>Why it matters here:</b> ${b.relevance}</div>
        <div class="prep"><b>Suggested prep:</b> ${b.prep}</div>
      </div>
    </div>
  `).join('') || `<p class="section-note">No entries match this filter.</p>`;

  const siteToggle = (site && siteRegions.length>0) ? `
    <label class="country-row" style="margin-bottom:12px;">
      <input type="checkbox" id="leg-site-only-toggle" ${state.legFilterSiteOnly?'checked':''}>
      Show only legislation relevant to ${site.domain}'s selected countries
    </label>` : '';

  return `
    <p class="section-note">Sample dataset for this prototype — a live build would sync from a legal-tracking source on a weekly batch job. Last simulated refresh: Jul 21, 2026.</p>
    ${siteToggle}
    <div class="filters">
      <select id="leg-region-filter">${regions.map(r=>`<option value="${r}" ${r===state.legFilterRegion?'selected':''}>${r==='All'?'All regions':r}</option>`).join('')}</select>
      <select id="leg-status-filter">${statuses.map(s=>`<option value="${s}" ${s===state.legFilterStatus?'selected':''}>${s==='All'?'All statuses':s}</option>`).join('')}</select>
    </div>
    ${cardsHtml}
  `;
}

function renderRiskTab(site, scan){
  const eff = effectiveRegs(site);
  let combined = [];
  if(eff.GDPR) combined = combined.concat(gapItems(site, scan, 'GDPR'));
  if(eff.CCPA) combined = combined.concat(gapItems(site, scan, 'CCPA'));

  const top = combined.slice(0,5);

  if(top.length===0){
    return `<p class="section-note">No material risks surfaced across the selected regulations — nice work. Re-scan and re-attest periodically as the site changes.</p>`;
  }

  const itemsHtml = top.map((c,i)=>{
    const fine = FINES[c.item.id];
    const remedyText = c.source==='scanned'
      ? (c.status==='Fail' ? c.item.hints.fail : c.item.hints.partial)
      : (c.status==='Fail' ? 'Not yet implemented, or not yet attested with enough detail to confirm.' : 'Self-attested but not fully confirmed — see the Compliance Results tab for details.');
    const precedentHtml = fine ? `
      <div class="precedent">
        <div class="pre-label">Comparable enforcement pattern</div>
        <div>${fine.who} — ${fine.violation}.</div>
        <div style="margin-top:4px;">Fine: <span class="fine">${fine.fine}</span> · ${fine.regulator} · ${fine.year}</div>
      </div>
    ` : `<div class="precedent"><span class="none">No directly comparable sample case in this prototype’s dataset.</span></div>`;

    return `
      <div class="risk-item">
        <div class="risk-rank disp">${i+1}</div>
        <div>
          <div class="risk-title">[${c.regKey} · ${c.source==='scanned'?'Scanned':'Self-attested'}] ${c.item.text}</div>
          <div class="risk-sev">${SEV_LABEL[c.item.sev]} · Currently: ${c.status}</div>
          <div class="risk-remedy">${remedyText}</div>
          ${precedentHtml}
        </div>
      </div>
    `;
  }).join('');

  return `${itemsHtml}<div class="risk-disclaimer">Enforcement examples above are composite / illustrative, built for this prototype — they are not verified real-world fines and should not be treated as predictive of any actual outcome.</div>`;
}

function renderTrustTab(scan){
  const grade = gradeLabel(scan.trust.score);
  const catsHtml = TRUST_CATS.map(c=>{
    const score = scan.trust.scores[c.id];
    const tier = score>=80?'good':score>=55?'moderate':'weak';
    const color = tier==='good'?'var(--verdigris)':tier==='moderate'?'var(--amber)':'var(--redline)';
    return `
      <div class="trust-cat">
        <div class="trust-cat-head"><div class="trust-cat-name">${c.name}</div><div class="trust-cat-score mono">${score}/100</div></div>
        <div class="bar-track"><div class="bar-fill" style="width:${score}%; background:${color};"></div></div>
        <div class="trust-cat-note">${c.notes[tier]}</div>
      </div>
    `;
  }).join('');
  return `
    <div class="stamp-row">
      <div class="stamp-wrap">
        <div class="stamp ${tierClass(grade)}"><div class="grade disp">${grade}</div><div class="glabel">TRUST</div></div>
        <div>
          <div class="stamp-num mono">${scan.trust.score}/100</div>
          <div class="stamp-caption">Independent of legal compliance — measures how transparent the site’s privacy practices feel to an end user.</div>
        </div>
      </div>
    </div>
    ${catsHtml}
  `;
}

function renderCompetitorsTab(site, scan){
  const eff = effectiveRegs(site);
  const regs = []; if(eff.GDPR) regs.push('GDPR'); if(eff.CCPA) regs.push('CCPA');
  if(regs.length===0) return `<p class="section-note">No regulation selected — toggle GDPR or CCPA/CPRA above to see a comparison.</p>`;

  const blocksHtml = regs.map(regKey=>{
    const siteScore = blendedScore(site, scan, regKey);
    const rows = [{label: `${site.domain} (this site)`, score: siteScore, isSite:true}]
      .concat(competitorScores(site.domain, regKey).map(r=>({...r, isSite:false})));
    rows.sort((a,b)=>b.score-a.score);
    const rowsHtml = rows.map(r=>{
      const tier = r.score>=80?'good':r.score>=55?'moderate':'weak';
      const color = tier==='good'?'var(--verdigris)':tier==='moderate'?'var(--amber)':'var(--redline)';
      return `
        <div class="trust-cat">
          <div class="trust-cat-head"><div class="trust-cat-name">${r.isSite?`<b>${r.label}</b>`:r.label}</div><div class="trust-cat-score mono">${r.score}/100</div></div>
          <div class="bar-track"><div class="bar-fill" style="width:${r.score}%; background:${color};"></div></div>
        </div>
      `;
    }).join('');
    return `<div class="reg-block"><h3 class="disp">${regKey}</h3><div class="reg-sub">Illustrative comparison — not real companies or real data</div>${rowsHtml}</div>`;
  }).join('');

  return `
    <p class="rec-intro">A rough, directional comparison against generic industry benchmarks, simulated for this prototype — not based on real companies or actual scans of them. Numbers are consistent for this domain across visits but aren't derived from any real competitive data.</p>
    ${blocksHtml}
  `;
}

function renderSettingsTab(){
  const rows = ['high','med','low'].map(sev=>`
    <div class="settings-weight-row">
      <div class="settings-weight-label">${SEV_LABEL[sev]}</div>
      <input type="range" min="1" max="5" step="1" value="${state.sevWeights[sev]}" data-weight-for="${sev}">
      <span class="mono">${state.sevWeights[sev]}×</span>
    </div>
  `).join('');
  return `
    <p class="rec-intro">Adjust how much each severity tier counts toward the blended score — turn a tier up if that category of infraction concerns you more (e.g. weight "high" severity items more heavily if consent violations are your top risk). Changes apply immediately, across every open site.</p>
    ${rows}
    <button class="submit-btn" id="btn-reset-weights" style="margin-top:8px;">Reset to defaults</button>
    <p class="section-note" style="margin-top:20px;">Severity tier (high/med/low) is the only weighting axis in this prototype. Weighting by requirement *category* instead (e.g. consent vs. rights vs. transparency) would need every requirement tagged with a category first — not yet modeled here.</p>
  `;
}

/* ============================================================
   PRINT / EXPORT REPORT
   ============================================================ */
function buildPrintReportHTML(site, scan){
  const eff = effectiveRegs(site);
  const regs = []; if(eff.GDPR) regs.push('GDPR'); if(eff.CCPA) regs.push('CCPA');
  const label = countryLabelFor(site);
  let html = `<h1>The Regulatory Ledger — Report</h1>
    <div class="pr-meta">${site.domain}${label?' ('+label+')':''} · Generated ${new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</div>`;

  regs.forEach(regKey=>{
    const score = blendedScore(site, scan, regKey);
    html += `<h2>${regKey} — ${score}/100 (${gradeLabel(score)})</h2>`;
    const gaps = gapItems(site, scan, regKey);
    if(gaps.length===0){
      html += `<div class="pr-item">No material gaps found.</div>`;
    } else {
      gaps.forEach(g=>{
        html += `<div class="pr-item"><span class="pr-status">${g.status}</span> — ${g.item.text}<br><span class="pr-meta">${g.item.layman}</span><br><span class="pr-meta">Suggested fix: ${g.item.proposals[0]}</span></div>`;
      });
    }
  });

  html += `<h2>Risk highlights</h2>`;
  let combinedGaps = [];
  regs.forEach(regKey=>{ combinedGaps = combinedGaps.concat(gapItems(site, scan, regKey)); });
  combinedGaps.slice(0,3).forEach(c=>{
    const fine = FINES[c.item.id];
    html += `<div class="pr-item">${c.item.text} — ${SEV_LABEL[c.item.sev]}${fine ? `<br><span class="pr-meta">Comparable pattern: ${fine.who}, ${fine.fine} (${fine.regulator}, ${fine.year}) — illustrative only</span>` : ''}</div>`;
  });

  html += `<h2>Privacy Trust — ${scan.trust.score}/100 (${gradeLabel(scan.trust.score)})</h2>`;
  TRUST_CATS.forEach(c=>{
    html += `<div class="pr-item">${c.name}: ${scan.trust.scores[c.id]}/100</div>`;
  });

  html += `<p class="pr-meta" style="margin-top:24px;">This report provides informational guidance only, not legal advice. Enforcement figures are composite/illustrative. Generated by a prototype — self-attested items and their AI-style review are simulated.</p>`;
  return html;
}
