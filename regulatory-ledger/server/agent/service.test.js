'use strict';
/* End-to-end checks of the HTTP surface, run against a real child process
   of the service and the local fixture site.

   The point of these is degradation. Two of the app's capabilities need a
   model, and the interesting question is not what happens when everything
   works — it is what the user is told when the SDK is missing, the key is
   missing, or the API is unreachable. Silently producing a worse result
   would be the failure this project already had to correct once.

   No API key and no network needed: the "configured but failing" case
   points the SDK at a closed port.

   Run: node service.test.js */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fixture = require('./fixture/server.js');

const SERVICE = path.join(__dirname, '..', 'index.js');

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

function startService(port, env) {
  const child = spawn(process.execPath, [SERVICE], {
    env: { ...process.env, PORT: String(port), ALLOW_PRIVATE_HOSTS: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  return new Promise((resolve) => {
    const ready = () => {
      if (/listening on/.test(log)) resolve({ child, log: () => log });
      else setTimeout(ready, 60);
    };
    ready();
  });
}

const get = async (u) => (await fetch(u)).json();
const post = async (u, body) => (await fetch(u, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})).json();

(async () => {
  const site = await fixture.start();
  const target = `http://127.0.0.1:${fixture.PORT}/`;

  /* --- No key: the service still crawls ------------------------------- */
  const a = await startService(8791, { ANTHROPIC_API_KEY: '' });
  try {
    const health = await get('http://127.0.0.1:8791/api/health');
    check('health reports the agent as unavailable',
      health.ok === true && health.agent.available === false);
    check('health says WHY, not just that it failed',
      /ANTHROPIC_API_KEY/.test(health.agent.reason || ''), health.agent.reason);
    check('startup log tells the operator what is off',
      /agents: disabled/.test(a.log()) && /crawling still works/.test(a.log()));

    const auto = await get(`http://127.0.0.1:8791/api/crawl?url=${encodeURIComponent(target)}&mode=auto`);
    check('auto falls through to link patterns', auto.ok === true && auto.discovery.method === 'links',
      JSON.stringify(auto.discovery));
    check('crawling still works without a model', auto.pages.length > 1, `${auto.pages.length} pages`);

    const forced = await get(`http://127.0.0.1:8791/api/crawl?url=${encodeURIComponent(target)}&mode=agent`);
    check('explicitly requesting the agent fails loudly rather than pretending',
      forced.ok === false && /unavailable/.test(forced.error));

    const att = await post('http://127.0.0.1:8791/api/attest',
      { item: { code: 'GDPR Art. 17', text: 'erasure' }, description: 'users can delete' });
    check('attest reports unavailable and names the fallback',
      att.ok === false && att.fallback === 'keyword' && /ANTHROPIC_API_KEY/.test(att.error));

    const bad = await post('http://127.0.0.1:8791/api/attest', { description: 'no item' });
    check('attest rejects a request with no requirement', bad.ok === false && /item/.test(bad.error));
  } finally { a.child.kill(); }

  /* --- Key set but the API unreachable: must degrade, not die ---------- */
  const b = await startService(8792, {
    ANTHROPIC_API_KEY: 'sk-ant-not-a-real-key',
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',   // discard port: refuses instantly
    ANTHROPIC_MAX_RETRIES: '0',
  });
  try {
    const health = await get('http://127.0.0.1:8792/api/health');
    check('health reports the agent available when key + SDK are present',
      health.agent.available === true && !!health.agent.model, JSON.stringify(health.agent));

    const crawled = await get(`http://127.0.0.1:8792/api/crawl?url=${encodeURIComponent(target)}&mode=agent`);
    check('an unreachable API falls back to link patterns rather than failing the crawl',
      crawled.ok === true && crawled.discovery.method === 'links' && crawled.discovery.fellBackFrom === 'agent',
      JSON.stringify(crawled.discovery && crawled.discovery.method));
    check('the fallback is recorded in the notes, not silent',
      (crawled.notes || []).some(n => /fell back/i.test(n)),
      JSON.stringify(crawled.notes));

    const att = await post('http://127.0.0.1:8792/api/attest',
      { item: { code: 'GDPR Art. 17', text: 'erasure' }, description: 'users can delete' });
    check('attest reports the failure and names the fallback',
      att.ok === false && att.fallback === 'keyword', JSON.stringify(att));
  } finally { b.child.kill(); }

  site.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
})();
