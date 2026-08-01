'use strict';
/* ============================================================
   ATTESTATION INTERVIEWER
   ============================================================
   Replaces the keyword heuristic in js/reviewer.js, which counted `pos`
   and `neg` words in whatever the user typed and called the result a
   verdict. That was the weakest part of the product, and it covered the
   half of GDPR/CCPA a crawl can never see — everything behind a login.

   ---- What it does ------------------------------------------------------
   Given a requirement and the user's description of how their product
   handles it, the model decides one of two things: ask a follow-up, or
   record an attestation. It keeps asking until it can either write a
   defensible attestation or name exactly what is still missing — the
   questions a regulator would ask. "Users can delete their account" invites
   "does that delete the therapist's session notes, or only the profile?",
   and that second question is where real attestations are won or lost.

   ---- Why this is an agent ---------------------------------------------
   The model chooses its own next step: probe further, or conclude. The
   loop runs across user turns rather than inside one call, because the
   thing it needs to query is a person. Tool availability is the control —
   past the follow-up budget, `ask_followup` is simply not offered, so
   termination does not depend on the model choosing to stop.

   ---- The honesty constraint -------------------------------------------
   Same discipline as the navigator, same reason (CHANGELOG v0.9.0). The
   model here is judging a person's account of their own product, so the
   failure mode is not inventing a website — it is asserting product facts
   the user never stated. So:

     1. Every attestation must cite `basis` quotes drawn from what the user
        actually wrote.
     2. Each quote is verified against the user's text before it leaves
        this module. Quotes that are not there are dropped and recorded.
     3. If nothing survives, the attestation is marked ungrounded and its
        confidence forced to Low. The app shows that plainly rather than
        counting a fluent paragraph as evidence.

   The tool has no access to the product. It never observes anything. It
   assesses one thing only: whether the user's own account, taken at face
   value, satisfies the citation.
   ============================================================ */

const { DEFAULT_MODEL, getClient, thinkingFor } = require('./client.js');
const { prepare, manifestText, verifyEvidence } = require('./evidence.js');

const MAX_FOLLOWUPS = 3;

const ASK_TOOL = {
  name: 'ask_followup',
  description:
    'Ask the user one more question before deciding. Use this when their account is ' +
    'plausible but leaves something material to the requirement unresolved — most often ' +
    'whether the flow is genuinely self-serve, what it actually covers, or how long it takes. ' +
    'Ask one question at a time, and only when the answer would change your verdict.',
  input_schema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The question, in plain language. One question, not a list.',
      },
      why_it_matters: {
        type: 'string',
        description:
          'One sentence tying the question to the legal requirement — what the citation ' +
          'demands that you cannot yet confirm.',
      },
    },
    required: ['question', 'why_it_matters'],
  },
};

const RECORD_TOOL = {
  name: 'record_attestation',
  description:
    'Record the attestation. Use this when you can judge whether the described ' +
    'implementation satisfies the requirement, or when you have established that it does not.',
  input_schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['Pass', 'Partial', 'Fail'],
        description:
          'Pass: the account, taken at face value, satisfies the requirement. ' +
          'Partial: it addresses the requirement but falls short of what the citation demands. ' +
          'Fail: the account describes something that does not satisfy the requirement.',
      },
      confidence: {
        type: 'string',
        enum: ['High', 'Medium', 'Low'],
        description:
          'How firmly the user\'s account supports the status — not how firmly you believe ' +
          'the product works. A detailed, specific account corroborated by a screenshot is High; ' +
          'a one-line answer that leaves the mechanism unstated is Low.',
      },
      basis: {
        type: 'array',
        description:
          'The specific things the user said that support this status. Quotes must be copied ' +
          'VERBATIM from the user\'s own words — do not paraphrase, correct, or tidy them. Each ' +
          'quote is checked against what they wrote and silently discarded if it is not there.',
        items: {
          type: 'object',
          properties: {
            quote: { type: 'string', description: 'Exact words from the user, copied character for character.' },
            establishes: { type: 'string', description: 'What this quote establishes about the requirement.' },
          },
          required: ['quote', 'establishes'],
        },
      },
      evidence_review: {
        type: 'array',
        description:
          'One entry per attached file YOU WERE ABLE TO SEE. Never include a file listed as ' +
          'unavailable to you — you have not seen it and any entry naming it will be discarded. ' +
          'Omit or leave empty if no files were attached.',
        items: {
          type: 'object',
          properties: {
            attachment: { type: 'string', description: 'The filename exactly as given to you.' },
            observed: {
              type: 'string',
              description:
                'What is visibly present in this file. Describe only what you can actually see — ' +
                'the controls in a screenshot, the wording in a document. Do not infer what the ' +
                'product does beyond what the file shows.',
            },
            bearing: {
              type: 'string',
              enum: ['supports', 'contradicts', 'inconclusive'],
              description: 'How what you saw bears on the requirement.',
            },
          },
          required: ['attachment', 'observed', 'bearing'],
        },
      },
      gaps: {
        type: 'array',
        items: { type: 'string' },
        description:
          'What the requirement demands that the account does not establish. Empty for a clean Pass. ' +
          'Each gap should be actionable — what would have to be true, or evidenced, to close it.',
      },
      rationale: {
        type: 'string',
        description:
          'Two or three sentences explaining the status against the citation. Describe what the ' +
          'requirement demands and what the user\'s account does or does not establish. Never ' +
          'assert a fact about the product that the user did not state.',
      },
    },
    required: ['status', 'confidence', 'basis', 'gaps', 'rationale'],
  },
};

