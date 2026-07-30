/* ============================================================
   SIMULATED CHECKLIST REVIEW (prototype heuristic, not a live LLM call)
   ============================================================ */

/* "Wiggle room" matching (Other request #1): don't require a pos/neg keyword
   to appear as an exact substring. A keyword phrase counts as matched if most
   of its meaningful words show up anywhere in the combined text, so a
   reworded but equivalent description (e.g. "info" instead of "personal
   information") still registers. Threshold is intentionally loose (60%) since
   this is meant to be forgiving of paraphrasing, not strict verification.
   Note: this only affects the self-attested checklist reviewer below, which is
   the only place in this Phase-0 prototype that actually matches text — the
   Scanned track's statusFor() is pseudo-random, not derived from real site
   text, so the same "close-enough wording" principle can't be applied there
   until Phase 1 ships a real crawler + rule engine (see SPEC.md). */
const REVIEW_STOPWORDS = new Set(['the','a','an','my','your','of','to','for','and','or','is','are','via','it','this']);
function significantWords(phrase){
  return phrase.toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !REVIEW_STOPWORDS.has(w));
}
function wordStem(w){ return w.length > 5 ? w.slice(0, 5) : w; }
function fuzzyPhraseMatch(normalizedText, phrase){
  const words = significantWords(phrase);
  if(words.length === 0) return false;
  const hits = words.filter(w => normalizedText.includes(wordStem(w))).length;
  return (hits / words.length) >= 0.6;
}
function countMatches(text, words){
  const t = text.toLowerCase();
  return words.reduce((n,w)=> (t.includes(w) || fuzzyPhraseMatch(t, w)) ? n+1 : n, 0);
}

function reviewSubmission(item, description, hasScreenshot, followUpAnswer){
  const combined = (description || '') + ' ' + (followUpAnswer || '');
  const wordCount = (description || '').trim().split(/\s+/).filter(Boolean).length;

  let confidenceScore = 0;
  if(wordCount >= 18) confidenceScore++;
  if(hasScreenshot) confidenceScore++;
  if(followUpAnswer) confidenceScore++;

  const isFirstPass = !followUpAnswer;
  const lowInfo = wordCount < 12 && !hasScreenshot;

  if(isFirstPass && lowInfo){
    return { needsFollowUp: true, followUpQuestion: item.followUp, sketch: item.guidance };
  }

  const posMatches = countMatches(combined, item.pos);
  const negMatches = countMatches(combined, item.neg);

  let status;
  if(negMatches > 0 && negMatches >= posMatches) status = 'Fail';
  else if(posMatches >= 2) status = 'Pass';
  else status = 'Partial';

  let confidence = confidenceScore >= 2 ? 'High' : confidenceScore === 1 ? 'Medium' : 'Low';
  if(followUpAnswer) confidence = confidenceScore >= 2 ? 'High' : 'Medium';

  let rationale;
  if(status === 'Pass') rationale = 'The description matches the pattern of a working self-serve flow' + (hasScreenshot ? ', corroborated by the attached screenshot.' : '.');
  else if(status === 'Fail') rationale = 'The description points to a manual/support-mediated process rather than a self-serve one built into the product.';
  else rationale = 'The description is plausible but doesn’t clearly confirm all the criteria for this requirement' + (hasScreenshot ? ' — the screenshot helps but isn’t fully conclusive.' : '.');

  return { needsFollowUp: false, status, confidence, rationale };
}
