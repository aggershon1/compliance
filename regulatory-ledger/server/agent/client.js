'use strict';
/* ============================================================
   SHARED MODEL CLIENT
   ============================================================
   One place that knows how to reach the API, so the navigator and the
   attestation interviewer agree on model, thinking config, and what
   "available" means.

   Availability is checked without spending anything: the SDK either
   resolves or it doesn't, and the key is either set or it isn't. The
   service reports that on /api/health so the app can tell the user which
   of the two is missing instead of failing at the moment they click. */

const DEFAULT_MODEL = process.env.AGENT_MODEL || 'claude-opus-5';

let cached = null;

function availability(){
  if(!process.env.ANTHROPIC_API_KEY){
    return {available:false, reason:'ANTHROPIC_API_KEY is not set in the crawl service\'s environment.'};
  }
  try{
    require.resolve('@anthropic-ai/sdk');
  }catch(e){
    return {available:false, reason:'The Anthropic SDK is not installed. Run `npm install` in server/agent.'};
  }
  return {available:true, model: DEFAULT_MODEL};
}

function getClient(){
  const a = availability();
  if(!a.available) throw new Error(a.reason);
  if(cached) return cached;
  const Anthropic = require('@anthropic-ai/sdk');
  cached = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});
  return cached;
}

/* Extended thinking's shape differs by model family, and the model is a
   single env var away from changing, so branch here rather than making
   every caller remember.

   - 4.6 and newer take {type:'adaptive'}.
   - Haiku 4.5 predates that and rejects it with a 400; it would need
     {type:'enabled', budget_tokens:N}.

   Off unless AGENT_THINKING=1. Neither of the two agents here is
   reasoning-heavy, and leaving it off keeps a model swap a one-variable
   change rather than a two-variable one. */
function thinkingFor(model){
  if(process.env.AGENT_THINKING !== '1') return undefined;
  if(/haiku-4-5|claude-3/.test(model)) return undefined;
  return {type:'adaptive'};
}

module.exports = { DEFAULT_MODEL, availability, getClient, thinkingFor };