function buildSystem(strictness, mode) {
  const observable = mode === 'observable';
  if (observable) {
    return `You are reviewing evidence a compliance team has recorded against one requirement that is checkable on their public website.

Someone has recorded a status for this requirement by hand and explained why, and may have attached files as evidence. Your job is to tell them whether what they have recorded holds up against the citation — you are advice, not the verdict. The status they recorded stands regardless of what you say; a person's judgment outranks yours here by design.

Strictness setting: ${strictness.label} — ${strictness.blurb} Apply this to how literally the described implementation must match what the citation requires.

Rules you must follow:
- Judge only against the legal requirement quoted to you.
- Never assert a fact about the product beyond what you were told or shown.
- Every basis quote must be copied verbatim from what the person wrote.
- Describe an attached file only if it was actually provided to you above.`;
  }
  return `You are reviewing a self-attestation for a privacy compliance tool.

A product manager is telling you how their product handles one specific legal requirement. Requirements like these live behind a login, so nothing can be observed automatically — their account is the only evidence there is.

You are not verifying that the product works. You cannot see it. You are judging one thing: **does the implementation they describe, taken at face value, satisfy the citation?** A truthful description of a non-compliant process should Fail; a description too vague to tell should prompt a follow-up, not a guess.

Interview like a regulator would. The most common gap is the difference between a right that exists and a right that is *self-serve*: "users can request deletion by emailing support" is not the same as a deletion control in account settings, and several of these citations require the latter. The second most common gap is scope: deleting a profile is not deleting the record.

Strictness setting: ${strictness.label} — ${strictness.blurb} Apply this to how literally the described implementation must match what the citation requires.

Rules you must follow:
- Judge only against the legal requirement quoted to you. There are many valid ways to satisfy an article. An approach that differs from how you would have built it is not a deficiency — raise a divergence only when it creates an actual gap against the citation, and name that gap in terms of the legal text.
- Never assert a fact about the product that the user did not tell you. You have no other source.
- Every basis quote must be copied verbatim from the user's words.
- If their account does not establish something the requirement needs, that belongs in gaps — not in an assumption that it is probably fine.
- Ask a follow-up only when the answer would change your verdict. Do not interrogate someone whose answer is already clear.
- Attached files: describe a file only if it was actually included above. Some attachments cannot be shown to you — those are named explicitly, and you have not seen them. Do not guess at their contents, and do not let their existence sway the status. A screenshot showing the control the requirement asks for is real corroboration; a file you were told you cannot see is not evidence of anything.`;
}

function buildUserTurn(item, description, turns, evidence) {
  let s = `REQUIREMENT
Citation: ${item.code}
Requirement: ${item.text}
In plain language: ${item.layman || '(none given)'}
What a satisfying implementation usually looks like: ${item.guidance || item.guide || '(none given)'}

WHAT THEY WROTE
"""
${description || '(nothing written)'}
"""`;

  if (turns && turns.length) {
    s += '\n\nFOLLOW-UPS SO FAR\n';
    turns.forEach((t, i) => {
      s += `\nQ${i + 1}: ${t.question}\nA${i + 1}: ${t.answer || '(no answer given)'}\n`;
    });
  }
  s += manifestText(evidence.inspected, evidence.reference);

  /* Files first, then the prose: the trailing text is what the model acts
     on, and it reads better with the evidence already in hand. */
  return evidence.blocks.length ? [...evidence.blocks, { type: 'text', text: s }] : s;
}

