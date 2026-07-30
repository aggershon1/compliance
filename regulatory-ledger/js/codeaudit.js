/* ============================================================
   SOURCE AUDIT ENGINE — RETIRED INGESTION PATH (v0.8.0)
   ============================================================
   The browser folder-upload entry path was retired: shipping a company's
   source into a web tool doesn't survive most security reviews, even
   though the analysis never left the machine. See ROADMAP.md.

   THIS FILE IS NOT LOADED by regulatory-ledger.html. It is kept in-tree
   because the *analysis* was never the problem — only the ingestion
   gesture was. A future GitHub App or local CLI path would reuse the
   rules and matching logic below largely as-is.

   Entries audited before the retirement remain viewable as historical
   records; their stored evidence renders from the saved site object and
   does not depend on anything in this file.
   ============================================================ */

/* ============================================================
   SOURCE AUDIT RULES (Track 3 — real analysis, NOT simulated)
   ============================================================
   Pattern rules the source-audit engine (codeaudit.js) runs against an
   uploaded codebase. Unlike everything else in this prototype, matches here
   come from the user's actual files — see README "what's real vs simulated."

   Per rule:
   - strong / weak: case-insensitive regex strings. Any strong match → Pass
     (unless capped); weak-only matches → Partial; evidence lines recorded
     either way, with real file + line + snippet.
   - cap: highest status a match can earn, for requirements where presence
     is detectable but sufficiency isn't (e.g. a privacy policy existing
     says nothing about whether it's complete or plain-language).
   - absent (scanned items only): status when nothing matches.
       'Fail'    — this is app code an implementing repo would contain, so
                   silence is meaningful (still overridable, as everywhere).
       'Pending' — the content usually lives outside an app repo (policy
                   copy, runbooks, org process docs), so absence here proves
                   nothing; zero credit until overridden, honestly labeled.
       'NA'      — conditional requirement with no trigger found in code.
     Checklist items have no 'absent': no evidence simply leaves them
     unattested, so the normal self-attestation flow (and grade gating)
     takes over.
   - note: shown when the rule couldn't decide, explaining why + what to do. */
