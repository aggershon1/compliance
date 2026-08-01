/* ============================================================
   EVIDENCE ATTACHMENTS (client side)
   ============================================================
   Mirrors server/agent/evidence.js. Kept deliberately in step with it:
   the server decides what actually gets read, and this file decides what
   the UI promises — those two must never disagree, or the app would offer
   to review a file that then silently isn't.

   The split that matters: images, PDFs and plain text can genuinely be
   read by the reviewer. Video, Figma files, Google Docs and Office
   documents cannot. Both are worth attaching — the second kind is real
   evidence for a human auditor reading the log later — but only the first
   kind gets reviewed, and the UI says which is which before you upload,
   not after. */

const ATT_IMAGE_TYPES = ['image/png','image/jpeg','image/gif','image/webp'];
const ATT_MAX_IMAGE = 5 * 1024 * 1024;
const ATT_MAX_PDF   = 20 * 1024 * 1024;
const ATT_MAX_ANY   = 50 * 1024 * 1024;   // refuse outright past this

/* localStorage holds a few megabytes total across the whole app. A single
   screenshot fits; a PDF does not. Anything above this keeps its contents
   for the current session only, and the UI says so rather than losing it
   silently on reload. */
const ATT_PERSIST_MAX = 300 * 1024;

function attKind(att){
  if(att.url) return 'link';
  const mime = (att.mime || '').toLowerCase();
  const name = (att.name || '').toLowerCase();
  if(ATT_IMAGE_TYPES.includes(mime)) return 'image';
  if(mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if(mime.startsWith('text/') || /\.(txt|md|csv|json|html?)$/.test(name)) return 'text';
  return 'other';
}

/* Can the reviewer actually read this? Returns null when it can, or the
   reason it can't — phrased for the person who attached it, with the
   thing they could do about it where there is one. */
function attNotReadable(att){
  const kind = attKind(att);
  if(kind === 'link'){
    return 'Links aren’t opened — Figma, Google Docs and Notion need a sign-in and draw their content with JavaScript. Export to PDF to have it read.';
  }
  if(kind === 'other'){
    const mime = (att.mime || '').toLowerCase();
    if(mime.startsWith('video/')) return 'Video can’t be watched by the reviewer. A few screenshots of the key steps can be.';
    if(mime.startsWith('audio/')) return 'Audio can’t be listened to by the reviewer.';
    if(/word|excel|powerpoint|officedocument|opendocument/.test(mime)) return 'Office documents aren’t read. Export to PDF and re-attach.';
    return `Files of type ${att.mime || 'unknown'} aren’t read by the reviewer.`;
  }
  if(kind === 'image' && att.size > ATT_MAX_IMAGE) return `Images over ${ATT_MAX_IMAGE/1048576} MB aren’t sent — this one is ${(att.size/1048576).toFixed(1)} MB.`;
  if(kind === 'pdf' && att.size > ATT_MAX_PDF) return `PDFs over ${ATT_MAX_PDF/1048576} MB aren’t sent — this one is ${(att.size/1048576).toFixed(1)} MB.`;
  if(!att.dataUrl && !att.text) return 'The contents aren’t held any more (too large to save between sessions). Re-attach it to have it read.';
  return null;
}

function attReadable(att){ return attNotReadable(att) === null; }

function attIcon(att){
  const k = attKind(att);
  return k === 'image' ? '🖼' : k === 'pdf' ? '📄' : k === 'text' ? '📃' : k === 'link' ? '🔗' : '📎';
}

function attSizeLabel(att){
  if(att.url) return 'link';
  const b = att.size || 0;
  if(b < 1024) return b + ' B';
  if(b < 1048576) return Math.round(b/1024) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}

function attListFor(site, itemId){
  const d = getDraft(site.id, itemId);
  if(!d.attachments) d.attachments = [];
  return d.attachments;
}

let attSeq = 0;
function attAddFile(site, itemId, file){
  return new Promise((resolve)=>{
    const list = attListFor(site, itemId);
    const base = {
      id: 'att' + (++attSeq) + '-' + Date.now(),
      name: file.name,
      mime: file.type || '',
      size: file.size,
      addedAt: Date.now(),
    };
    if(file.size > ATT_MAX_ANY){
      list.push({...base, tooLarge: true});
      return resolve();
    }
    /* Only read the bytes of things that can actually be used. A 40 MB
       video read into a data URL would cost memory for nothing — it is
       recorded as a reference either way. */
    if(!attReadable({...base, dataUrl: 'pending'})){
      list.push(base);
      return resolve();
    }
    const reader = new FileReader();
    reader.onload = ()=>{ list.push({...base, dataUrl: reader.result}); resolve(); };
    reader.onerror = ()=>{ list.push({...base, readError: true}); resolve(); };
    reader.readAsDataURL(file);
  });
}

function attAddLink(site, itemId, url, label){
  const list = attListFor(site, itemId);
  list.push({
    id: 'att' + (++attSeq) + '-' + Date.now(),
    name: label || url,
    url,
    addedAt: Date.now(),
  });
}

function attRemove(site, itemId, attId){
  const d = getDraft(site.id, itemId);
  d.attachments = (d.attachments || []).filter(a => a.id !== attId);
}

/* Shape the reviewer expects: base64 without the data: prefix, and only
   for files it can read. Everything else still goes, so the reviewer can
   be told what it is not being shown. */
function attPayload(site, itemId){
  return attListFor(site, itemId).map(a=>{
    const out = {id: a.id, name: a.name, mime: a.mime || '', size: a.size || 0};
    if(a.url) out.url = a.url;
    if(attReadable(a) && a.dataUrl){
      const comma = a.dataUrl.indexOf(',');
      out.data = comma === -1 ? '' : a.dataUrl.slice(comma + 1);
    }
    return out;
  });
}

function attCounts(site, itemId){
  const list = attListFor(site, itemId);
  const readable = list.filter(attReadable).length;
  return {total: list.length, readable, reference: list.length - readable};
}
