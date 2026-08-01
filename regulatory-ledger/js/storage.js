/* ============================================================
   PERSISTENCE (localStorage — survives reload and long gaps)
   ============================================================
   Keeps the *manual* work — overrides and their explanations, self-attested
   checklist answers, typed drafts, competitor/country additions, severity
   weights — so re-auditing the same product months later doesn't mean
   re-entering everything.

   Deliberately local-only: this project has no backend (see CLAUDE.md), and
   compliance notes about a real company shouldn't be shipped anywhere
   without an explicit decision. SPEC.md Phase 1 is where server-side
   accounts/history live; this is the honest no-backend version of it.

   Transient UI state (scanning flags, progress, open panels, form drafts for
   the *new scan* screen) is deliberately NOT persisted — rehydrating
   `scanning: true` would restore a stuck progress view with no audit
   running behind it. */

const PERSIST_KEY = 'regulatory-ledger:state';
const PERSIST_VERSION = 1;
const PERSIST_DEBOUNCE_MS = 400;

/* Durable slices of `state`. Anything not listed here resets on reload. */
const PERSIST_FIELDS = [
  'sites',            // includes overrides, checklistState, scans, codeEvidence
  'selectedSiteId',
  'nextDocketNum',
  'drafts',           // typed descriptions / follow-up answers / screenshots
  'overrideHistory',  // drives the "overridden N times, may need recalibrating" flag
  'strictness',
  'activeTab',
  'discoveryMode',    // agent vs. link-pattern page discovery
];

let persistTimer = null;

/* Attached file bytes are data URIs and dominate the payload — a single
   PDF is larger than everything else in this app put together, and
   localStorage gives us a few megabytes total. So there are two passes:
   normally we keep small files (a screenshot fits, and losing it between
   sessions would be annoying) and drop the bytes of large ones; under
   quota pressure we drop every file's bytes.

   What never gets dropped is the attachment's *record* — name, type, size.
   The audit log still shows that a 40 MB walkthrough video was attached to
   this requirement on this date, which is the part that matters for
   provenance. The UI marks a file whose contents are gone as needing
   re-attachment rather than pretending it can still be read. */
function stripAttachmentData(drafts, keepUnder){
  const out = {};
  Object.entries(drafts || {}).forEach(([k,d])=>{
    const copy = {...d, screenshot: null};
    if(Array.isArray(d.attachments)){
      copy.attachments = d.attachments.map(a=>{
        if(!a.dataUrl) return a;
        if(keepUnder && (a.size || 0) <= keepUnder) return a;
        const {dataUrl, ...rest} = a;
        return {...rest, dataDropped: true};
      });
    }
    out[k] = copy;
  });
  return out;
}

function persistSnapshot(includeScreenshots){
  const data = {};
  PERSIST_FIELDS.forEach(k=>{ data[k] = state[k]; });
  data.drafts = includeScreenshots
    ? stripAttachmentData(state.drafts, ATT_PERSIST_MAX)
    : stripAttachmentData(state.drafts, 0);
  return JSON.stringify({version: PERSIST_VERSION, savedAt: Date.now(), data});
}

function persistWrite(){
  try{
    localStorage.setItem(PERSIST_KEY, persistSnapshot(true));
    state.storageWarning = null;
    return true;
  }catch(e){
    // Quota exceeded (or storage disabled). Retry without screenshots.
    try{
      localStorage.setItem(PERSIST_KEY, persistSnapshot(false));
      state.storageWarning = 'Saved, but attached files were too large for this browser’s storage — their names stay in the record, the contents don’t survive a reload. Descriptions, overrides and attestations were all kept. Use “Export data” to keep the files.';
      return true;
    }catch(e2){
      state.storageWarning = 'Could not save to this browser’s storage — your manual work will be lost on reload. Use “Export data” to keep a copy.';
      return false;
    }
  }
}

/* Debounced so the ~every-50-files re-renders during a source audit don't
   each trigger a full serialize+write. */
function persistState(){
  if(persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(()=>{ persistTimer = null; persistWrite(); }, PERSIST_DEBOUNCE_MS);
}

/* Write immediately if a debounced save is still pending. Without this, a
   note typed and then immediately followed by closing the tab would be lost
   inside the debounce window — exactly the manual work this is meant to keep. */
function flushPersist(){
  if(!persistTimer) return;
  clearTimeout(persistTimer);
  persistTimer = null;
  persistWrite();
}
window.addEventListener('beforeunload', flushPersist);
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'hidden') flushPersist();
});

/* Merge persisted values over the in-memory defaults. Anything malformed is
   discarded rather than crashing the app on boot — a corrupt payload should
   cost you your history, not the whole tool. */
function loadPersistedState(){
  let raw;
  try{ raw = localStorage.getItem(PERSIST_KEY); }
  catch(e){ return false; }          // storage blocked entirely (private mode, etc.)
  if(!raw) return false;
  let parsed;
  try{ parsed = JSON.parse(raw); }
  catch(e){ return false; }
  if(!parsed || parsed.version !== PERSIST_VERSION || !parsed.data) return false;
  if(!Array.isArray(parsed.data.sites)) return false;

  PERSIST_FIELDS.forEach(k=>{
    if(parsed.data[k] !== undefined && parsed.data[k] !== null) state[k] = parsed.data[k];
  });
  // Defensive: a persisted selection pointing at a site that's no longer
  // there would render a blank main panel.
  if(!state.sites.some(s=>s.id===state.selectedSiteId)) state.selectedSiteId = null;
  state.lastLoadedAt = parsed.savedAt || null;
  return true;
}

function clearPersistedState(){
  try{ localStorage.removeItem(PERSIST_KEY); }catch(e){ /* nothing to clear */ }
}

/* ---- Export / import -------------------------------------------------
   The stored data lives in one browser profile. Export gives you a portable
   copy (backup, moving machines, or handing evidence to legal), and is the
   groundwork for the audit-trail package in ROADMAP's longer-term section. */
function exportStateFile(){
  const blob = new Blob([persistSnapshot(true)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `regulatory-ledger-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importStateFile(file){
  let parsed;
  try{ parsed = JSON.parse(await file.text()); }
  catch(e){ return {ok:false, error:'That file isn’t valid JSON.'}; }
  if(!parsed || !parsed.data || !Array.isArray(parsed.data.sites)){
    return {ok:false, error:'That file doesn’t look like a Regulatory Ledger export.'};
  }
  if(parsed.version !== PERSIST_VERSION){
    return {ok:false, error:`That export is version ${parsed.version}; this build reads version ${PERSIST_VERSION}.`};
  }
  PERSIST_FIELDS.forEach(k=>{
    if(parsed.data[k] !== undefined && parsed.data[k] !== null) state[k] = parsed.data[k];
  });
  if(!state.sites.some(s=>s.id===state.selectedSiteId)) state.selectedSiteId = null;
  persistWrite();
  return {ok:true, siteCount: state.sites.length};
}

/* Rough size of what we're storing, for the Settings readout. */
function persistedSizeLabel(){
  let raw = '';
  try{ raw = localStorage.getItem(PERSIST_KEY) || ''; }catch(e){ return null; }
  if(!raw) return null;
  const kb = raw.length / 1024;
  return kb >= 1024 ? (kb/1024).toFixed(1)+' MB' : Math.max(1, Math.round(kb))+' KB';
}