const CODE_AUDIT_RULES = {
  'gdpr-s1': {
    strong:['lawful\\s+basis','legal\\s+basis\\s+for\\s+processing'],
    weak:['legitimate\\s+interest','\\barticle\\s*6\\b'],
    absent:'Pending', cap:'Partial',
    note:'Privacy-policy copy often lives outside an application repo. Presence of lawful-basis language is detectable, but whether every processing purpose is mapped to a basis is a legal judgment — confirm and override with your actual status.'},
  'gdpr-s2': {
    strong:['onetrust','cookiebot','didomi','usercentrics','cookieyes','\\bklaro\\b','cookie[-_ ]?consent','consent[-_ ]?manager','consent\\s*mode'],
    weak:['reject\\s+all','accept\\s+all\\s+cookies',"gtag\\(\\s*['\"]consent"],
    absent:'Fail',
    note:'No consent-management code found in this repo. If consent is handled by an external tag manager or a separate marketing-site repo, override with evidence.'},
  'gdpr-s3': {
    strong:['privacy[-_ ]?policy','privacy[-_ ]?notice'],
    weak:['how\\s+we\\s+use\\s+your\\s+(data|information)'],
    absent:'Pending', cap:'Partial',
    note:'A privacy policy’s presence is detectable in source; whether it covers every processing purpose in plain language is not — review the actual policy text and override.'},
  'gdpr-s4': {
    strong:['dpo@','data\\s+protection\\s+officer'],
    weak:['privacy@'],
    absent:'Pending',
    note:'No DPO designation found in source. DPO contact info often lives in the published policy rather than code — confirm whether one is designated and override.'},
  'gdpr-s5': {
    strong:['standard\\s+contractual\\s+clauses','\\bsccs?\\b'],
    weak:['adequacy\\s+decision','international\\s+(data\\s+)?transfers?','chapter\\s+v\\b'],
    absent:'Pending',
    note:'Transfer-safeguard disclosures usually live in policy copy or DPAs, not application code — absence here proves nothing either way.'},
  'gdpr-s6': {
    strong:['records?\\s+of\\s+processing','\\bropa\\b'],
    weak:['\\barticle\\s*30\\b','processing\\s+register'],
    absent:'Pending',
    note:'Records of processing are an organizational document, not code — check your internal register and override with the actual status.'},
  'gdpr-s7': {
    strong:['breach\\s+notification','incident[-_ ]?response'],
    weak:['72\\s*hours?','security\\s+incident'],
    absent:'Pending',
    note:'Breach-notification procedures are runbooks/process docs that may not live in this repo — confirm with your security team and override.'},
  'gdpr-a1': {
    strong:['download\\s+(my|your)\\s+data','data[-_ ]?export','export[-_ ]?(user|my|account)[-_ ]?data','subject\\s+access\\s+request'],
    weak:['gdpr[-_ ]?export','\\bsar\\b']},
  'gdpr-a2': {
    strong:['delete[-_ ]?account','account[-_ ]?deletion','right\\s+to\\s+erasure','delete[-_ ]?user','destroy[-_ ]?user'],
    weak:['erasure[-_ ]?request','forget[-_ ]?me','anonymi[sz]e[-_ ]?(user|account)']},
  'gdpr-a3': {
    strong:['data\\s+portability','export.{0,40}\\.(csv|json)\\b','(csv|json)[-_ ]?export'],
    weak:['machine[- ]?readable','\\btakeout\\b']},
  'gdpr-a4': {
    strong:['preference[-_ ]?cent(er|re)','consent[-_ ]?preferences?','marketing[-_ ]?(consent|opt[-_ ]?in)'],
    weak:['notification[-_ ]?preferences?','opt[-_ ]?out.{0,30}(marketing|analytics|tracking)']},
  'ccpa-s1': {
    strong:['do\\s+not\\s+sell','donotsell','global\\s*privacy\\s*control','sec-gpc'],
    weak:['ccpa[-_ ]?opt[-_ ]?out','your\\s+privacy\\s+choices'],
    absent:'Pending',
    note:'No "Do Not Sell or Share" handling found in this repo. If the link lives on a separately-deployed marketing site, override with evidence from there.'},
  'ccpa-s2': {
    strong:['notice\\s+at\\s+collection'],
    weak:['categories\\s+of\\s+personal\\s+information'],
    absent:'Pending',
    note:'Notice-at-collection copy usually lives with the forms or policy content, which may be outside this repo.'},
  'ccpa-s3': {
    strong:['non[- ]?discriminat'],
    weak:['1798\\.125'],
    absent:'Pending',
    note:'Non-discrimination commitments are policy language, not code — check the published policy and override.'},
  'ccpa-s4': {
    strong:['limit\\s+the\\s+use\\s+of\\s+my\\s+sensitive','sensitive\\s+personal\\s+information'],
    weak:['1798\\.121'],
    absent:'Pending',
    note:'No sensitive-PI limit-use handling found in this repo — if it exists on a separate surface, override with evidence.'},
  'ccpa-s5': {
    strong:['financial\\s+incentive'],
    weak:['loyalty\\s+program','rewards\\s+program','referral\\s+(bonus|credit|program)'],
    absent:'NA',
    note:'No financial-incentive or loyalty-program code detected, so this conditional requirement appears not to apply. A weak-only match means incentive-program code exists without a matching disclosure — worth a close look.'},
  'ccpa-a1': {
    strong:['right\\s+to\\s+know','data[-_ ]?export','download\\s+(my|your)\\s+data','what\\s+we\\s+know\\s+about\\s+you'],
    weak:['categories\\s+of\\s+(data|personal\\s+information).{0,40}collected']},
  'ccpa-a2': {
    strong:['delete[-_ ]?account','account[-_ ]?deletion','right\\s+to\\s+delete','delete[-_ ]?user','destroy[-_ ]?user'],
    weak:['deletion[-_ ]?request']},
  'ccpa-a3': {
    strong:['right\\s+to\\s+correct','edit[-_ ]?profile','update[-_ ]?profile','correction[-_ ]?request'],
    weak:['profile[-_ ]?settings']},
  'ccpa-a4': {
    strong:['limit[-_ ]?(the[-_ ]?)?use.{0,30}sensitive','sensitive[-_ ]?(pi|data|info(rmation)?)[-_ ]?(toggle|setting|limit)'],
    weak:['sensitive\\s+personal\\s+information']},
};

/* File filtering for the source-audit engine — which uploaded paths are
   worth reading. Everything else is skipped and counted, not analyzed. */
const CODE_AUDIT_SKIP_DIRS = ['node_modules','.git','dist','build','out','vendor','coverage','.next','.nuxt','target','__pycache__','venv','.venv','bower_components','tmp','log','logs'];
const CODE_AUDIT_EXTENSIONS = ['js','jsx','ts','tsx','vue','svelte','rb','erb','haml','py','php','java','kt','kts','go','cs','swift','scala','html','htm','twig','ejs','hbs','handlebars','liquid','md','mdx','txt','json','yml','yaml','xml','graphql','sql','tf','env','ini','toml','properties','config'];
const CODE_AUDIT_SKIP_FILES = ['package-lock.json','yarn.lock','pnpm-lock.yaml','gemfile.lock','composer.lock','poetry.lock','cargo.lock'];
const CODE_AUDIT_MAX_FILE_BYTES = 1500000;
const CODE_AUDIT_MAX_FILES = 6000;
const CODE_AUDIT_MAX_EVIDENCE_PER_RULE = 5;

function codeAuditPathParts(file){
  const rel = file.webkitRelativePath || file.name;
  return rel.split('/').filter(Boolean);
}

