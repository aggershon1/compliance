'use strict';
/* ============================================================
   EVIDENCE ATTACHMENTS — what can actually be inspected
   ============================================================
   Users want to attach whatever they have: a screenshot of the deletion
   flow, an exported DPIA, a Figma prototype, a Loom walkthrough, a link to
   a Google Doc. The request is reasonable. Treating them all the same is
   not, because the reviewer can genuinely read some of them and cannot read
   the others at all.

   Reporting a "review" of a file nobody read would be the v0.9.0 failure
   with a new coat of paint — a confident finding about a real compliance
   posture, derived from nothing. So attachments are split in two, and the
   split is visible everywhere the evidence appears:

     INSPECTED       images, PDFs and plain text. Sent to the model as
                     real content blocks and actually examined.
     REFERENCE ONLY  video, Figma, Google Docs, Office files, anything
                     auth-gated. Recorded, listed, carried into the audit
                     log for a human to open — and never described.

   The model is told which files it can see and which it cannot, and any
   observation it makes about a file outside the inspected manifest is
   dropped before it leaves this module. Same pattern as the fetch log in
   navigator.js and the quote gate in attest.js: claims are checked against
   a record of what actually happened, not trusted.
   ============================================================ */

/* API-side limits. Images are resized down by the API but oversized
   payloads are rejected outright, so cap before sending rather than
   discovering it as a 400. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;
const MAX_INSPECTED = 6;          // per review, to bound cost

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/* Kinds the UI assigns. Anything unrecognised is reference-only, which is
   the safe default: a new file type is not silently assumed readable. */
function classify(att) {
  const mime = String(att.mime || '').toLowerCase();
  const name = String(att.name || '').toLowerCase();

  if (att.url) return 'link';
  if (IMAGE_TYPES.has(mime)) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('text/') || /\.(txt|md|csv|json|html?)$/.test(name)) return 'text';
  return 'other';
}

function whyNotInspected(att, kind) {
  if (kind === 'link') {
    return att.fetchedText
      ? null
      : 'a link — the page could not be read (most Figma, Google Docs and Notion links require sign-in, and render their content with JavaScript)';
  }
  if (kind === 'other') {
    const mime = String(att.mime || '').toLowerCase();
    if (mime.startsWith('video/')) return 'video — the reviewer cannot watch video';
    if (mime.startsWith('audio/')) return 'audio — the reviewer cannot listen to audio';
    if (/word|excel|powerpoint|officedocument|opendocument/.test(mime)) {
      return 'an Office document — export it to PDF and re-attach to have it read';
    }
    return `type ${att.mime || 'unknown'} cannot be read by the reviewer`;
  }
  if (kind === 'image' && (att.size || 0) > MAX_IMAGE_BYTES) {
    return `image is ${(att.size / 1048576).toFixed(1)} MB, over the ${MAX_IMAGE_BYTES / 1048576} MB limit`;
  }
  if (kind === 'pdf' && (att.size || 0) > MAX_PDF_BYTES) {
    return `PDF is ${(att.size / 1048576).toFixed(1)} MB, over the ${MAX_PDF_BYTES / 1048576} MB limit`;
  }
  if (!att.data && !att.text && !att.fetchedText) {
    return 'the file contents were not sent (too large to keep in browser storage — re-attach it in this session to have it read)';
  }
  return null;
}

/* Splits the attachments into what will actually be sent and what will
   only be recorded, and returns the content blocks for the former.

   `data` is base64 with no data: prefix. The client strips it. */
function prepare(attachments) {
  const inspected = [];
  const reference = [];
  const blocks = [];

  for (const att of attachments || []) {
    const kind = classify(att);
    const reason = whyNotInspected(att, kind);

    if (reason) {
      reference.push({ id: att.id, name: att.name, kind, reason });
      continue;
    }
    if (inspected.length >= MAX_INSPECTED) {
      reference.push({
        id: att.id, name: att.name, kind,
        reason: `only the first ${MAX_INSPECTED} readable files are reviewed per requirement`,
      });
      continue;
    }

    if (kind === 'image') {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: att.mime, data: att.data },
      });
      inspected.push({ id: att.id, name: att.name, kind });
    } else if (kind === 'pdf') {
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: att.data },
        title: att.name,
      });
      inspected.push({ id: att.id, name: att.name, kind });
    } else {
      const text = String(att.text || att.fetchedText || '').slice(0, MAX_TEXT_CHARS);
      blocks.push({ type: 'text', text: `--- contents of ${att.name} ---\n${text}\n--- end of ${att.name} ---` });
      inspected.push({ id: att.id, name: att.name, kind: kind === 'link' ? 'link' : 'text' });
    }

    /* Label every block so the model can name the file it is describing,
       and so the gate below has something to match against. */
    blocks.push({ type: 'text', text: `(the file above is "${att.name}")` });
  }

  return { blocks, inspected, reference };
}

/* What the model is told about the attachments. Being explicit about the
   files it CANNOT see matters more than the ones it can — an unmentioned
   filename in the transcript is an invitation to speculate about it. */
function manifestText(inspected, reference) {
  if (!inspected.length && !reference.length) return '';
  let s = '\n\nATTACHED EVIDENCE\n';
  if (inspected.length) {
    s += `You can see these ${inspected.length} file(s), included above: ${inspected.map(a => `"${a.name}"`).join(', ')}.\n`;
  }
  if (reference.length) {
    s += `\nThese file(s) were attached but are NOT available to you: ${reference.map(a => `"${a.name}" (${a.reason})`).join('; ')}.\n` +
         `You have not seen them. Do not describe them, do not guess what they contain, and do not treat them as evidence for or against anything. ` +
         `If one of them would have settled the question, say so as a gap.\n`;
  }
  return s;
}

/* The gate. An observation about a file that was never sent is dropped —
   whether the model invented the filename or drifted onto one from the
   reference list it was told it could not see. */
function verifyEvidence(evidenceReview, inspected) {
  const byName = new Map(inspected.map(a => [String(a.name).toLowerCase().trim(), a]));
  const kept = [];
  const dropped = [];
  for (const e of evidenceReview || []) {
    const hit = byName.get(String(e.attachment || '').toLowerCase().trim());
    if (hit) kept.push({ ...e, attachmentId: hit.id, kind: hit.kind });
    else dropped.push({ ...e, dropped_because: 'refers to a file that was not sent to the reviewer' });
  }
  return { kept, dropped };
}

module.exports = {
  classify, prepare, manifestText, verifyEvidence,
  MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_INSPECTED,
};
