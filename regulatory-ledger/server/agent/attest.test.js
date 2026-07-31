'use strict';
/* Offline checks for the attestation interviewer. The model is a scripted
   stub, so these test our code: the decision plumbing, the follow-up
   budget, and — most importantly — the gate that refuses to let an
   attestation cite words the user never wrote.

   Run: node attest.test.js */

const { reviewAttestation, verifyBasis, MAX_FOLLOWUPS } = require('./attest.js');

let script = [];
let seen = [];
const stub = (input, name) => ({
  content: [{ type: 'tool_use', id: 'x', name, input }],
  stop_reason: 'tool_use',
  usage: { input_tokens: 900, output_tokens: 200 },
});
const fakeClient = {
  messages: {
    create: async (req) => {
      seen.push(req);
      const next = script.shift();
      if (!next) throw new Error('script exhausted');
      return next(req);
    },
  },
};

const ITEM = {
  code: 'GDPR Art. 17',
  text: 'Right to erasure — the data subject can obtain erasure of personal data without undue delay.',
  layman: 'Users can delete their data.',
  guidance: 'Typically a "Delete my account" control in settings that completes without emailing support.',
};

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

(async () => {
  /* --- The quote gate, in isolation ---------------------------------- */
  const userText = 'Users can delete their account from Settings → Privacy.\nIt completes in about 30 days.';
  let g = verifyBasis([
    { quote: 'delete their account from Settings', establishes: 'self-serve' },
    { quote: 'Users can DELETE their   account from settings', establishes: 'case and spacing differ' },
    { quote: 'deletion is instant and irreversible', establishes: 'never said' },
  ], userText);
  check('verbatim quote kept', g.kept.some(b => /Settings → Privacy|delete their account/.test(b.quote)));
  check('case and whitespace differences tolerated', g.kept.length === 2, `${g.kept.length} kept`);
  check('invented quote dropped', g.dropped.length === 1 && /instant/.test(g.dropped[0].quote));

  g = verifyBasis([{ quote: 'Users can delete their account from Settings → Privacy.', establishes: 'x' }], userText);
  check('trailing punctuation does not break the match', g.kept.length === 1);

  /* --- A follow-up decision ------------------------------------------- */
  script = [() => stub({ question: 'Does that delete the therapist session notes too?', why_it_matters: 'Art. 17 covers all personal data, not just the profile.' }, 'ask_followup')];
  seen = [];
  let r = await reviewAttestation({ item: ITEM, description: 'Users can delete their account.', turns: [] }, { client: fakeClient });
  check('follow-up returned', r.needsFollowUp === true && /session notes/.test(r.followUpQuestion));
  check('follow-up explains why it matters', /Art. 17/.test(r.whyItMatters));
  check('both tools offered while budget remains', seen[0].tools.length === 2);
  check('tool_choice forces a decision, not prose', seen[0].tool_choice.type === 'any');
  check('remaining budget reported', r.turnsRemaining === MAX_FOLLOWUPS - 1);

  /* --- A grounded attestation ------------------------------------------ */
  const desc = 'Users can delete their account from Settings → Privacy without contacting support. Session notes are removed too, on a 30 day cycle.';
  script = [() => stub({
    status: 'Pass', confidence: 'High',
    basis: [
      { quote: 'delete their account from Settings → Privacy without contacting support', establishes: 'the flow is self-serve' },
      { quote: 'Session notes are removed too', establishes: 'erasure covers the full record' },
    ],
    gaps: [],
    rationale: 'The described flow is self-serve and covers the full record, which is what Art. 17 requires.',
  }, 'record_attestation')];
  r = await reviewAttestation({ item: ITEM, description: desc, turns: [] }, { client: fakeClient });
  check('status recorded', r.status === 'Pass' && r.needsFollowUp === false);
  check('grounded when the basis checks out', r.grounded === true && r.basis.length === 2);
  check('confidence preserved when grounded', r.confidence === 'High');
  check('reviewer labelled', r.reviewer === 'model');

  /* --- An ungrounded attestation --------------------------------------- */
  script = [() => stub({
    status: 'Pass', confidence: 'High',
    basis: [{ quote: 'we have a fully automated GDPR erasure pipeline', establishes: 'compliance' }],
    gaps: [],
    rationale: 'Sounds thorough.',
  }, 'record_attestation')];
  r = await reviewAttestation({ item: ITEM, description: 'Users can delete their account.', turns: [] }, { client: fakeClient });
  check('unverifiable basis dropped', r.basis.length === 0 && r.droppedBasis.length === 1);
  check('attestation marked ungrounded', r.grounded === false);
  check('confidence forced down when ungrounded', r.confidence === 'Low');

  /* --- The follow-up budget binds -------------------------------------- */
  const turns = Array.from({ length: MAX_FOLLOWUPS }, (_, i) => ({ question: 'q' + i, answer: 'a' + i }));
  script = [() => stub({
    status: 'Partial', confidence: 'Medium', basis: [], gaps: ['scope of erasure unclear'],
    rationale: 'Still unresolved after the interview.',
  }, 'record_attestation')];
  seen = [];
  r = await reviewAttestation({ item: ITEM, description: 'Users can delete their account.', turns }, { client: fakeClient });
  check('ask_followup withdrawn past the budget', seen[0].tools.length === 1 && seen[0].tools[0].name === 'record_attestation');
  check('interview terminates with a decision', r.needsFollowUp === false && r.status === 'Partial');
  check('prior answers reach the model', /a0/.test(seen[0].messages[0].content) && /a2/.test(seen[0].messages[0].content));

  /* --- Refusing to invent a verdict ------------------------------------ */
  script = [() => ({ content: [{ type: 'text', text: 'I am not sure.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })];
  let threw = null;
  try { await reviewAttestation({ item: ITEM, description: 'x', turns: [] }, { client: fakeClient }); }
  catch (e) { threw = e.message; }
  check('no decision means nothing is recorded', /no decision/i.test(threw || ''), threw);

  /* --- The screenshot is never sent ------------------------------------ */
  script = [() => stub({ status: 'Partial', confidence: 'Low', basis: [], gaps: [], rationale: 'x' }, 'record_attestation')];
  seen = [];
  await reviewAttestation({ item: ITEM, description: 'Users can delete their account.', hasScreenshot: true, turns: [] }, { client: fakeClient });
  const sent = JSON.stringify(seen[0].messages);
  check('screenshot presence mentioned but no image sent',
    /screenshot/i.test(sent) && !/data:image/.test(sent));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
})();
