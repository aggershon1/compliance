/* ============================================================
   SIMULATED CHECKLIST REVIEW (prototype heuristic, not a live LLM call)
   ============================================================ */
function countMatches(text, words){
  const t = text.toLowerCase();
  return words.reduce((n,w)=> t.includes(w) ? n+1 : n, 0);
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
  else rationale = 'The description is plausible but doesn\u2019t clearly confirm all the criteria for this requirement' + (hasScreenshot ? ' \u2014 the screenshot helps but isn\u2019t fully conclusive.' : '.');

  return { needsFollowUp: false, status, confidence, rationale };
}
