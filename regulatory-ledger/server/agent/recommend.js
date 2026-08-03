'use strict';
/* ============================================================
   CONTEXTUAL RECOMMENDATIONS — the tool-to-you direction
   ============================================================
   ROADMAP item 2, the other half. The Recommendations tab currently shows
   text hardcoded per requirement in data.js: correct, generic, and the
   same whether you have no privacy policy at all or one that misses a
   single retention period. This makes it specific to what was actually
   found.

   ---- What keeps this honest --------------------------------------------
   Advice is the easiest place in this app to slip, because a suggestion
   doesn't feel like a claim. But "add a retention period to your policy"
   quietly asserts that your policy lacks one — and if that came from a
   failed fetch rather than a read, it is a fabricated finding wearing a
   helpful voice.

   So the model is given the finding as evidence, marked with where it came
   from, and instructed to write conditionally about anything not actually
   established. The status quo it is told about is passed in; it has no
   tool with which to look at the product, and no field in which to report
   an observation. Every output is a *step to take*, not a fact about the
   site.

   Generic advice remains the fallback. Without an API key the tab shows
   exactly what it showed before, labelled as the static text it is.
   ============================================================ */

const { DEFAULT_MODEL, getClient, thinkingFor } = require('./client.js');

const RECORD_TOOL = {
  name: 'record_recommendations',
  description: 'Record recommendations for each requirement you were given.',
  input_schema: {
    type: 'object',
    properties: {
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            requirement_id: { type: 'string', description: 'The id exactly as given.' },
            headline: {
              type: 'string',
              description: 'One line: the single most useful thing to do next for this requirement.',
            },
            steps: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Concrete steps, in the order you would do them. Each should be something a person ' +
                'can act on this week — a change to make, a page to add wording to, a control to ' +
                'build. Not "review your approach to consent".',
            },
            why_this_satisfies: {
              type: 'string',
              description:
                'How these steps map to what the citation actually demands. Tie it to the legal ' +
                'text, not to convention.',
            },
            evidence_afterwards: {
              type: 'array',
              items: { type: 'string' },
              description:
                'What would exist once this is done that would let someone attest the requirement — ' +
                'the specific screenshot, wording or record to capture.',
            },
            effort: {
              type: 'string',
              enum: ['small', 'medium', 'large'],
              description:
                'Rough size. small: a wording or content change. medium: a page or flow. ' +
                'large: new product surface or cross-team work.',
            },
          },
          required: ['requirement_id', 'headline', 'steps', 'why_this_satisfies', 'evidence_afterwards', 'effort'],
        },
      },
    },
    required: ['recommendations'],
  },
};

function buildSystem(strictness) {
  return `You are advising a product team on how to close specific privacy compliance gaps.

You are writing recommendations — steps to take. You are not reporting observations, and you have not looked at their product. What you know about their current position is only what is stated below, and each item says where it came from.

Strictness setting: ${strictness.label} — ${strictness.blurb} Let this inform how literally the wording of any suggested change needs to track the statute.

Rules:
- **Never assert a fact about their product.** If the status below says a requirement is Unassessed, nobody has checked it — write "if your policy does not already state X" rather than "your policy does not state X". Where a finding is recorded and evidenced, you may rely on it, and should say so.
- Recommend against the **citation**, not against convention. There are many valid ways to satisfy an article; suggest one that works and say why it satisfies the text, rather than presenting a house pattern as the requirement.
- Be concrete. "Add a retention period for each category of personal information to the Data We Collect section" is useful. "Improve your retention disclosures" is not.
- Prefer the smallest change that actually satisfies the citation. Do not design a preference centre when a sentence would do, and say plainly when a sentence would do.
- Say what evidence to capture afterwards. Most of the cost of compliance work is proving it later.
- Behind-login requirements cannot be verified from outside, so recommendations there are about what to build and what to record, not what to publish.`;
}

function buildUserTurn(requirements, context) {
  let s = 'REQUIREMENTS NEEDING WORK\n';
  for (const r of requirements) {
    s += `\n--- requirement_id: ${r.id}\nCitation: ${r.code}\nRequirement: ${r.text}\n`;
    if (r.layman) s += `In plain language: ${r.layman}\n`;
    s += `Current status: ${r.status || 'Unassessed'}\n`;
    /* Provenance travels with the status, because it decides whether the
       model may write about the product in the indicative at all. */
    s += `Where that status came from: ${r.provenance || 'nobody has assessed this yet — treat the current position as unknown'}\n`;
    if (r.basis) s += `What was actually found: ${r.basis}\n`;
    if (r.gaps && r.gaps.length) s += `Gaps already identified: ${r.gaps.join('; ')}\n`;
    if (r.staticProposal) s += `The tool's generic advice for this requirement: ${r.staticProposal}\n`;
  }
  if (context && context.countries) s += `\nJurisdictions in scope: ${context.countries}\n`;
  if (context && context.domain) s += `Product: ${context.domain}\n`;
  s += `\nRecord one recommendation for each of the ${requirements.length} requirement_id(s).`;
  return s;
}

async function recommend({ requirements, context, strictness }, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const client = opts.client || getClient();

  if (!requirements || !requirements.length) {
    return { ok: false, error: 'Nothing is currently outstanding, so there is nothing to recommend.' };
  }

  const req = {
    model,
    max_tokens: 8192,
    system: buildSystem(strictness || { label: 'Balanced', blurb: 'Reasonable paraphrases count.' }),
    tools: [RECORD_TOOL],
    tool_choice: { type: 'tool', name: 'record_recommendations' },
    messages: [{ role: 'user', content: buildUserTurn(requirements, context) }],
  };
  const thinking = thinkingFor(model);
  if (thinking) req.thinking = thinking;

  const response = await client.messages.create(req);
  const call = response.content.find(b => b.type === 'tool_use');
  if (!call) throw new Error('The adviser returned nothing. No recommendations were recorded.');

  const wanted = new Set(requirements.map(r => r.id));
  const recommendations = {};
  for (const r of call.input.recommendations || []) {
    if (!wanted.has(r.requirement_id)) continue;
    recommendations[r.requirement_id] = {
      headline: r.headline,
      steps: r.steps || [],
      whyThisSatisfies: r.why_this_satisfies || '',
      evidenceAfterwards: r.evidence_afterwards || [],
      effort: r.effort || 'medium',
    };
  }

  return {
    ok: true,
    model,
    recommendations,
    missing: [...wanted].filter(id => !recommendations[id]),
    generatedAt: Date.now(),
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

module.exports = { recommend, RECORD_TOOL, buildSystem, buildUserTurn };