/* ---- The provenance gate -----------------------------------------------
   A quote only counts if the user actually wrote it. Matching is
   whitespace- and case-insensitive because the model reflows text, but it
   is otherwise literal: no fuzzy matching, because the whole point is that
   the evidence is the user's own words rather than something close to
   them. */
function normalize(s) {
  return String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}
function verifyBasis(basis, userText) {
  const hay = normalize(userText);
  const kept = [];
  const dropped = [];
  for (const b of basis || []) {
    const needle = normalize(b.quote).replace(/^["']|["'….]+$/g, '').trim();
    if (needle && hay.includes(needle)) kept.push(b);
    else dropped.push({ ...b, dropped_because: 'not found in what the user wrote' });
  }
  return { kept, dropped };
}

/* ---- One decision ------------------------------------------------------
   Called once per user submission. Returns either a follow-up question or
   a recorded attestation. Past the follow-up budget the ask tool is not
   offered at all, so the interview cannot run forever. */
async function reviewAttestation({ item, description, turns = [], strictness, attachments = [], mode }, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const client = opts.client || getClient();

  /* An observable requirement is assessed by a person; this reviewer is
     advice alongside that, never a replacement, so it does not interview —
     it reads what was recorded and the evidence, and reports once. */
  const observable = mode === 'observable';
  const canAsk = !observable && turns.length < MAX_FOLLOWUPS;

  const evidence = prepare(attachments);

  const req = {
    model,
    max_tokens: 2048,
    system: buildSystem(strictness || { label: 'Balanced', blurb: 'Reasonable paraphrases count.' }, mode),
    tools: canAsk ? [ASK_TOOL, RECORD_TOOL] : [RECORD_TOOL],
    tool_choice: { type: 'any' },   // it must do one or the other, not reply in prose
    messages: [{ role: 'user', content: buildUserTurn(item, description, turns, evidence) }],
  };
  const thinking = thinkingFor(model);
  if (thinking) req.thinking = thinking;

  const response = await client.messages.create(req);
  const call = response.content.find(b => b.type === 'tool_use');
  const usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };

  if (!call) {
    throw new Error('The reviewer returned no decision. Nothing was recorded.');
  }

  if (call.name === 'ask_followup') {
    return {
      ok: true,
      reviewer: 'model',
      model,
      needsFollowUp: true,
      followUpQuestion: call.input.question,
      whyItMatters: call.input.why_it_matters,
      turnsRemaining: MAX_FOLLOWUPS - turns.length - 1,
      usage,
    };
  }

  const userText = [description, ...turns.map(t => t.answer)].filter(Boolean).join('\n');
  const { kept, dropped } = verifyBasis(call.input.basis, userText);
  const ev = verifyEvidence(call.input.evidence_review, evidence.inspected);

  /* An attestation is grounded when at least one thing it rests on can be
     traced: a quote the user actually wrote, or a file the reviewer
     actually saw. A fluent paragraph resting on neither is not evidence,
     however well it reads, and must not carry a confident label. */
  const grounded = kept.length > 0 || ev.kept.length > 0;

  return {
    ok: true,
    reviewer: 'model',
    model,
    advisory: observable,
    needsFollowUp: false,
    status: call.input.status,
    confidence: grounded ? call.input.confidence : 'Low',
    rationale: call.input.rationale,
    basis: kept,
    droppedBasis: dropped,
    evidence: ev.kept,
    droppedEvidence: ev.dropped,
    /* Carried back so the UI can show what was read and what was only
       filed — the user attached both and deserves to know which is which. */
    inspected: evidence.inspected,
    reference: evidence.reference,
    gaps: call.input.gaps || [],
    grounded,
    usage,
  };
}

module.exports = { reviewAttestation, verifyBasis, MAX_FOLLOWUPS, ASK_TOOL, RECORD_TOOL, buildSystem, buildUserTurn };
