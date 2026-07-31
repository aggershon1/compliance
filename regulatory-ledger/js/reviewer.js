/* ============================================================
   CHECKLIST REVIEW
   ============================================================
   Two reviewers live here, and which one ran is recorded on every
   attestation because they are not equivalent.

   `reviewAttested()` is the entry point. It prefers the model-backed
   interviewer in the crawl service (server/agent/attest.js), which reads
   the requirement and interviews the user about their implementation the
   way a regulator would. When the service isn't running, has no API key,
   or fails, it falls back to `reviewSubmission()` below — the original
   keyword heuristic, which counts `pos`/`neg` words in the user's text.

   The fallback is a drafting aid, not a verdict, and the UI says so. The
   difference is never hidden: `reviewer: 'model' | 'keyword'` rides along
   with the result into the audit log. */

/* "Wiggle room" matching (Other request #1): don't require a pos/neg keyword
   to appear as an exact substring. A keyword phrase counts as matched if most
   of its meaningful words show up anywhere in the combined text, so a
   reworded but equivalent description (e.g. "info" instead of "personal
   information") still registers. Threshold is intentionally loose (60%) since
   this is meant to be forgiving of paraphrasing, not strict verification.
   `fuzzyPhraseMatch` is shared: crawl.js applies the same matcher, and the
   same strictness setting, to text genuinely retrieved from a site. (This
   note previously said the scanned track was pseudo-random and couldn't use
   it — true until v0.9.0 removed the fabricated scan, stale since v1.0.0.) */
const REVIEW_STOPWORDS = new Set(['the','a','an','my','your','of','to','for','and','or','is','are','via','it','this']);
function significantWords(phrase){
  return phrase.toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !REVIEW_STOPWORDS.has(w));
}
function wordStem(w){ return w.length > 5 ? w.slice(0, 5) : w; }

/* The paraphrase tolerance is set by the Settings strictness dial rather
   than hardcoded — at "Letter of the law" only the exact wording counts. */
function strictnessSetting(){
  return STRICTNESS_LEVELS[state.strictness] || STRICTNESS_LEVELS[DEFAULT_STRICTNESS];
}
function fuzzyPhraseMatch(normalizedText, phrase){
  const {threshold, exactOnly} = strictnessSetting();
  if(exactOnly) return false;
  const words = significantWords(phrase);
  if(words.length === 0) return false;
  const hits = words.filter(w => normalizedText.includes(wordStem(w))).length;
  return (hits / words.length) >= threshold;
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

/* ============================================================
   MODEL-BACKED INTERVIEWER (with the heuristic as fallback)
   ============================================================ */

/* The keyword reviewer predates the interview loop and takes a single
   follow-up string, so flatten the transcript for it. It loses the
   question/answer structure — which is part of why it is the fallback and
   not the primary. */
function keywordReview(item, description, hasScreenshot, turns){
  const answers = (turns || []).map(t => t.answer).filter(Boolean).join(' ');
  const r = reviewSubmission(item, description, hasScreenshot, answers);
  return {
    ...r,
    reviewer: 'keyword',
    basis: [],
    gaps: [],
    grounded: false,
    whyItMatters: r.needsFollowUp ? r.sketch : undefined,
  };
}

function attestBackendReady(){
  const svc = state.crawlBackend || {};
  return !!(svc.available && svc.agent && svc.agent.available);
}

/* Returns the same shape either way, so callers never branch on which
   reviewer ran — only the UI does, to label it. */
async function reviewAttested(item, description, hasScreenshot, turns){
  if(!attestBackendReady()){
    const svc = state.crawlBackend || {};
    const why = !svc.available
      ? 'the crawl service isn’t running'
      : ((svc.agent && svc.agent.reason) || 'the review agent isn’t configured');
    return {...keywordReview(item, description, hasScreenshot, turns), fallbackReason: why};
  }
  try{
    const res = await fetch(crawlBackendUrl() + '/api/attest', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        /* Only what the reviewer needs to judge against the citation. The
           screenshot itself is never sent — the model can't see it, and
           shipping a data URL over the wire for nothing would be waste. */
        item: {code: item.code, text: item.text, layman: item.layman, guidance: item.guidance},
        description,
        hasScreenshot: !!hasScreenshot,
        turns: turns || [],
        strictness: strictnessSetting(),
      }),
    });
    const body = await res.json();
    if(body && body.ok) return body;
    return {
      ...keywordReview(item, description, hasScreenshot, turns),
      fallbackReason: (body && body.error) || 'the review service returned no result',
    };
  }catch(e){
    return {...keywordReview(item, description, hasScreenshot, turns), fallbackReason: e.message};
  }
}
