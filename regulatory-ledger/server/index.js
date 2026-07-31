'use strict';
/* ============================================================
   REGULATORY LEDGER — CRAWL SERVICE
   ============================================================
   A deliberately small HTTP service whose only reason to exist is that a
   browser cannot read another site's pages. Same-origin policy blocks it,
   by design, so retrieval has to happen somewhere without that restriction.

   Zero dependencies — Node's built-in http and fetch only — so this stays
   `node server/index.js` with no install step, in keeping with the rest of
   the project. Run it locally; it is not hardened for public hosting.

   It returns page text, links and script sources. It does not decide
   whether anything is compliant: the app applies the requirement rules and
   your strictness setting to what was actually retrieved. */

const http = require('node:http');
const { crawl } = require('./crawler');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

/* The app is a static file, so it may be opened from file:// (origin
   "null"), from a python http.server, or from anywhere else on localhost.
   Rather than guess, echo the caller's origin — acceptable because this
   binds to loopback by default and holds no credentials or user data. */
function corsHeaders(req){
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
function send(req, res, status, body){
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', ...corsHeaders(req)});
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if(req.method === 'OPTIONS'){ res.writeHead(204, corsHeaders(req)); return res.end(); }

  let url;
  try{ url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch(e){ return send(req, res, 400, {ok:false, error:'Bad request URL.'}); }

  if(url.pathname === '/api/health'){
    return send(req, res, 200, {ok:true, service:'regulatory-ledger-crawler', version:'1.0.0'});
  }

  if(url.pathname === '/api/crawl'){
    const target = url.searchParams.get('url');
    if(!target) return send(req, res, 400, {ok:false, error:'Pass ?url=example.com'});
    const startedAt = Date.now();
    try{
      const result = await crawl(target);
      console.log(`[crawl] ${target} -> ${result.pages.length} page(s) in ${Date.now()-startedAt}ms`);
      return send(req, res, 200, result);
    }catch(e){
      console.warn(`[crawl] ${target} failed: ${e.message}`);
      /* Surface the real reason. A crawl that failed must never be
         presented as a finding — the app leaves those requirements
         unassessed and shows this message. */
      return send(req, res, 200, {ok:false, target, error: e.message, fetchedAt: Date.now()});
    }
  }

  return send(req, res, 404, {ok:false, error:'Not found. Try /api/health or /api/crawl?url=example.com'});
});

server.listen(PORT, HOST, () => {
  console.log(`Regulatory Ledger crawl service listening on http://${HOST}:${PORT}`);
  console.log(`  health: http://${HOST}:${PORT}/api/health`);
  console.log(`  crawl:  http://${HOST}:${PORT}/api/crawl?url=example.com`);
  console.log(`Open regulatory-ledger.html and it will detect this service automatically.`);
});
