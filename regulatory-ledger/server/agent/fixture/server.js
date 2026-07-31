'use strict';
/* ============================================================
   FIXTURE SITE — a stand-in for a real site, for the eval
   ============================================================
   Serves a small site on 127.0.0.1:8501 so the eval can run repeatedly,
   offline, without hammering anyone's servers.

   It is built to exhibit one specific, real failure mode of the
   POLICY_HINTS approach in ../../crawler.js, and it is worth being honest
   that it was built that way: the site's US-state privacy notice is filed
   under "Additional Disclosures for U.S. State Residents" at
   /disclosures/us-states. Nothing in that link text or path matches any
   hint regex, so the heuristic cannot reach it — while three legal pages
   that have nothing to do with data (terms, DMCA, accessibility) do match
   and consume the discovery budget.

   That is not a strawman; it is the same shape as the miss on
   betterhelp.com that prompted this work. But a fixture built to show a
   gap will always show the gap. The real measurement is the eval run
   against live sites (`node eval.js betterhelp.com`); this one exists so
   you can iterate on the prompt in seconds without network flakiness or
   API spend.

   Run: node fixture/server.js       (or let eval.js start it for you)
   ============================================================ */

const http = require('node:http');

const PORT = Number(process.env.FIXTURE_PORT || 8501);

const NAV = `
<nav>
  <a href="/">Home</a>
  <a href="/how-it-works">How it works</a>
  <a href="/pricing">Pricing</a>
  <a href="/therapists">Find a therapist</a>
  <a href="/help">Help Center</a>
</nav>`;

const FOOTER = `
<footer>
  <a href="/about">About</a>
  <a href="/careers">Careers</a>
  <a href="/press">Press</a>
  <a href="/blog">Blog</a>
  <a href="/contact">Contact us</a>
  <a href="/legal/terms">Terms &amp; Conditions</a>
  <a href="/legal/dmca">DMCA Policy</a>
  <a href="/legal/accessibility">Accessibility Statement</a>
  <a href="/privacy">Privacy Policy</a>
  <a href="/sitemap">Sitemap</a>
</footer>`;

function page(title, body) {
  return `<!doctype html><html><head><title>${title}</title></head><body>
${NAV}
<main>${body}</main>
${FOOTER}
</body></html>`;
}

