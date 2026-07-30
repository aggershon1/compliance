/* ============================================================
   SOURCE AUDIT ENGINE (Track 3 — real analysis, NOT simulated)
   ============================================================
   Unlike the URL-scan track (seeded pseudo-random) and the checklist
   reviewer (keyword heuristic on typed descriptions), everything in this
   file operates on the user's actual uploaded files, entirely in the
   browser — nothing is sent anywhere. Rules live in data.js
   (CODE_AUDIT_RULES); this file is pure mechanism. */

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
