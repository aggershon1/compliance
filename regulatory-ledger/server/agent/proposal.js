'use strict';
/* ============================================================
   PROPOSAL REVIEW — "does this plan satisfy the requirement?"
   ============================================================
   ROADMAP item 2, the you-to-tool direction. Paste or upload a spec, PRD
   or design doc describing how you intend to close an open finding, and
   get it measured against the citation *before* the work is built, when
   changing it is still cheap.

   ---- The constraint this was specified around -------------------------
   The roadmap is unusually firm about one thing, and it is the reason this
   module is shaped the way it is:

     "Proposal review must evaluate a plan against the requirement, not
      against the tool's own suggestion. There are many valid ways to
      satisfy a given article, and a house style that diverges from the
      recommended pattern is not a deficiency... It must never answer
      'this isn't how we'd do it'."

   That is not a prompt instruction, or not only one. It is enforced the
   same way everything else here is: **there is no field for it.** The
   tool schema has `gaps_against_citation` and nothing else. A reviewer
   that wants to say "I'd have used a preference centre instead" has
   nowhere to put it, and a divergence that creates no gap against the
   legal text therefore cannot be reported as a problem.

   The one field that could smuggle it in — `assessment` — is prose, so
   the prompt guards it and the UI presents gaps separately. Prompting is
   the weaker control; it is the fallback here, not the mechanism.

   ---- What it is judging ------------------------------------------------
   A plan, which is a claim about the future. It cannot be verified — only
   read. So the verdict is always "if built as described", never "this
   works", and every claim about the plan quotes the plan. Quotes are
   checked verbatim before they leave this module, exactly as in
   analyst.js and attest.js.

   The third output is the one that makes this worth building: what
   evidence would need to exist afterwards to attest the requirement. That
   turns a review into a chain — plan, review, evidence — which is what an
   auditor actually wants to see.
   ============================================================ */

const { DEFAULT_MODEL, getClient, thinkingFor } = require('./client.js');
const { prepare, manifestText, verifyEvidence } = require('./evidence.js');

const MAX_PROPOSAL_CHARS = 60_000;

const RECORD_TOOL = {
  name: 'record_review',
  description:
    'Record the review of this proposal. One finding per requirement you were asked about.',
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            requirement_id: { type: 'string', description: 'The id exactly as given.' },
            verdict: {
              type: 'string',
              enum: ['would_satisfy', 'would_fall_short', 'does_not_address', 'cannot_tell'],
              description:
                'would_satisfy: if built as described, this meets the citation. ' +
                'would_fall_short: it addresses the requirement but not to the standard the citation sets. ' +
                'does_not_address: the proposal does not speak to this requirement. ' +
                'cannot_tell: the proposal is too vague at the points that matter.',
            },
            basis: {
              type: 'array',
              description:
                'Passages of the proposal you relied on, copied VERBATIM. Each is checked ' +
                'character for character against the document and discarded if it is not there.',
              items: {
                type: 'object',
                properties: {
                  quote: { type: 'string', description: 'Exact words from the proposal.' },
                  shows: { type: 'string', description: 'What this passage establishes.' },
                },
                required: ['quote', 'shows'],
              },
            },
            gaps_against_citation: {
              type: 'array',
              items: { type: 'string' },
              description:
                'What the CITATION demands that the proposal does not deliver. Each gap must be ' +
                'traceable to the legal text, not to your preferences. If the plan takes an ' +
                'approach you would not have chosen but which satisfies the article, that is ' +
                'NOT a gap and must not appear here.',
            },
            evidence_to_attest: {
              type: 'array',
              items: { type: 'string' },
              description:
                'What would need to exist once this is built for someone to attest the ' +
                'requirement — a screenshot of a specific control, a page carrying specific ' +
                'wording, a log. Be concrete enough to act on.',
            },
            assessment: {
              type: 'string',
              description:
                'Two or three sentences measuring the plan against the citation. Describe what ' +
                'the proposal says it will do and whether that meets the article. Never comment ' +
                'on whether it is how you would have done it.',
            },
          },
          required: ['requirement_id', 'verdict', 'basis', 'gaps_against_citation', 'evidence_to_attest', 'assessment'],
        },
      },
      out_of_scope: {
        type: 'string',
        description:
          'Optional. Anything substantial in the proposal that no requirement you were given ' +
          'covers — so the author knows it was read but not assessed, rather than assuming silence means approval.',
      },
    },
    required: ['findings'],
  },
};

function buildSystem(strictness) {
  return `You are reviewing a proposal — a spec, PRD or design document — describing how a team intends to satisfy specific privacy requirements. The work has not been built yet.

You are judging a plan, which is a claim about the future. You cannot verify it; you can only read it. Every verdict is therefore conditional: "if built as described". Never write as though the thing exists.

Strictness setting: ${strictness.label} — ${strictness.blurb} Apply this to how closely the described implementation must track what the citation requires.

**The rule that matters most here:** judge the proposal against the requirement, never against how you would have built it. There are many valid ways to satisfy a given article. A team may have good reasons — existing architecture, an established design system, prior legal advice — for an approach you would not have chosen. That is not a deficiency and must not be reported as one.

Only raise a divergence when it creates an actual gap against the legal text, and name that gap in terms of the text. "This uses a settings toggle rather than a preference centre" is not a finding. "Article 7(3) requires withdrawal to be as easy as giving consent, and the proposal describes a three-step support flow for withdrawal against a one-click opt-in" is.

How to work:
- Quote before you conclude. A claim about what the proposal says must point at where it says it.
- Read for substance. A plan that achieves what the article requires satisfies it whether or not it uses the statute's vocabulary.
- Be specific about gaps. "Needs more detail on retention" is not actionable; "the citation requires a stated retention period per category and the proposal gives one blanket period" is.
- Say what evidence would exist afterwards. The point of reviewing a plan early is knowing what to capture when it ships.
- If the proposal is too vague at the points that decide the answer, say cannot_tell rather than guessing in either direction.`;
}