const PAGES = {
  '/': page('Calmly — online therapy', `
    <h1>Therapy that fits your life</h1>
    <p>Match with a licensed therapist and start within 48 hours. Message anytime,
       or schedule live video sessions.</p>
    <a href="/get-started">Get started</a>
    <a href="/how-it-works">See how it works</a>
  `),

  /* Legal, matches the hint list, irrelevant to data protection. */
  '/legal/terms': page('Terms & Conditions', `
    <h1>Terms and Conditions</h1>
    <p>These terms govern your use of the Calmly platform. By creating an account you
       agree to arbitration of disputes and to the limitations of liability below.</p>
    <p>Calmly is not a crisis service. If you are in danger, call emergency services.</p>
  `),
  '/legal/dmca': page('DMCA Policy', `
    <h1>DMCA Notice and Takedown</h1>
    <p>To report copyright infringement, send a notice to our designated agent
       including identification of the copyrighted work and your contact details.</p>
  `),
  '/legal/accessibility': page('Accessibility Statement', `
    <h1>Accessibility</h1>
    <p>Calmly aims to conform to WCAG 2.1 AA. If you encounter a barrier, contact
       our accessibility team and we will respond within five business days.</p>
  `),

  /* The real privacy policy. It links the two documents that matter, and one
     of them is not named anything the hint list expects. */
  '/privacy': page('Privacy Policy', `
    <h1>Privacy Policy</h1>
    <p>Last updated 14 March 2026. This policy explains what personal information
       Calmly collects, how we use it, and the rights you have over it.</p>
    <h2>Information we collect</h2>
    <p>Account details, the content of messages with your therapist, payment
       information processed by our payment provider, and device and usage data.</p>
    <h2>Legal bases</h2>
    <p>Where the GDPR applies we rely on contract, consent, legal obligation, and
       legitimate interests depending on the purpose.</p>
    <h2>Your rights</h2>
    <p>You may request access to, correction of, or deletion of your personal
       information, and you may request a portable copy. Submit requests from
       Account Settings or by writing to privacy@calmly.example.</p>
    <h2>International transfers</h2>
    <p>Where information is transferred out of the EEA we rely on the European
       Commission's Standard Contractual Clauses.</p>
    <h2>More information</h2>
    <p>
      <a href="/disclosures/us-states">Additional Disclosures for U.S. State Residents</a> —
      residents of California, Colorado, Connecticut and Virginia have further rights.
    </p>
    <p><a href="/cookies">How we use cookies and similar technologies</a></p>
    <p><a href="/legal/terms">Terms &amp; Conditions</a></p>
  `),

  /* The CCPA/CPRA supplement, filed under a name no hint regex matches. */
  '/disclosures/us-states': page('Additional Disclosures for U.S. State Residents', `
    <h1>Additional Disclosures for U.S. State Residents</h1>
    <p>This supplement applies to residents of California, Colorado, Connecticut,
       and Virginia, and supplements our Privacy Policy.</p>
    <h2>Notice at collection</h2>
    <p>We collect identifiers, commercial information, internet activity, and health
       information you provide to your therapist. We retain each category for as long
       as your account is active and for seven years thereafter where required.</p>
    <h2>Sale and sharing</h2>
    <p>We do not sell personal information for money. We do share limited identifiers
       and internet activity with advertising partners for cross-context behavioural
       advertising, which some laws treat as a sale.</p>
    <p><a href="/opt-out">Do Not Sell or Share My Personal Information</a></p>
    <h2>Sensitive personal information</h2>
    <p>You may limit the use and disclosure of sensitive personal information,
       including health information, to what is necessary to provide the service.</p>
    <h2>Non-discrimination</h2>
    <p>We will not deny service, charge a different price, or provide a lesser quality
       of service because you exercised a privacy right.</p>
    <h2>Authorised agents</h2>
    <p>An authorised agent may submit a request on your behalf with written permission.</p>
  `),

  '/opt-out': page('Do Not Sell or Share My Personal Information', `
    <h1>Do Not Sell or Share My Personal Information</h1>
    <p>Use this form to opt out of the sharing of your personal information for
       cross-context behavioural advertising. We honour Global Privacy Control
       signals sent by your browser.</p>
  `),

  '/cookies': page('Cookie Policy', `
    <h1>Cookie Policy</h1>
    <p>We use strictly necessary cookies to keep you signed in, and analytics and
       advertising cookies where you have consented. You can change your choices at
       any time from the cookie banner or from Account Settings.</p>
  `),

  /* Marketing filler, so the homepage looks like a homepage. */
  '/how-it-works': page('How it works', '<h1>How it works</h1><p>Match, message, meet.</p>'),
  '/pricing': page('Pricing', '<h1>Pricing</h1><p>From $65 per week, billed monthly.</p>'),
  '/therapists': page('Find a therapist', '<h1>Our therapists</h1><p>All licensed and background-checked.</p>'),
  '/help': page('Help Center', '<h1>Help Center</h1><p>Answers to common questions.</p>'),
  '/about': page('About', '<h1>About Calmly</h1><p>Founded 2019.</p>'),
  '/careers': page('Careers', '<h1>Careers</h1><p>We are hiring.</p>'),
  '/press': page('Press', '<h1>Press</h1><p>Media enquiries.</p>'),
  '/blog': page('Blog', '<h1>Blog</h1><p>Notes on mental health.</p>'),
  '/contact': page('Contact us', '<h1>Contact</h1><p>support@calmly.example</p>'),
  '/get-started': page('Get started', '<h1>Get started</h1><p>Take the questionnaire.</p>'),
  '/sitemap': page('Sitemap', '<h1>Sitemap</h1><p>All pages.</p>'),
};

/* The URLs a good discovery run should return: the data-protection
   documents, and nothing else. Terms is deliberately excluded — it is
   legal but not a privacy document, and picking it up is noise, not a hit. */
const EXPECTED = [
  '/privacy',
  '/disclosures/us-states',
  '/cookies',
  '/opt-out',
];

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname.replace(/\/+$/, '') || '/';
    const body = PAGES[path];
    if (!body) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('Not found', '<h1>404</h1>'));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { start, PAGES, EXPECTED, PORT };

if (require.main === module) {
  start().then(() => console.log(`Fixture site on http://127.0.0.1:${PORT}/`));
}
