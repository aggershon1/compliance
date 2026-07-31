'use strict';
/* ============================================================
   REGULATORY LEDGER — CRAWL SERVICE
   ============================================================
   A deliberately small HTTP service whose original reason to exist is that
   a browser cannot read another site's pages. Same-origin policy blocks it,
   by design, so retrieval has to happen somewhere without that restriction.
   It has since gained a second reason: a static file cannot hold an API
   key, and two parts of the app now want a model.

   The core stays zero-dependency — Node's built-in http and fetch only —
   so `node server/index.js` still runs with no install step. The two
   model-backed features live in ./agent, which has its own package.json,
   and are `require`d lazily inside their handlers. If that directory has no
   node_modules, or no API key is set, the service still starts and still
   crawls; the app is told which capability is missing and why, and falls
   back to what works without it.

   It returns page text, links and script sources, and it reviews the user's
   own written attestations. It does not decide whether a website is
   compliant: the app applies the requirement rules and your strictness
   setting to what was actually retrieved. */

const http = require('node:http');
const { crawl } = require('./crawler');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 1_000_000;

/* Lazily resolve the model-backed half. Kept in one place so a missing
   install or missing key reads the same everywhere. */
function agentCapability(){
  try{
    return require('./agent/client.js').availability();
  }catch(e){
    return {available:false, reason:'The agent module could not be loaded: ' + e.message};
  }
}

/* The app is a static file, so it may be opened from file:// (origin
   "null"), from a python http.server, or from anywhere else on localhost.
   Rather than guess, echo the caller's origin — acceptable because this
   binds to loopback by default and holds no credentials or user data. */
function corsHeaders(req){
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
function send(req, res, status, body){
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', ...corsHeaders(req)});
  res.end(JSON.stringify(body));
}

function readJsonBody(req){
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if(size > MAX_BODY){ reject(new Error('Request body too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if(!chunks.length) return resolve({});
      try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch(e){ reject(new Error('Request body was not valid JSON.')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if(req.method === 'OPTIONS'){ res.writeHead(204, corsHeaders(req)); return res.end(); }

  let url;
  try{ url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch(e){ return send(req, res, 400, {ok:false, error:'Bad request URL.'}); }

  if(url.pathname === '/api/health'){
    const agent = agentCapability();
    return send(req, res, 200, {
      ok:true,
      service:'regulatory-ledger-crawler',
      version:'1.1.0',
      /* The app uses this to decide what to offer, and to explain what is
         switched off rather than silently degrading. */
      agent: {
        available: agent.available,
        model: agent.model || null,
        reason: agent.reason || null,
      },
    });
  }

  /* ---- Crawl ----------------------------------------------------------
     mode=agent   navigator agent picks the pages
     mode=links   the POLICY_HINTS heuristic
     mode=auto    agent when it is available, heuristic otherwise (default) */
  if(url.pathname === '/api/crawl'){
    const target = url.searchParams.get('url');
    if(!target) return send(req, res, 400, {ok:false, error:'Pass ?url=example.com'});
    const requested = url.searchParams.get('mode') || 'auto';
    const agent = agentCapability();
    const startedAt = Date.now();

    let mode = requested;
    if(mode === 'auto') mode = agent.available ? 'agent' : 'links';
    if(mode === 'agent' && !agent.available){
      return send(req, res, 200, {ok:false, target, error:`Agent discovery is unavailable: ${agent.reason}`, fetchedAt: Date.now()});
    }

    try{
      let result;
      if(mode === 'agent'){
        try{
          const { crawlWithAgent } = require('./agent/navigator.js');
          result = await crawlWithAgent(target);
        }catch(e){
          /* A model outage should degrade to the heuristic rather than
             leaving the user with nothing. The fallback is reported, not
             silent — which discovery method produced a set of pages is
             part of the provenance of every finding derived from them. */
          console.warn(`[crawl] agent discovery failed (${e.message}); falling back to link patterns`);
          result = await crawl(target);
          result.discovery = {method:'links', fellBackFrom:'agent', reason:e.message};
          result.notes = [...(result.notes||[]), `Agent discovery failed (${e.message}); fell back to matching link patterns.`];
        }
      } else {
        result = await crawl(target);
        result.discovery = {method:'links'};
      }
      console.log(`[crawl] ${target} -> ${result.pages.length} page(s) via ${result.discovery.method} in ${Date.now()-startedAt}ms`);
      return send(req, res, 200, result);
    }catch(e){
      console.warn(`[crawl] ${target} failed: ${e.message}`);
      /* Surface the real reason. A crawl that failed must never be
         presented as a finding — the app leaves those requirements
         unassessed and shows this message. */
      return send(req, res, 200, {ok:false, target, error: e.message, fetchedAt: Date.now()});
    }
  }

  /* ---- Attestation review ---------------------------------------------
     Reviews the user's own written description of a behind-login flow.
     Reads nothing, observes nothing, and holds no state — the interview
     transcript is passed in on every call and lives in the browser. */
  if(url.pathname === '/api/attest'){
    if(req.method !== 'POST'){
      return send(req, res, 405, {ok:false, error:'POST a JSON body to /api/attest.'});
    }
    /* Validate the request before checking capability: a malformed request
       is a 400 whether or not a model is configured, and answering it with
       "the agent is unavailable" would send the caller chasing the wrong
       problem. */
    let body;
    try{ body = await readJsonBody(req); }
    catch(e){ return send(req, res, 400, {ok:false, error:e.message}); }

    if(!body.item || !body.item.code){
      return send(req, res, 400, {ok:false, error:'Missing `item` (the requirement being attested).'});
    }

    const agent = agentCapability();
    if(!agent.available){
      return send(req, res, 200, {ok:false, error:agent.reason, fallback:'keyword'});
    }
    try{
      const { reviewAttestation } = require('./agent/attest.js');
      const result = await reviewAttestation(body);
      console.log(`[attest] ${body.item.code} -> ${result.needsFollowUp ? 'follow-up' : result.status + (result.grounded ? '' : ' (UNGROUNDED)')}`);
      return send(req, res, 200, result);
    }catch(e){
      console.warn(`[attest] ${body.item.code} failed: ${e.message}`);
      return send(req, res, 200, {ok:false, error:e.message, fallback:'keyword'});
    }
  }

  return send(req, res, 404, {ok:false, error:'Not found. Try /api/health, /api/crawl?url=example.com, or POST /api/attest'});
});

server.listen(PORT, HOST, () => {
  const agent = agentCapability();
  console.log(`Regulatory Ledger crawl service listening on http://${HOST}:${PORT}`);
  console.log(`  health: http://${HOST}:${PORT}/api/health`);
  console.log(`  crawl:  http://${HOST}:${PORT}/api/crawl?url=example.com`);
  if(agent.available){
    console.log(`  agents: enabled (${agent.model}) — navigator discovery and attestation review`);
  }else{
    console.log(`  agents: disabled — ${agent.reason}`);
    console.log(`          crawling still works via link patterns; attestations use the keyword reviewer.`);
  }
  console.log(`Open regulatory-ledger.html and it will detect this service automatically.`);
});
