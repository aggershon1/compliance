'use strict';
/* Offline checks for the three backend roadmap features: proposal review,
   contextual recommendations, and the legislation watch.

   The one that matters most is the roadmap's own constraint on proposal
   review — that it must judge a plan against the requirement and never
   against the tool's preferred approach. That is enforced by the tool
   schema having nowhere to put a style objection, so the test asserts the
   shape of the schema rather than trusting the prompt.

   Run: node roadmap.test.js */
process.env.ALLOW_PRIVATE_HOSTS = '1';

const { reviewProposal, verifyBasis, RECORD_TOOL: PROPOSAL_TOOL } = require('./proposal.js');
const { recommend, RECORD_TOOL: RECOMMEND_TOOL } = require('./recommend.js');
const { diffLines, listWatches, check } = require('../legislation.js');
const fixture = require('./fixture/server.js');

let script = [];
let seen = [];
const stub = (input, name) => ({
  content: [{ type: 'tool_use', id: 'x', name, input }],
  stop_reason: 'tool_use',
  usage: { input_tokens: 4000, output_tokens: 500 },
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

const REQS = [{
  id: 'gdpr-c2', code: 'GDPR Art. 17',
  text: 'Users can obtain erasure of their personal data without undue delay.',
  layman: 'Users can delete their data.',
}];

const PROPOSAL = `Deletion v2 — design doc

We will add a "Close my account" control to Settings → Account. Selecting it
shows a confirmation, then queues an erasure job. The job removes the profile,
message history and therapist session notes within 30 days.

We are not building a separate privacy preference centre; deletion lives in
Account settings alongside the other account controls, consistent with our
existing information architecture.`;

let failures = 0;
function check_(label, cond, detail) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

(async () => {
  /* ---- Proposal review: the schema itself is the control -------------- */
  const props = PROPOSAL_TOOL.input_schema.properties.findings.items.properties;
  check_('the schema has a gaps-against-the-citation field', !!props.gaps_against_citation);
  check_('the schema has NO field for a preferred alternative approach',
    !Object.keys(props).some(k => /alternative|preferred|better|instead|our_approach|recommend/i.test(k)),
    Object.keys(props).join(','));
  check_('the gap field says a divergence that satisfies the article is not a gap',
    /NOT a gap/.test(props.gaps_against_citation.description));
  check_('verdicts are conditional on being built', /would_satisfy/.test(JSON.stringify(props.verdict.enum)));
  check_('it asks what evidence would exist afterwards', !!props.evidence_to_attest);

  /* ---- Proposal review: the quote gate -------------------------------- */
  let g = verifyBasis([
    { quote: 'removes the profile, message history and therapist session notes within 30 days', shows: 'scope' },
    { quote: 'we will also delete backups within 24 hours', shows: 'invented' },
  ], [PROPOSAL]);
  check_('a real passage is kept', g.kept.length === 1 && /session notes/.test(g.kept[0].quote));
  check_('an invented passage is dropped', g.dropped.length === 1 && /backups/.test(g.dropped[0].quote));

  script = [() => stub({
    findings: [{
      requirement_id: 'gdpr-c2', verdict: 'would_satisfy',
      basis: [{ quote: 'a "Close my account" control to Settings → Account', shows: 'self-serve control' }],
      gaps_against_citation: [],
      evidence_to_attest: ['A screenshot of Settings → Account showing the Close my account control.'],
      assessment: 'If built as described, the flow is self-serve and covers the full record.',
    }],
    out_of_scope: 'The 30-day job schedule is described but no requirement given covers timing.',
  }, 'record_review')];
  seen = [];
  let r = await reviewProposal({ requirements: REQS, proposalText: PROPOSAL }, { client: fakeClient });
  check_('a grounded review survives', r.ok && r.findings['gdpr-c2'].verdict === 'would_satisfy');
  check_('the house-style paragraph produced no gap', r.findings['gdpr-c2'].gaps.length === 0);
  check_('evidence to capture afterwards is returned', r.findings['gdpr-c2'].evidenceToAttest.length === 1);
  check_('what it read but could not assess is reported', /timing/.test(r.outOfScope || ''));
  check_('the prompt forbids judging against its own preference',
    /never against how you would have built it/i.test(seen[0].system));

  /* A verdict with no surviving quote must not stand. */
  script = [() => stub({
    findings: [{
      requirement_id: 'gdpr-c2', verdict: 'would_satisfy',
      basis: [{ quote: 'a one-click erasure endpoint documented in the API spec', shows: 'invented' }],
      gaps_against_citation: [], evidence_to_attest: [], assessment: 'Reads well, cites nothing real.',
    }],
  }, 'record_review')];
  r = await reviewProposal({ requirements: REQS, proposalText: PROPOSAL }, { client: fakeClient });
  check_('unsupported verdict downgraded', r.findings['gdpr-c2'].verdict === 'cannot_tell');
  check_('the downgrade is recorded', r.findings['gdpr-c2'].downgradedFrom === 'would_satisfy');

  /* Nothing submitted is refused, not guessed at. */
  r = await reviewProposal({ requirements: REQS, proposalText: '' }, { client: fakeClient });
  check_('an empty proposal is refused', r.ok === false && /Paste the proposal/.test(r.error));

  r = await reviewProposal({
    requirements: REQS, proposalText: '',
    attachments: [{ id: 'v', name: 'walkthrough.mp4', mime: 'video/mp4', size: 9e6 }],
  }, { client: fakeClient });
  check_('an unreadable attachment alone is refused, with the reason',
    r.ok === false && /cannot watch video/.test(r.error), r.error);

  /* ---- Recommendations ------------------------------------------------- */
  script = [() => stub({
    recommendations: [{
      requirement_id: 'gdpr-c2', headline: 'Add a self-serve deletion control',
      steps: ['Add "Close my account" to Settings → Account.'],
      why_this_satisfies: 'Art. 17 requires erasure without undue delay.',
      evidence_afterwards: ['Screenshot of the control.'], effort: 'medium',
    }],
  }, 'record_recommendations')];
  seen = [];
  const rec = await recommend({
    requirements: [{ ...REQS[0], status: 'Unassessed', provenance: 'nobody has assessed this yet' }],
  }, { client: fakeClient });
  check_('recommendations returned', rec.ok && rec.recommendations['gdpr-c2'].steps.length === 1);
  check_('effort is sized', rec.recommendations['gdpr-c2'].effort === 'medium');
  check_('the prompt forbids asserting facts about the product',
    /Never assert a fact about their product/i.test(seen[0].system));
  check_('provenance of the current status is sent, not just the status',
    /nobody has assessed this yet/.test(JSON.stringify(seen[0].messages)));

  const none = await recommend({ requirements: [] }, { client: fakeClient });
  check_('nothing outstanding is said plainly, not answered with filler',
    none.ok === false && /nothing to recommend/.test(none.error));

  /* ---- Legislation watch ----------------------------------------------- */
  const d = diffLines('alpha\nbeta\ngamma', 'alpha\ngamma\ndelta');
  check_('new lines are reported', d.added.join(',') === 'delta', d.added.join(','));
  check_('removed lines are reported', d.removed.join(',') === 'beta', d.removed.join(','));

  const w = listWatches();
  check_('suggested sources are offered', w.suggested.length >= 4);
  check_('every suggested source names its regions', w.suggested.every(x => x.regions && x.regions.length));

  const site = await fixture.start();
  const tmp = `/tmp/rl-watch-${process.pid}.json`;
  process.env.WATCH_STATE_FILE = tmp;
  delete require.cache[require.resolve('../legislation.js')];
  const leg = require('../legislation.js');
  try {
    const src = [{ id: 'fx', label: 'Fixture privacy page', url: `http://127.0.0.1:${fixture.PORT}/privacy`, regions: ['EU'] }];
    const first = await leg.check({ watches: src });
    check_('the first check establishes a baseline rather than claiming a change',
      first.results[0].firstCheck === true && first.results[0].changed === false);
    check_('snapshots are persisted, or it says they are not', first.persisted === true, first.persistWarning || '');

    const second = await leg.check({ watches: src });
    check_('an unchanged page reports no change', second.results[0].changed === false);

    const bad = await leg.check({ watches: [{ id: 'gone', label: 'Missing', url: `http://127.0.0.1:${fixture.PORT}/nope-not-here` }] });
    check_('an unreachable source is reported as unreachable, never as "no changes"',
      bad.results[0].ok === false && !!bad.results[0].error && bad.results[0].changed === undefined,
      bad.results[0].error);
    check_('failures are counted separately from changes', bad.failedCount === 1 && bad.changedCount === 0);
  } finally {
    site.close();
    try { require('node:fs').unlinkSync(tmp); } catch (e) {}
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
})();
