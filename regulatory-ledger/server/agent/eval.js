'use strict';
/* ============================================================
   EVAL — hint list vs. navigator agent
   ============================================================
   Runs both discovery methods against the same target and prints what each
   one found. The point is to make "should we use an agent here, and which
   model" a measurement rather than an argument.

   Usage:
     node eval.js                        # local fixture, both methods
     node eval.js --heuristic-only       # no API key needed
     node eval.js betterhelp.com         # a real site
     AGENT_MODEL=claude-haiku-4-5 node eval.js

   Swapping models is one environment variable, on purpose. Build on
   claude-opus-5 until the numbers are good, then re-run on a cheaper model
   and see whether the score holds. If it does you have saved real money on
   a hot path and you know it; if it does not, you know that too.
   ============================================================ */

/* The fixture lives on loopback, which crawler.js refuses by design. This
   must be set before crawler.js is required — it reads the flag at load. */
const target = process.argv.slice(2).find(a => !a.startsWith('-'));
const USING_FIXTURE = !target;
if (USING_FIXTURE) process.env.ALLOW_PRIVATE_HOSTS = '1';

const { crawl } = require('../crawler.js');
const fixture = require('./fixture/server.js');

const HEURISTIC_ONLY = process.argv.includes('--heuristic-only');
const VERBOSE = process.argv.includes('--verbose');

/* Input/output $ per million tokens, for the run cost line. */
const PRICING = {
  'claude-opus-5':    [5.00, 25.00],
  'claude-sonnet-5':  [3.00, 15.00],
  'claude-haiku-4-5': [1.00,  5.00],
  'claude-fable-5':  [10.00, 50.00],
};

function pathOf(u) { try { return new URL(u).pathname.replace(/\/+$/, '') || '/'; } catch { return u; } }

function score(foundPaths, expected) {
  const found = new Set(foundPaths);
  const hits = expected.filter(e => found.has(e));
  const missed = expected.filter(e => !found.has(e));
  const extra = [...found].filter(f => f !== '/' && !expected.includes(f));
  return { hits, missed, extra, recall: expected.length ? hits.length / expected.length : null };
}

function report(label, paths, expected, meta) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 58 - label.length))}`);
  console.log(`   opened ${paths.length} page(s)`);
  for (const p of paths) {
    const mark = !expected ? ' ' : expected.includes(p) ? '✓' : p === '/' ? ' ' : '·';
    console.log(`     ${mark} ${p}`);
  }
  if (expected) {
    const s = score(paths, expected);
    console.log(`   recall ${s.hits.length}/${expected.length}` +
      `  (${Math.round(s.recall * 100)}%)`);
    if (s.missed.length) console.log(`   MISSED  ${s.missed.join('  ')}`);
    if (s.extra.length)  console.log(`   noise   ${s.extra.join('  ')}`);
  }
  if (meta) console.log(meta);
}

async function main() {
  let server = null;
  let url = target;
  let expected = null;

  if (USING_FIXTURE) {
    server = await fixture.start();
    url = `http://127.0.0.1:${fixture.PORT}/`;
    expected = fixture.EXPECTED;
    console.log(`Fixture site running on ${url}`);
    console.log('Expected privacy documents: ' + expected.join('  '));
  } else {
    console.log(`Target: ${url}   (no expected-URL list — judge the two lists by eye)`);
  }

  try {
    /* ---- Method A: the hint list that ships today --------------------- */
    const t0 = Date.now();
    const crawled = await crawl(url);
    const heuristicPaths = crawled.pages.map(p => pathOf(p.url));
    report('A. POLICY_HINTS heuristic (current crawler)', heuristicPaths, expected,
      `   ${Date.now() - t0}ms, $0.00, no API call`);
    if (VERBOSE && crawled.notes.length) {
      for (const n of crawled.notes) console.log(`   note: ${n}`);
    }

    if (HEURISTIC_ONLY) return;
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('\nANTHROPIC_API_KEY is not set — skipping the agent run.');
      console.log('Set it, or pass --heuristic-only to silence this.');
      return;
    }

    /* ---- Method B: the agent ----------------------------------------- */
    const { navigate } = require('./navigator.js');
    const t1 = Date.now();
    const run = await navigate(url);
    const agentPaths = run.pages.map(p => pathOf(p.url));

    const [inRate, outRate] = PRICING[run.model] || [null, null];
    const cost = inRate
      ? (run.usage.input_tokens / 1e6) * inRate + (run.usage.output_tokens / 1e6) * outRate
      : null;

    report(`B. Navigator agent (${run.model})`, agentPaths, expected,
      `   ${Date.now() - t1}ms, ${run.usage.turns} turns, ` +
      `${run.usage.input_tokens} in / ${run.usage.output_tokens} out` +
      (cost !== null ? `, ~$${cost.toFixed(4)}` : ''));

    for (const p of run.pages) console.log(`     ${pathOf(p.url)}  [${p.document_type}]`);

    /* The honesty gate is a headline result, not a footnote: if the agent
       claimed a page it never actually retrieved, that is the single most
       important thing to know about this run. */
    if (run.dropped.length) {
      console.log(`\n   ⚠ ${run.dropped.length} reported page(s) DROPPED — not in the fetch log:`);
      for (const d of run.dropped) console.log(`     ${d.url}`);
      console.log('     (the model named a page it did not successfully open; the gate caught it)');
    } else {
      console.log('\n   ✓ every reported page was actually retrieved');
    }
    if (run.coverage_note) console.log(`   coverage note: ${run.coverage_note}`);
    if (run.stoppedBecause) console.log(`   ⚠ ${run.stoppedBecause}`);

    if (VERBOSE) {
      console.log('\n   fetch log:');
      for (const e of run.fetchLog) {
        console.log(`     ${e.ok ? 'ok ' : 'ERR'} ${pathOf(e.url)}  — ${e.reason || e.error || ''}`);
      }
    }

    /* ---- The comparison ---------------------------------------------- */
    if (expected) {
      const a = score(heuristicPaths, expected);
      const b = score(agentPaths, expected);
      console.log('\n── verdict ' + '─'.repeat(52));
      console.log(`   heuristic ${a.hits.length}/${expected.length}   agent ${b.hits.length}/${expected.length}`);
      const gained = b.hits.filter(h => !a.hits.includes(h));
      const lost = a.hits.filter(h => !b.hits.includes(h));
      if (gained.length) console.log(`   agent found that the heuristic missed: ${gained.join('  ')}`);
      if (lost.length)   console.log(`   heuristic found that the agent missed: ${lost.join('  ')}`);
      if (!gained.length && !lost.length) console.log('   same coverage — the heuristic is doing fine here');
    }
  } finally {
    if (server) server.close();
  }
}

main().catch(err => { console.error('\nEval failed:', err.message); process.exit(1); });
