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
        <div class="masthead-right">
          <div class="dateline mono">DOCKET OPEN<br>${new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</div>
          <div class="settings-dropdown-wrap">
            <button class="settings-gear-btn" id="btn-settings-toggle">⚙ Settings ${state.settingsMenuOpen?'▴':'▾'}</button>
            ${state.settingsMenuOpen ? `<div class="settings-dropdown-panel">${renderSettingsDropdown()}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="docket">
        <div class="docket-head">
          <h2>Docket</h2>
          <button class="btn-new" id="btn-add-site">+ New entry</button>
        </div>
        <div class="docket-list">${renderDocketList()}</div>
        <div class="disclaimer-foot">
          Informational guidance only, not legal advice — consult qualified counsel before making formal compliance decisions. This tool does not scan or inspect any website; every status here is one a person recorded. Enforcement cases cited are real public actions, shown for comparison only.
        </div>
      </div>
      <div class="main">${renderMain(site)}</div>
    </div>
  `;
  attachHandlers(site);
  /* render() is this app's universal "something changed" signal (see
     CLAUDE.md), so it's also the one reliable place to persist from —
     rather than sprinkling save calls across ~40 mutation sites. The write
     itself is debounced in storage.js. */
  persistState();
}

function renderDocketList(){
  if(state.sites.length===0){
    return `<div class="docket-empty">No entries yet. Add a product to start recording its compliance posture.</div>`;
  }
  let html = '';
  [...state.sites].reverse().forEach(s=>{
    const scan = s.scans[s.scans.length-1];
    const label = countryLabelFor(s);
    const chip = regKey=>{
      const resolved = allRequirementsAssessed(s, regKey);
      const score = blendedScore(s, scan, regKey);
      return `<span class="chip-mini ${resolved?chipClass(score):'pending'}">${regKey} ${resolved?gradeLabel(score):'PENDING'}</span>`;
    };
    html += `<button class="docket-entry ${s.id===state.selectedSiteId?'active':''}" data-site-id="${s.id}">
      <div class="docket-num mono">NO. ${pad3(s.docketNum)}</div>
      <div class="docket-domain">${s.domain}${s.kind==='code'?`<span class="variant-tag">source audit</span>`:''}${label?`<span class="variant-tag">${label}</span>`:''}</div>
      <div class="docket-chips">
        ${chip('GDPR')}
        ${chip('CCPA')}
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
  if(state.showNewScanForm || !site) return renderNewScanForm(state.sites.length>0);

  const scan = site.scans[site.scans.length-1];
  const prevScan = site.scans.length>1 ? site.scans[site.scans.length-2] : null;

  let body = '';
  if(state.activeTab==='compliance') body = renderComplianceTab(site, scan);
  else if(state.activeTab==='recommendations') body = renderRecommendationsTab(site, scan);
  else if(state.activeTab==='legislation') body = renderLegislationTab(site);
  else if(state.activeTab==='competitors') body = renderCompetitorsTab(site, scan);

  const label = countryLabelFor(site);

  return `
    <div class="site-header">
      <div>
        <h1 class="disp">${site.domain}${label?`<span class="variant-tag">${label}</span>`:''}</h1>
        <div class="site-meta">
          NO. ${pad3(site.docketNum)} · ${site.kind==='code'
            ? `SOURCE AUDIT (ARCHIVED) · ${site.codeStats.analyzedFiles.toLocaleString()} FILES ANALYZED · ${new Date(scan.timestamp).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`
            : `OPENED ${new Date(site.addedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`}
        </div>
      </div>
      <div class="header-actions">
        <button class="export-btn" id="btn-export">↓ Export PDF report</button>
        <button class="ff-btn" id="btn-fastforward" title="Demo only: ages all self-attested items by 100 days">⏩ Simulate 100 days (demo)</button>
        ${state.crawlBackend && state.crawlBackend.available && site.kind!=='code'
          ? `<button class="rescan-btn" id="btn-crawl" ${state.crawling?'disabled':''}>${state.crawling ? '⟳ Crawling…' : (site.crawl ? '⟳ Re-crawl site' : '⟳ Crawl site')}</button>`
          : ''}
        <button class="export-btn" id="btn-export-audit">↓ Export audit log</button>
      </div>
    </div>

    <div class="reg-picker">
      <span class="label">Regulations in scope</span>
      <button class="reg-toggle ${effectiveRegs(site).GDPR?'on':''}" data-reg="GDPR">GDPR</button>
      <button class="reg-toggle ${effectiveRegs(site).CCPA?'on':''}" data-reg="CCPA">CCPA / CPRA</button>
      <button class="country-toggle-btn ${state.countryPanelOpen?'open':''}" id="btn-country-toggle">Filter by country ${state.countryPanelOpen?'▴':'▾'}</button>
    </div>
    ${site.kind==='code' ? `<div class="retired-track-note">Historical record — this entry came from the codebase-upload path, retired in v0.8.0 (see ROADMAP). Its findings and evidence are preserved and still count toward the score; it can't be re-audited from the browser. Overrides and attestations remain fully editable.</div>` : ''}
    <p class="picker-tip">Tip: selecting a country below can keep a regulation active even if its direct toggle looks off — the picker shows the combined result of both.</p>
    ${renderCountryPanel(site)}

    <div class="tabs">
      <button class="tab-btn ${state.activeTab==='compliance'?'active':''}" data-tab="compliance">COMPLIANCE RESULTS</button>
      <button class="tab-btn ${state.activeTab==='recommendations'?'active':''}" data-tab="recommendations">RECOMMENDATIONS</button>
      <button class="tab-btn ${state.activeTab==='legislation'?'active':''}" data-tab="legislation">UPCOMING LEGISLATION</button>
      <button class="tab-btn ${state.activeTab==='competitors'?'active':''}" data-tab="competitors">VS. COMPETITORS</button>
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
      <h1 class="disp">${canCancel ? 'Add another entry.' : 'Open a new case file.'}</h1>
      <p>Add the product you're tracking. This tool doesn't crawl or inspect anything — it gives you the GDPR and CCPA/CPRA requirement set, and you record what's actually true for each one, with your reasoning kept alongside it.
        Select every country this entry covers — it drives which regulations apply, the scoring breakdown, and which upcoming legislation is shown.</p>
      <form class="scan-form" id="new-scan-form">
        <label>Website</label>
        <div class="scan-form-row">
          <input type="text" id="new-scan-input" placeholder="e.g. acmehealth.com" autocomplete="off">
          <button type="submit" class="go-btn">Add entry</button>
        </div>
        <label>Countries this entry covers</label>
        <div class="country-panel" style="margin-bottom:14px;">
          ${rows}
          <div class="country-footnote">* Switzerland is approximated to the GDPR baseline in this prototype — its own law (FADP) is distinct and has its own nuances.</div>
        </div>
        <div class="add-country-row">
          <input type="text" id="new-scan-manual-input" placeholder="Country not listed? Type it here…" value="${state.newScanManualInput}" autocomplete="off">
          <button type="button" id="btn-new-scan-manual-add" class="file-btn">+ Add</button>
        </div>
        ${manualChips ? `<div class="manual-country-chips">${manualChips}</div>` : ''}
        ${state.newScanError ? `<div class="err">${state.newScanError}</div>` : ''}
      </form>
      ${canCancel ? `<button class="cancel-link" id="btn-cancel-new">Cancel</button>` : ''}
    </div>
  `;
}

/* Tri-state collapse: an explicit prior toggle (true/false) always wins;
   with no override yet, Pass items default collapsed and everything else
   (Fail/Partial/Pending/Unassessed/NA) defaults expanded, so what still
   needs attention is what you see. */
function isCollapsed(id, status){
  const explicit = state.collapsedItems[id];
  return explicit !== undefined ? explicit : status==='Pass';
}

function citeHover(item){
  return `<span class="cite-hover"><span class="req-code">${item.code}</span><span class="cite-tooltip"><div class="ct-title">${item.articleTitle}</div>${item.articleText}</span></span>`;
}

function isCrawled(site, itemId){
  const f = site.crawlFindings && site.crawlFindings[itemId];
  return !!(f && f.determinable && !site.overrides[itemId]);
}

/* Evidence hover for crawl findings — real quotes from real fetched pages,
   each with the URL you can open to check it yourself. */
function crawlEvidenceHover(finding){
  if(!finding || !finding.evidence || !finding.evidence.length) return '';
  const rows = finding.evidence.map(h=>`
    <div class="code-ev-row">
      <div class="code-ev-loc">${escapeHtml(h.url)}${h.exact?'':' <span class="sim-tag">paraphrase match</span>'}</div>
      <div class="code-ev-snippet">${escapeHtml(h.quote)}</div>
    </div>`).join('');
  return `<span class="cite-hover evidence-hover"><span class="evidence-trigger">evidence</span><span class="cite-tooltip evidence-tooltip code-ev-tooltip">
    <div class="ct-title">Retrieved from the live site</div>
    ${rows}
    <div class="evidence-disclaimer">Quoted from pages fetched at crawl time. Open the URL to verify — page content can change.</div>
  </span></span>`;
}

/* Real evidence hover for source-audited sites: the file/line/snippet hits
   the audit engine actually found in the uploaded codebase. */
function codeEvidenceHover(verdict){
  if(!verdict || !verdict.evidence || verdict.evidence.length===0) return '';
  const rowsHtml = verdict.evidence.map(h=>`
    <div class="code-ev-row">
      <div class="code-ev-loc">${h.file}:${h.line}${h.weight==='weak'?' <span class="sim-tag">indirect</span>':''}</div>
      <div class="code-ev-snippet">${escapeHtml(h.snippet)}</div>
    </div>`).join('');
  return `<span class="cite-hover evidence-hover"><span class="evidence-trigger">evidence</span><span class="cite-tooltip evidence-tooltip code-ev-tooltip">
    <div class="ct-title">Evidence from your source</div>
    ${rowsHtml}
    <div class="evidence-disclaimer">Matched in the files you uploaded — pattern-based evidence, not a legal determination.</div>
  </span></span>`;
}

function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

  const progressHtml = regs.map(regKey=>{
    const p = assessmentProgress(site, regKey);
    return `<span class="assess-progress-chip ${p.done===p.total?'complete':''}">${regKey}: ${p.done}/${p.total} requirements assessed</span>`;
  }).join('');
  const svc = state.crawlBackend || {};
  let bannerBody;
  if(site.crawl){
    const n = site.crawl.raw.pages.length;
    const disc = site.crawl.raw.discovery || {method:'links'};
    /* Which method chose the pages is provenance for every finding derived
       from them, so it belongs next to the findings rather than buried. */
    const how = disc.method === 'agent'
      ? `Pages were chosen by the navigator agent (${disc.model || 'model'}), which opened ${disc.opened || '?'} page${disc.opened===1?'':'s'} and kept ${disc.selected || 0}.`
      : disc.fellBackFrom
        ? `Pages were chosen by matching link patterns, after agent discovery failed (${escapeHtml(disc.reason || 'unknown reason')}).`
        : `Pages were chosen by matching link patterns against known privacy/legal wording.`;
    bannerBody = `<b>Crawled ${new Date(site.crawl.at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</b> — ${n} page${n===1?'':'s'} retrieved from ${site.domain}. ${how} Results tagged <span class="source-tag crawled">Crawled</span> come from text actually fetched from those pages, quoted with its source URL. A crawl can confirm what a page <i>says</i>; it cannot confirm the underlying practice works. Anything it couldn't determine stays <b>Unassessed</b> rather than being failed.`;
    if(site.crawl.notes && site.crawl.notes.length) bannerBody += `<div class="crawl-notes">${site.crawl.notes.map(x=>'• '+x).join('<br>')}</div>`;
  } else if(svc.available){
    bannerBody = `<b>Nothing has been checked automatically yet.</b> The crawl service is running — use <b>Crawl site</b> above to fetch ${site.domain}'s public pages and record what they actually say. Requirements nobody has assessed show as <b>Unassessed</b> and earn no credit.`;
  } else {
    bannerBody = `<b>Nothing here is automatically detected.</b> The crawl service isn't running, so this tool cannot fetch ${site.domain} — every status below is one you recorded. Start it with <code>node server/index.js</code> to enable crawling. Requirements nobody has assessed show as <b>Unassessed</b> and earn no credit.`;
  }
  const banner = `<div class="honesty-banner">
      ${bannerBody}
      ${state.crawlError ? `<div class="crawl-error">${state.crawlError}</div>` : ''}
      <div class="honesty-progress">${progressHtml}</div>
    </div>`;

  const stampsHtml = regs.map(regKey=>{
    const {label} = regDefs(regKey);
    const score = blendedScore(site, scan, regKey);
    const resolved = allRequirementsAssessed(site, regKey);
    const grade = resolved ? gradeLabel(score) : null;
    return `
      <div class="stamp-wrap">
        <div class="stamp ${resolved?tierClass(grade):'tier-pending'}"><div class="grade disp">${resolved?grade:'—'}</div><div class="glabel">${regKey}</div></div>
        <div>
          <div class="stamp-num mono">${score}/100${resolved?'':' (provisional)'}</div>
          <div class="stamp-caption">${resolved ? topGapsCaption(site, scan, regKey) : `Provisional — ${assessmentProgress(site, regKey).total - assessmentProgress(site, regKey).done} requirement(s) still unassessed. A final grade is withheld until every one has a recorded status.`}</div>
        </div>
      </div>
    `;
  }).join('');

  const blocksHtml = regs.map(regKey=>{
    const {scanned, checklist, label} = regDefs(regKey);
    const allIds = scanned.map(r=>r.id).concat(checklist.map(i=>i.id)).join(',');

    const isCodeSite = site.kind === 'code';
    const scannedRows = scanned.map(req=>{
      const raw = rawStatus(site, scan, regKey, req, 'scanned');
      const eff = itemEffectiveStatus(site, scan, regKey, req, 'scanned');
      const stClass = eff.toLowerCase();
      const collapsed = isCollapsed(req.id, eff);
      let note = '';
      if(isCodeSite){
        const verdict = site.codeEvidence[req.id];
        const evHover = codeEvidenceHover(verdict);
        if(eff==='Fail') note = `<div class="req-note fail">${verdict.rationale}${evHover}</div>${renderPrecedentInline(req)}`;
        else if(eff==='Partial') note = `<div class="req-note partial">${verdict.rationale}${evHover}</div>${renderPrecedentInline(req)}`;
        else if(eff==='Pending') note = `<div class="req-note">${verdict.rationale}</div>`;
        else note = `<div class="req-note">${verdict.rationale}${evHover}</div>`;
      } else if(!site.overrides[req.id] && site.crawlFindings && site.crawlFindings[req.id] && site.crawlFindings[req.id].determinable){
        const f = site.crawlFindings[req.id];
        const cls = eff==='Fail' ? 'fail' : eff==='Partial' ? 'partial' : '';
        note = `<div class="req-note ${cls}">${f.rationale}${crawlEvidenceHover(f)}</div>
          ${f.limitation ? `<div class="crawl-limitation">What a crawl can’t tell you: ${f.limitation}</div>` : ''}
          ${(eff==='Fail'||eff==='Partial') ? renderPrecedentInline(req) : ''}`;
      } else if(eff==='Unassessed'){
        /* Criteria to judge against — deliberately phrased as "counts as"
           rather than "we found", because nothing has been inspected. */
        const cf = site.crawlFindings && site.crawlFindings[req.id];
        const lead = (cf && !cf.determinable)
          ? cf.rationale
          : 'Nobody has recorded a status for this yet. Check it against your live site and record what you find.';
        note = `<div class="req-note unassessed">${lead}
          <div class="assess-criteria"><b>Counts as Partial:</b> ${req.guide.partial}</div>
          <div class="assess-criteria"><b>Counts as Fail:</b> ${req.guide.fail}</div></div>`;
      } else {
        if(eff==='Fail') note = `<div class="req-note fail">${req.guide.fail}</div>${renderPrecedentInline(req)}`;
        else if(eff==='Partial') note = `<div class="req-note partial">${req.guide.partial}</div>${renderPrecedentInline(req)}`;
      }
      return `
        <div class="ledger-row">
          <div>
            <div class="req-text"><button type="button" class="collapse-toggle" data-collapse-toggle="${req.id}" data-currently-collapsed="${collapsed}" aria-label="Toggle details">${collapsed?'▸':'▾'}</button><span class="source-tag ${isCodeSite?'code':(isCrawled(site, req.id)?'crawled':'')}">${isCodeSite?'Source audit':(isCrawled(site, req.id)?'Crawled':'Publicly observable')}</span>${citeHover(req)} ${req.text}</div>
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
    const resolved = allRequirementsAssessed(site, regKey);

    return `
      <div class="reg-block">
        <h3 class="disp">${regKey}</h3>
        <div class="reg-sub">${label}
          <button type="button" class="link-btn" style="margin-left:12px;" data-collapse-all="${allIds}">Collapse all</button>
          <button type="button" class="link-btn" style="margin-left:8px;" data-expand-all="${allIds}">Expand all</button>
        </div>
        <div class="ledger-section-label">${isCodeSite ? 'Source-audited — real evidence from your uploaded code (archived)' : 'Publicly observable — check these on your live site and record what you find'}</div>
        <div class="ledger">${scannedRows}</div>
        <div class="ledger-section-label">Behind login — self-attested${resolved ? '' : ' · required before a final grade is given'}</div>
        <div class="ledger">${checklistRows}</div>
      </div>
    `;
  }).join('');

  return `${banner}<div class="stamp-row">${stampsHtml}</div>${renderExposureSummary(site, scan)}${renderCountryBreakdown(site, scan)}${blocksHtml}`;
}

function renderExposureSummary(site, scan){
  const exp = exposureSummary(site, scan);
  if(!exp) return '';
  const rangesHtml = exp.ranges.map(r=>
    `${r.symbol}${formatMoney(r.min)}${r.min!==r.max?'–'+r.symbol+formatMoney(r.max):''}`
  ).join(' · ');
  return `
    <div class="exposure-summary">
      <div class="exposure-label">Potential exposure — ${exp.caseCount} comparable public enforcement action${exp.caseCount===1?'':'s'} matching gaps you've recorded (unassessed requirements are excluded)</div>
      <div class="exposure-range mono">${rangesHtml}</div>
      <div class="exposure-note">Real, publicly reported enforcement cases cited for comparison — not a claim that this site committed these violations or has any connection to these companies.</div>
    </div>
  `;
}

function renderPrecedentInline(item){
  const fine = FINES[item.id];
  if(!fine) return `<div class="precedent"><span class="none">No directly comparable public enforcement case in this prototype’s dataset.</span></div>`;
  return `
    <div class="precedent">
      <div class="pre-label">Comparable enforcement action</div>
      <div><b>${fine.who}</b> — ${fine.violation}.</div>
      <div style="margin-top:4px;">Fine: <span class="fine">${fine.fine}</span> · ${fine.regulator} · ${fine.year}</div>
    </div>
  `;
}

function renderOverrideControl(site, itemId, rawCurrentStatus){
  const key = site.id+'::'+itemId;
  const ov = site.overrides[itemId];
  const isOpen = !!state.overrideOpen[key];
  const historyCount = (state.overrideHistory[itemId]||[]).length;
  let html = '';
  if(ov){
    /* If the underlying result has moved since this override was recorded,
       the reason for overriding may no longer hold — surface it rather than
       letting a stale manual verdict quietly outrank fresh evidence. */
    const basisChanged = rawCurrentStatus !== undefined && rawCurrentStatus !== ov.previousStatus;
    html += `<div class="override-note"><span class="override-badge">${ov.previousStatus==='Unassessed' ? 'Assessed' : 'Overridden'}</span>${ov.previousStatus==='Unassessed' ? '' : ov.previousStatus+' → '}${ov.status} — “${ov.explanation}”
      ${basisChanged ? `<div class="override-basis-changed">⚠ This override was recorded when the underlying result was <b>${ov.previousStatus}</b>. The latest run says <b>${rawCurrentStatus}</b> — worth re-checking whether the override still applies.</div>` : ''}
      <div style="margin-top:6px;"><button class="link-btn" data-clear-override="${itemId}">Clear override</button></div></div>`;
  } else if(isOpen){
    const draft = state.overrideDrafts[key] || (state.overrideDrafts[key] = {status: rawCurrentStatus==='NA'?'Pass':rawCurrentStatus, explanation:''});
    html += `<div class="override-form">
      <div><select data-override-status-for="${itemId}">
        ${['Pass','Partial','Fail','NA'].map(s=>`<option value="${s}" ${draft.status===s?'selected':''}>${s}</option>`).join('')}
      </select></div>
      <textarea class="checklist-textarea" data-override-explain-for="${itemId}" placeholder="${rawCurrentStatus==='Unassessed' ? 'What did you check, and what did you find? (required)' : "Why is the system's read wrong? (required)"}">${draft.explanation}</textarea>
      ${draft.error ? `<div class="err">Please add a brief explanation before saving.</div>` : ''}
      <div style="margin-top:9px;">
        <button class="submit-btn" data-override-submit-for="${itemId}">Save override</button>
        <button class="link-btn" style="margin-left:12px;" data-override-cancel-for="${itemId}">Cancel</button>
      </div>
    </div>`;
  } else {
    html += `<button class="link-btn" data-override-open-for="${itemId}">${rawCurrentStatus==='Unassessed' ? 'Record assessment' : 'Override this result'}</button>`;
  }
  if(historyCount >= 2 && !ov){
    html += `<div class="learn-flag">⚠ Overridden ${historyCount} times across scans in this session — detection logic for this requirement may need recalibrating.</div>`;
  }
  return html;
}

/* ---- Attestation review UI --------------------------------------------
   The reviewer's output is shown in four separate registers, deliberately
   kept apart: what it concluded (rationale), what in your own words it
   concluded that from (basis), what it still couldn't establish (gaps),
   and the interview that got there. Keeping the basis visible and
   verbatim is what stops a fluent paragraph from reading as evidence. */

function descriptionFieldsHtml(item, draft){
  return `
    <textarea class="checklist-textarea" data-desc-for="${item.id}" placeholder="Briefly describe how this works today…">${draft.description}</textarea>
    <div class="checklist-file-row">
      <label class="file-btn">📎 Attach screenshot (optional)
        <input type="file" accept="image/*" data-shot-for="${item.id}" style="display:none;">
      </label>
      ${draft.screenshot ? `<img class="thumb-preview" src="${draft.screenshot}">` : ''}
    </div>`;
}

function attestReviewerHintHtml(){
  const svc = state.crawlBackend || {};
  if(svc.available && svc.agent && svc.agent.available){
    return `<div class="reviewer-hint">Reviewed against the citation by the attestation interviewer, which may ask follow-up questions before recording a status.</div>`;
  }
  return `<div class="reviewer-hint">The review agent isn’t available, so this will be checked by the keyword heuristic — a drafting aid rather than a verdict. Start the crawl service with an <code>ANTHROPIC_API_KEY</code> for a real review.</div>`;
}

function reviewerTagHtml(st){
  if(st.fromCode) return '';
  if(st.reviewer === 'model') return `<span class="reviewer-tag model">Interviewed &amp; reviewed</span>`;
  if(st.reviewer === 'keyword') return `<span class="reviewer-tag keyword">Keyword heuristic</span>`;
  return '';
}

function reviewerNoteHtml(st){
  if(!st.fallbackReason) return '';
  return `<div class="reviewer-fallback">Reviewed by the keyword heuristic because ${escapeHtml(st.fallbackReason)}. Treat this as a drafting aid, not a verdict.</div>`;
}

function basisHtml(st){
  if(!st.basis || !st.basis.length) return '';
  return `
    <div class="basis-box">
      <div class="basis-head">Based on what you told us</div>
      ${st.basis.map(b=>`
        <div class="basis-row">
          <div class="basis-quote">“${escapeHtml(b.quote)}”</div>
          <div class="basis-est">${escapeHtml(b.establishes)}</div>
        </div>`).join('')}
    </div>`;
}

function gapsHtml(st){
  if(!st.gaps || !st.gaps.length) return '';
  return `
    <div class="gaps-box">
      <div class="gaps-head">Not established by your account</div>
      <ul>${st.gaps.map(g=>`<li>${escapeHtml(g)}</li>`).join('')}</ul>
    </div>`;
}

/* An attestation whose basis couldn't be traced back to anything the user
   wrote isn't evidence, however well it reads. Say so where the status is,
   not in a footnote. */
function ungroundedHtml(st){
  if(st.reviewer !== 'model' || st.grounded) return '';
  return `<div class="ungrounded-warn">⚠ The reviewer couldn’t point to anything in your own words to support this. Nothing here was verified against your description — treat the status as unsupported until you add detail and re-review.</div>`;
}

function interviewThreadHtml(st){
  if(!st || !st.turns || !st.turns.length) return '';
  return `
    <div class="interview-thread">
      <div class="interview-head">Follow-up questions asked</div>
      ${st.turns.map(t=>`
        <div class="interview-turn">
          <div class="interview-q">${escapeHtml(t.question)}</div>
          <div class="interview-a">${escapeHtml(t.answer)}</div>
        </div>`).join('')}
    </div>`;
}

function renderChecklistItem(site, scan, regKey, item){
  const st = site.checklistState[item.id];
  const draft = getDraft(site.id, item.id);
  const checked = !!(st && st.checked);
  const raw = rawStatus(site, scan, regKey, item, 'attested');
  const eff = itemEffectiveStatus(site, scan, regKey, item, 'attested');
  const collapsed = isCollapsed(item.id, eff);

  let statusBadge = `<span class="status-badge ${eff.toLowerCase()}">${eff}</span>`;

  const reviewing = !!state.reviewing[item.id];

  let bodyHtml = '';
  if(checked){
    if(reviewing){
      bodyHtml = `
        <div class="checklist-body">
          ${interviewThreadHtml(st)}
          <div class="reviewing-note">⟳ Reviewing your description against ${item.code}…</div>
        </div>`;
    } else if(st.needsFollowUp && !st.finalized){
      bodyHtml = `
        <div class="checklist-body">
          ${descriptionFieldsHtml(item, draft)}
          ${interviewThreadHtml(st)}
          <div class="followup-box">
            <div class="followup-q">${escapeHtml(st.followUpQuestion || '')}</div>
            ${st.whyItMatters ? `<div class="followup-sketch">Why this matters: ${escapeHtml(st.whyItMatters)}</div>` : ''}
            ${st.sketch ? `<div class="followup-sketch">${escapeHtml(st.sketch)}</div>` : ''}
            <textarea class="checklist-textarea" data-followup-for="${item.id}" placeholder="Your answer…">${draft.followUpAnswer}</textarea>
            <button class="submit-btn" data-submit-for="${item.id}">Submit answer</button>
            <button class="link-btn" style="margin-left:12px;" data-submit-for="${item.id}" data-decline>Record without answering</button>
            ${reviewerNoteHtml(st)}
          </div>
        </div>
      `;
    } else if(st.finalized){
      const staleDays = st.attestedAt ? Math.floor((Date.now()-st.attestedAt)/86400000) : 0;
      const isStale = staleDays > STALE_DAYS;
      const fromCode = !!st.fromCode;
      const evHover = fromCode ? codeEvidenceHover(site.codeEvidence && site.codeEvidence[item.id]) : '';
      bodyHtml = `
        <div class="checklist-body">
          <div class="result-box">
            ${fromCode ? `<span class="confidence-tag code-attested-tag">Auto-attested from source</span>` : ''}
            ${reviewerTagHtml(st)}
            <span class="confidence-tag">Confidence: ${st.confidence}</span>
            ${isStale ? `<span class="stale-badge">Needs re-attestation</span>` : ''}
            ${st.strictnessStale ? `<span class="stale-badge">Reviewed at a different strictness</span>` : ''}
          </div>
          <div class="rationale-text">${escapeHtml(st.rationale || '')}${evHover}</div>
          ${basisHtml(st)}
          ${gapsHtml(st)}
          ${ungroundedHtml(st)}
          ${interviewThreadHtml(st)}
          <div class="attested-meta">${fromCode?'Auto-attested from source audit':'Attested'} ${staleDays===0?'today':staleDays+' day'+(staleDays===1?'':'s')+' ago'}${isStale ? ' — stale, last-known status still counted toward score.' : '.'}</div>
          ${reviewerNoteHtml(st)}
          ${(st.strictnessStale || isStale) && !fromCode ? `<button class="link-btn" data-submit-for="${item.id}">Re-review with the current settings</button>` : ''}
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="checklist-body">
          ${descriptionFieldsHtml(item, draft)}
          <button class="submit-btn" data-submit-for="${item.id}">Submit for review</button>
          ${attestReviewerHintHtml()}
        </div>
      `;
    }
  }

  return `
    <div class="checklist-item">
      <div class="checklist-head-row">
        <div class="checklist-check-row">
          <input type="checkbox" id="chk-${item.id}" data-check-for="${item.id}" ${checked?'checked':''}>
          <button type="button" class="collapse-toggle" data-collapse-toggle="${item.id}" data-currently-collapsed="${collapsed}" aria-label="Toggle details">${collapsed?'▸':'▾'}</button>
          <div>
            <label class="checklist-label" for="chk-${item.id}"><span class="source-tag attested">Self-attested</span>${citeHover(item)} ${item.text}</label>
            ${!collapsed ? `
              <div class="layman-text" style="margin-left:27px;">${item.layman}</div>
              <div class="checklist-guidance">${item.guidance}</div>
              ${(site.kind==='code' && !checked) ? `<div class="checklist-guidance code-no-evidence">Source audit found no evidence for this item — attest it manually below, or override.</div>` : ''}
            ` : ''}
          </div>
        </div>
        ${statusBadge}
      </div>
      ${!collapsed ? bodyHtml : ''}
      ${(!collapsed && (eff==='Fail'||eff==='Partial')) ? `<div style="margin-left:27px;">${renderPrecedentInline(item)}</div>` : ''}
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

function renderCompetitorManualEntry(site){
  const manualChips = (site.manualCompetitors||[]).map((m,i)=>
    `<span class="manual-country-chip">${m.name} <button type="button" class="chip-remove" data-remove-manual-competitor="${i}" aria-label="Remove ${m.name}">×</button></span>`
  ).join('');
  return `
    <div class="add-country-row">
      <input type="text" id="competitor-manual-input" placeholder="Add a competitor you're tracking…" value="${state.manualCompetitorInput[site.id]||''}" autocomplete="off">
      <button type="button" id="btn-competitor-manual-add" class="file-btn">+ Add</button>
    </div>
    ${manualChips ? `<div class="manual-country-chips">${manualChips}</div>` : ''}
  `;
}

function renderCompetitorsTab(site, scan){
  const manualEntry = renderCompetitorManualEntry(site);
  const names = (site.manualCompetitors||[]).map(m=>m.name);
  return `
    <p class="rec-intro">Competitors you're tracking. This tool has no way to assess another company's compliance — doing so would mean auditing their product the same way you audit yours — so no comparison scores are shown. Previous versions displayed simulated numbers next to these names; those were removed in v0.9.0 because a fabricated score attached to a real company is a claim this tool can't stand behind.</p>
    ${manualEntry}
    ${names.length
      ? `<div class="section-note">Tracking ${names.length} competitor${names.length===1?'':'s'}. Assessing them would require running each through the same requirement checklist you use for your own product.</div>`
      : `<p class="section-note">None added yet.</p>`}
  `;
}

/* Which method picks the pages to crawl. Exposed because the two have
   genuinely different costs: the agent opens pages the hint list can't
   reach, and bills tokens for every run. Auto is the sensible default;
   the explicit options exist so a run can be pinned either way — pinning
   to link patterns is also how you get a free re-crawl. */
function renderDiscoverySetting(){
  const svc = state.crawlBackend || {};
  const agentOk = !!(svc.agent && svc.agent.available);
  const opts = [
    ['auto',  'Automatic', agentOk ? 'Uses the navigator agent, falling back to link patterns.' : 'The agent isn’t available, so this uses link patterns.'],
    ['agent', 'Navigator agent', 'A model reads the site and follows the links a person would. Costs tokens per crawl.'],
    ['links', 'Link patterns', 'Matches link text against known privacy wording. Free, but only finds wording we anticipated.'],
  ];
  return `
    <div class="settings-dropdown-title" style="margin-top:14px;">Page discovery</div>
    <p class="settings-dropdown-note">How the crawl decides which pages to read.</p>
    <div class="discovery-opts">
      ${opts.map(([val,label,note])=>`
        <label class="discovery-opt ${state.discoveryMode===val?'on':''} ${val==='agent'&&!agentOk?'disabled':''}">
          <input type="radio" name="discovery-mode" value="${val}" ${state.discoveryMode===val?'checked':''} ${val==='agent'&&!agentOk?'disabled':''}>
          <span><b>${label}</b><br><span class="discovery-note">${note}</span></span>
        </label>`).join('')}
    </div>
    ${!agentOk ? `<div class="discovery-warn">${escapeHtml((svc.agent && svc.agent.reason) || 'The crawl service isn’t running.')}</div>` : ''}`;
}

function renderSettingsDropdown(){
  const lvl = STRICTNESS_LEVELS[state.strictness] || STRICTNESS_LEVELS[DEFAULT_STRICTNESS];
  const size = persistedSizeLabel();
  return `
    <div class="settings-dropdown-title">Strictness</div>
    <p class="settings-dropdown-note">How literally a finding must match the letter of the law.</p>
    <div class="strictness-row">
      <input type="range" min="1" max="5" step="1" value="${state.strictness}" id="strictness-slider">
    </div>
    <div class="strictness-scale mono"><span>Lenient</span><span>Letter of the law</span></div>
    <div class="strictness-current"><b>${lvl.label}</b> — ${lvl.blurb}</div>
    <div class="strictness-example">e.g. ${lvl.example}</div>
    <p class="settings-dropdown-note" style="margin-top:10px;">Changing this re-evaluates existing self-attestations that were judged from a written description by the keyword heuristic. Attestations reviewed by the interviewer are flagged as reviewed at a different strictness rather than silently re-run — that would mean a network call and a bill you didn't ask for. Manual overrides are never touched.</p>
    ${renderDiscoverySetting()}

    <div class="settings-section-divider"></div>
    <div class="settings-dropdown-title">Saved data</div>
    <p class="settings-dropdown-note">Your overrides, attestations, and notes are saved in this browser only — never uploaded. ${size ? `Currently using <b>${size}</b>.` : 'Nothing saved yet.'}</p>
    ${state.storageWarning ? `<div class="storage-warning">${state.storageWarning}</div>` : ''}
    <div class="settings-data-row">
      <button class="link-btn" id="btn-export-data">Export data</button>
      <label class="link-btn" style="cursor:pointer;">Import data
        <input type="file" id="import-data-input" accept="application/json,.json" style="display:none;">
      </label>
      <button class="link-btn settings-danger" id="btn-clear-data">Clear all</button>
    </div>
    ${state.importMessage ? `<div class="settings-import-msg">${state.importMessage}</div>` : ''}
  `;
}

/* ============================================================
   AUDIT LOG (printable evidence record)
   ============================================================
   The full provenance behind the current posture: every run, every
   requirement's status and where it came from, every attestation, and every
   override with its stated reason. Distinct from the summary report above —
   that one is for stakeholders, this one is for whoever asks "on what basis
   did you conclude that, and when?" */
function auditTs(ts){
  if(!ts) return '—';
  return new Date(ts).toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}

function auditItemRow(site, scan, regKey, item, source){
  const raw = rawStatus(site, scan, regKey, item, source);
  const eff = itemEffectiveStatus(site, scan, regKey, item, source);
  const ov = site.overrides[item.id];
  const st = site.checklistState[item.id];
  let provenance = '';

  if(source === 'scanned'){
    if(site.kind === 'code'){
      const v = site.codeEvidence && site.codeEvidence[item.id];
      if(v && v.evidence && v.evidence.length){
        provenance = `Source audit — matched in ${v.evidence.map(h=>`${h.file}:${h.line}`).join(', ')}.`;
      } else if(v){
        provenance = `Source audit — ${v.rationale}`;
      }
    } else {
      const ov0 = site.overrides[item.id];
      provenance = ov0
        ? `Assessed by a person ${auditTs(ov0.timestamp)} — publicly-observable requirement, checked manually. No automated inspection was performed.`
        : 'Not yet assessed — counts as zero credit. No automated inspection is performed for this requirement.';
    }
  } else {
    if(st && st.finalized){
      /* Which reviewer produced a status is provenance, not decoration: a
         model interview and a keyword count are not the same evidence, and
         whoever reads this log later needs to know which one they're
         looking at. */
      const how = st.fromCode ? 'Auto-attested from source audit'
        : st.reviewer === 'model' ? `Self-attested, reviewed by the attestation interviewer`
        : st.reviewer === 'keyword' ? 'Self-attested, checked by the keyword heuristic (a drafting aid, not a verdict)'
        : 'Self-attested';
      provenance = `${how} ${auditTs(st.attestedAt)} · confidence ${st.confidence}. ${escapeHtml(st.rationale || '')}`;
      if(st.basis && st.basis.length){
        provenance += `<br><i>Basis, in the attester's own words:</i> ${st.basis.map(b=>`“${escapeHtml(b.quote)}”`).join(' · ')}`;
      }
      if(st.gaps && st.gaps.length){
        provenance += `<br><i>Not established:</i> ${st.gaps.map(g=>escapeHtml(g)).join('; ')}`;
      }
      if(st.reviewer === 'model' && !st.grounded){
        provenance += ` <b>Unsupported — the reviewer could not cite anything the attester actually wrote.</b>`;
      }
      if(st.fallbackReason){
        provenance += `<br><i>Fell back to the keyword heuristic because ${escapeHtml(st.fallbackReason)}.</i>`;
      }
      if(st.turns && st.turns.length){
        provenance += `<br><i>Follow-ups:</i> ${st.turns.map(t=>`“${escapeHtml(t.question)}” → “${escapeHtml(t.answer)}”`).join(' · ')}`;
      }
      const staleDays = st.attestedAt ? Math.floor((Date.now()-st.attestedAt)/86400000) : 0;
      if(staleDays > STALE_DAYS) provenance += ` <b>Stale — ${staleDays} days old, past the ${STALE_DAYS}-day re-attestation window.</b>`;
    } else if(st && st.checked){
      provenance = 'Checked as in-place but not yet submitted for review — counts as zero credit.';
    } else {
      provenance = 'Not attested — counts as zero credit.';
    }
  }

  const overrideHtml = ov
    ? `<div class="al-override"><b>Overridden ${auditTs(ov.timestamp)}:</b> ${ov.previousStatus} → ${ov.status}. Reason given: “${escapeHtml(ov.explanation)}”${
        raw !== ov.previousStatus ? ` <b>Basis has since changed — the underlying result is now ${raw}.</b>` : ''}</div>`
    : '';

  return `
    <div class="pr-item al-item">
      <div><span class="pr-status">${eff}</span> — ${item.code} · ${item.text}</div>
      <div class="pr-meta">${provenance}</div>
      ${overrideHtml}
    </div>`;
}

function buildAuditLogHTML(site){
  const scan = site.scans[site.scans.length-1];
  const eff = effectiveRegs(site);
  const regs = []; if(eff.GDPR) regs.push('GDPR'); if(eff.CCPA) regs.push('CCPA');
  const lvl = STRICTNESS_LEVELS[state.strictness] || STRICTNESS_LEVELS[DEFAULT_STRICTNESS];
  const label = countryLabelFor(site);

  let html = `<h1>Compliance Audit Log</h1>
    <div class="pr-meta">
      ${site.domain}${label?` · ${label}`:''} · Docket No. ${pad3(site.docketNum)}<br>
      Entry opened ${auditTs(site.addedAt)} · Log generated ${auditTs(Date.now())}<br>
      Assessment method: ${
        site.kind==='code'
          ? 'archived source audit of an uploaded codebase (real analysis), plus self-attestation'
          : site.crawl
            ? `crawl of the site's public pages (${site.crawl.raw.discovery && site.crawl.raw.discovery.method === 'agent'
                ? `pages selected by the navigator agent, ${site.crawl.raw.discovery.model}`
                : 'pages selected by matching link patterns'}), plus self-attestation for anything behind login`
            : 'manual assessment and self-attestation — no website was crawled'}<br>
      Strictness setting at time of export: <b>${lvl.label}</b> — ${lvl.blurb}
    </div>`;

  html += `<h2>Record history</h2>`;
  site.scans.forEach((s,i)=>{
    html += `<div class="pr-item">Run ${i+1} of ${site.scans.length} — ${auditTs(s.timestamp)}${
      s.source==='code' ? ` · source audit${site.codeStats ? ` · ${site.codeStats.analyzedFiles.toLocaleString()} files analyzed, ${site.codeStats.skippedFiles.toLocaleString()} skipped` : ''}` : ' · entry opened (no automated inspection)'}</div>`;
  });

  if(regs.length === 0){
    html += `<h2>Findings</h2><div class="pr-item">No regulation currently in scope for this entry.</div>`;
  }

  regs.forEach(regKey=>{
    const {scanned, checklist, label:regLabel} = regDefs(regKey);
    const score = blendedScore(site, scan, regKey);
    const resolved = allRequirementsAssessed(site, regKey);
    html += `<h2>${regKey} — ${score}/100 ${resolved ? `(${gradeLabel(score)})` : '(provisional — final grade pending self-attestation)'}</h2>`;
    html += `<div class="pr-meta">${regLabel}</div>`;
    html += `<h3>${site.kind==='code' ? 'Source-audited (archived)' : 'Publicly observable — manually assessed'}</h3>`;
    scanned.forEach(item=>{ html += auditItemRow(site, scan, regKey, item, 'scanned'); });
    html += `<h3>Behind login — self-attested</h3>`;
    checklist.forEach(item=>{ html += auditItemRow(site, scan, regKey, item, 'attested'); });
  });

  const repeatOverrides = Object.entries(state.overrideHistory || {}).filter(([,h])=>h.length>=2);
  if(repeatOverrides.length){
    html += `<h2>Repeatedly overridden requirements</h2>`;
    html += `<div class="pr-meta">Flagged because detection logic that is corrected repeatedly may need recalibrating.</div>`;
    repeatOverrides.forEach(([itemId, hist])=>{
      html += `<div class="pr-item">${itemId} — overridden ${hist.length} times. Most recent reason: “${escapeHtml(hist[hist.length-1].explanation)}”</div>`;
    });
  }

  html += `<p class="pr-meta" style="margin-top:24px;">This log records what this tool observed and what was attested to it, with timestamps and stated reasons. It is informational guidance, not legal advice, and not a certification of compliance. ${site.kind==='code' ? 'Archived source-audit findings are pattern-based evidence of implementation, not proof of correctness;' : 'No automated inspection was performed;'} self-attested items reflect what a user asserted. Enforcement figures cited elsewhere in this tool are real public cases used for comparison, not findings about this entry.</p>`;
  return html;
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
    const resolved = allRequirementsAssessed(site, regKey);
    html += resolved
      ? `<h2>${regKey} — ${score}/100 (${gradeLabel(score)})</h2>`
      : `<h2>${regKey} — ${score}/100 (provisional — ${assessmentProgress(site, regKey).total - assessmentProgress(site, regKey).done} requirement(s) unassessed)</h2>`;
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
    html += `<div class="pr-item">${c.item.text} — ${SEV_LABEL[c.item.sev]}${fine ? `<br><span class="pr-meta">Comparable enforcement action: ${fine.who}, ${fine.fine} (${fine.regulator}, ${fine.year}) — real public case cited for comparison, not a claim about this site</span>` : ''}</div>`;
  });

  html += `<p class="pr-meta" style="margin-top:24px;">This report provides informational guidance only, not legal advice. No website was scanned or inspected to produce it: every status reflects an assessment a person recorded. Enforcement figures cite real, publicly reported cases for comparison only — not findings about this site.</p>`;
  return html;
}