function codeAuditShouldRead(file){
  const parts = codeAuditPathParts(file);
  const name = parts[parts.length-1].toLowerCase();
  if(parts.some(p => CODE_AUDIT_SKIP_DIRS.includes(p.toLowerCase()))) return false;
  if(CODE_AUDIT_SKIP_FILES.includes(name)) return false;
  if(name.endsWith('.min.js') || name.endsWith('.min.css')) return false;
  if(file.size > CODE_AUDIT_MAX_FILE_BYTES || file.size === 0) return false;
  const dot = name.lastIndexOf('.');
  if(dot === -1) return false;
  return CODE_AUDIT_EXTENSIONS.includes(name.slice(dot+1));
}

function codeAuditCompileRules(){
  const compiled = {};
  Object.entries(CODE_AUDIT_RULES).forEach(([id, rule])=>{
    compiled[id] = {
      rule,
      strong: (rule.strong||[]).map(s=>new RegExp(s,'i')),
      weak: (rule.weak||[]).map(s=>new RegExp(s,'i')),
      hits: [],           // {file, line, snippet, weight}
      strongFiles: new Set(),
      weakFiles: new Set(),
    };
  });
  return compiled;
}

function codeAuditLineOf(text, index){
  let line = 1;
  for(let i=0;i<index;i++) if(text.charCodeAt(i)===10) line++;
  return line;
}
function codeAuditSnippetAt(text, index){
  const start = text.lastIndexOf('\n', index)+1;
  let end = text.indexOf('\n', index);
  if(end===-1) end = text.length;
  let s = text.slice(start, end).trim();
  if(s.length>160) s = s.slice(0,157)+'…';
  return s;
}

function codeAuditMatchFile(compiled, relPath, text){
  Object.values(compiled).forEach(c=>{
    const scanSet = (regexes, weight, fileSet)=>{
      for(const re of regexes){
        const m = re.exec(text);
        if(m){
          fileSet.add(relPath);
          if(c.hits.length < CODE_AUDIT_MAX_EVIDENCE_PER_RULE){
            c.hits.push({file:relPath, line:codeAuditLineOf(text,m.index), snippet:codeAuditSnippetAt(text,m.index), weight});
          }
        }
      }
    };
    scanSet(c.strong, 'strong', c.strongFiles);
    scanSet(c.weak, 'weak', c.weakFiles);
  });
}

function codeAuditConfidence(c){
  const strongCount = c.strongFiles.size;
  if(strongCount >= 2 || (strongCount >= 1 && c.weakFiles.size >= 1)) return 'High';
  if(strongCount === 1) return 'Medium';
  if(c.weakFiles.size >= 2) return 'Medium';
  return 'Low';
}

function codeAuditVerdict(c){
  const {rule} = c;
  const hasStrong = c.strongFiles.size > 0;
  const hasWeak = c.weakFiles.size > 0;
  if(hasStrong || hasWeak){
    let status = hasStrong ? 'Pass' : 'Partial';
    if(rule.cap === 'Partial' && status === 'Pass') status = 'Partial';
    const files = [...new Set(c.hits.map(h=>h.file))];
    const fileList = files.slice(0,3).join(', ') + (files.length>3?` (+${files.length-3} more)`:'');
    let rationale;
    if(hasStrong && status==='Pass'){
      rationale = `Matched implementation evidence in your source: ${fileList}.`;
    } else if(hasStrong && rule.cap==='Partial'){
      rationale = `Found supporting evidence in ${fileList}, but this requirement can't be fully verified from source alone. ${rule.note||''}`.trim();
    } else {
      rationale = `Found only weak/indirect signals in ${fileList} — related code exists but doesn't clearly satisfy the requirement.`;
    }
    return {found:true, status, confidence:codeAuditConfidence(c), rationale, evidence:c.hits};
  }
  return {found:false, status: rule.absent || null, confidence:null, rationale: rule.note || 'No matching evidence found in the uploaded source.', evidence:[]};
}

/* Main entry point. `files` is the FileList/array from a webkitdirectory
   input. `onProgress(read, total)` is called periodically so the UI can
   show real progress. Returns per-requirement results plus file stats. */
async function analyzeCodebase(files, onProgress){
  const all = Array.from(files);
  const readable = all.filter(codeAuditShouldRead).slice(0, CODE_AUDIT_MAX_FILES);
  const compiled = codeAuditCompileRules();

  let read = 0;
  for(const file of readable){
    try{
      const text = await file.text();
      const rel = file.webkitRelativePath || file.name;
      codeAuditMatchFile(compiled, rel, text);
    }catch(e){ /* unreadable file: counted as read, contributes no evidence */ }
    read++;
    if(onProgress && (read % 50 === 0 || read === readable.length)) onProgress(read, readable.length);
  }

  const results = {};
  Object.entries(compiled).forEach(([id, c])=>{ results[id] = codeAuditVerdict(c); });

  return {
    results,
    totalFiles: all.length,
    analyzedFiles: readable.length,
    skippedFiles: all.length - readable.length,
    analyzedAt: Date.now(),
  };
}

/* Root folder name of an uploaded directory, used as the docket label. */
function codeAuditRootName(files){
  for(const f of files){
    const parts = codeAuditPathParts(f);
    if(parts.length > 1) return parts[0];
  }
  return 'uploaded-codebase';
}