function buildUserTurn(requirements, proposalText, context, evidence) {
  let s = 'REQUIREMENTS TO REVIEW THE PROPOSAL AGAINST\n';
  for (const r of requirements) {
    s += `\n--- requirement_id: ${r.id}\nCitation: ${r.code}\nRequirement: ${r.text}\n`;
    if (r.layman) s += `In plain language: ${r.layman}\n`;
    if (r.currentStatus) s += `Current status in this product: ${r.currentStatus}\n`;
    if (r.currentBasis) s += `Why it currently stands that way: ${r.currentBasis}\n`;
  }

  if (context && context.countries) {
    s += `\nJurisdictions in scope: ${context.countries}\n`;
  }

  s += `\n\nTHE PROPOSAL\n"""\n${String(proposalText || '(nothing written — see the attached files)').slice(0, MAX_PROPOSAL_CHARS)}\n"""`;
  s += manifestText(evidence.inspected, evidence.reference);
  s += `\n\nRecord one finding for each of the ${requirements.length} requirement_id(s) above.`;

  return evidence.blocks.length ? [...evidence.blocks, { type: 'text', text: s }] : s;
}

/* ---- The gate ----------------------------------------------------------
   A quote counts only if it is genuinely in the proposal. Attached files
   are searched too, since a spec is often the PDF rather than the pasted
   text. Whitespace and quote marks are normalised because models reflow;
   nothing else is. */
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
function verifyBasis(basis, haystacks) {
  const hay = haystacks.map(normalize).join(' \n ');
  const kept = [];
  const dropped = [];
  for (const b of basis || []) {
    const needle = normalize(b.quote).replace(/^["']|["'.…]+$/g, '').trim();
    if (needle && hay.includes(needle)) kept.push(b);
    else dropped.push({ ...b, dropped_because: 'not found in the proposal as submitted' });
  }
  return { kept, dropped };
}

async function reviewProposal({ requirements, proposalText, attachments = [], context, strictness }, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const client = opts.client || getClient();

  if (!requirements || !requirements.length) {
    return { ok: false, error: 'No requirement was selected to review the proposal against.' };
  }
  const evidence = prepare(attachments);
  const hasText = proposalText && proposalText.trim().length > 40;
  if (!hasText && !evidence.inspected.length) {
    return {
      ok: false,
      error: evidence.reference.length
        ? `Nothing readable was submitted. ${evidence.reference.map(r => `${r.name}: ${r.reason}`).join('; ')}`
        : 'Paste the proposal, or attach it as a PDF, image or text file.',
    };
  }

  const req = {
    model,
    max_tokens: 8192,
    system: buildSystem(strictness || { label: 'Balanced', blurb: 'Reasonable paraphrases count.' }),
    tools: [RECORD_TOOL],
    tool_choice: { type: 'tool', name: 'record_review' },
    messages: [{ role: 'user', content: buildUserTurn(requirements, proposalText, context, evidence) }],
  };
  const thinking = thinkingFor(model);
  if (thinking) req.thinking = thinking;

  const response = await client.messages.create(req);
  const call = response.content.find(b => b.type === 'tool_use');
  if (!call) throw new Error('The reviewer returned no findings. Nothing was recorded.');

  /* The proposal text plus any text-bearing attachment: a quote from an
     uploaded spec is as legitimate as one from the pasted box. */
  const haystacks = [proposalText || ''];
  for (const a of attachments || []) {
    if (a.text) haystacks.push(a.text);
  }

  const wanted = new Set(requirements.map(r => r.id));
  const findings = {};
  for (const f of call.input.findings || []) {
    if (!wanted.has(f.requirement_id)) continue;
    const { kept, dropped } = verifyBasis(f.basis, haystacks);

    /* A verdict about the plan that cannot point at the plan is not a
       verdict. The exception is does_not_address — you cannot quote an
       absence, and the proposal is in hand so the claim is checkable. */
    let verdict = f.verdict;
    let downgraded = null;
    const needsQuote = verdict === 'would_satisfy' || verdict === 'would_fall_short';
    if (needsQuote && kept.length === 0 && !evidence.inspected.length) {
      downgraded = verdict;
      verdict = 'cannot_tell';
    }

    findings[f.requirement_id] = {
      verdict,
      downgradedFrom: downgraded,
      basis: kept,
      droppedBasis: dropped,
      gaps: f.gaps_against_citation || [],
      evidenceToAttest: f.evidence_to_attest || [],
      assessment: f.assessment || '',
    };
  }

  return {
    ok: true,
    reviewer: 'model',
    model,
    findings,
    missing: [...wanted].filter(id => !findings[id]),
    outOfScope: call.input.out_of_scope || null,
    inspected: evidence.inspected,
    reference: evidence.reference,
    reviewedAt: Date.now(),
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

module.exports = { reviewProposal, verifyBasis, RECORD_TOOL, buildSystem, buildUserTurn };
