'use strict';
/* Checks for the crawler's page dedupe.

   Lives in this directory because the fixture site does; it tests
   ../crawler.js, not the agents.

   Why it exists: a run against betterhelp.com opened seven pages that were
   four unique documents — /privacy three times, /terms twice. Sites link
   the same document from the header, the footer, and again with a tracking
   parameter, and the crawl compared literal URLs. With a ten-page ceiling,
   duplicates cost reach directly, which is the exact problem depth-2
   discovery was added to solve.

   Run: node crawl.test.js */
process.env.ALLOW_PRIVATE_HOSTS = '1';

const fixture = require('./fixture/server.js');
const { crawl, canonicalKey } = require('../crawler.js');

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

(async () => {
  /* --- canonicalKey in isolation --------------------------------------- */
  const same = [
    ['https://x.com/privacy', 'https://x.com/privacy/'],
    ['https://x.com/privacy', 'https://x.com/privacy?ref=footer'],
    ['https://x.com/privacy', 'https://x.com/PRIVACY'],
    ['https://x.com/privacy', 'https://www.x.com/privacy'],
    ['https://x.com/privacy', 'https://x.com/privacy#rights'],
  ];
  for (const [a, b] of same) {
    check(`same page: ${b.replace('https://', '')}`, canonicalKey(a) === canonicalKey(b));
  }
  check('different paths stay different',
    canonicalKey('https://x.com/privacy') !== canonicalKey('https://x.com/privacy-choices'));
  check('different hosts stay different',
    canonicalKey('https://x.com/privacy') !== canonicalKey('https://y.com/privacy'));
  check('a malformed URL does not throw', typeof canonicalKey('not a url') === 'string');

  /* --- against the fixture, whose homepage links /privacy four ways ----- */
  const server = await fixture.start();
  try {
    const res = await crawl(`http://127.0.0.1:${fixture.PORT}/`);
    const paths = res.pages.map(p => new URL(p.url).pathname.replace(/\/+$/, '').toLowerCase() || '/');
    const unique = new Set(paths);

    check('no page fetched twice', paths.length === unique.size,
      paths.length === unique.size ? `${paths.length} pages` : `got ${paths.join(' ')}`);
    check('the policy is still reached', unique.has('/privacy'), [...unique].join(' '));
    check('duplicate links did not crowd out other documents',
      unique.has('/cookies'), [...unique].join(' '));
    check('every page carries usable text', res.pages.every(p => p.text && p.text.length > 40));
    check('the budget was not spent on duplicates', res.pages.length <= 7, `${res.pages.length} pages`);

    console.log(`\n   fetched: ${paths.join('  ')}`);
  } finally {
    server.close();
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
})();
