/* ============================================================
   DATA
   ============================================================ */

const COUNTRIES = [
  {code:'US-CA', name:'United States — California', regs:['CCPA']},
  {code:'US-OTHER', name:'United States — other states', regs:[]},
  {code:'DE', name:'Germany', regs:['GDPR']},
  {code:'FR', name:'France', regs:['GDPR']},
  {code:'IT', name:'Italy', regs:['GDPR']},
  {code:'ES', name:'Spain', regs:['GDPR']},
  {code:'NL', name:'Netherlands', regs:['GDPR']},
  {code:'IE', name:'Ireland', regs:['GDPR']},
  {code:'PL', name:'Poland', regs:['GDPR']},
  {code:'SE', name:'Sweden', regs:['GDPR']},
  {code:'BE', name:'Belgium', regs:['GDPR']},
  {code:'AT', name:'Austria', regs:['GDPR']},
  {code:'PT', name:'Portugal', regs:['GDPR']},
  {code:'DK', name:'Denmark', regs:['GDPR']},
  {code:'FI', name:'Finland', regs:['GDPR']},
  {code:'GR', name:'Greece', regs:['GDPR']},
  {code:'CH', name:'Switzerland', regs:['GDPR'], note:true},
];

/* Best-effort mapping from a known country code, or a manually-typed country
   name, to the `region` tags used in BILLS below — so the Upcoming Legislation
   tab can default to "what's relevant to this site's countries" instead of
   always showing everything. Anything not covered here just falls back to the
   existing "no entries match" empty state — this prototype's BILLS list is a
   small illustrative sample, not real coverage of every country's legislation. */
const COUNTRY_BILL_REGIONS = {
  'US-CA': ['US-Federal', 'US-California'],
  'US-OTHER': ['US-Federal'],
  'DE': ['EU'], 'FR': ['EU'], 'IT': ['EU'], 'ES': ['EU'], 'NL': ['EU'],
  'IE': ['EU'], 'PL': ['EU'], 'SE': ['EU'], 'BE': ['EU'], 'AT': ['EU'],
  'PT': ['EU'], 'DK': ['EU'], 'FI': ['EU'], 'GR': ['EU'],
  'CH': [],
};
const MANUAL_COUNTRY_BILL_ALIASES = [
  {match:['brazil'], regions:['Brazil']},
  {match:['canada'], regions:['Canada']},
  {match:['uk', 'united kingdom', 'great britain'], regions:['UK']},
  {match:['colorado'], regions:['US-Colorado']},
];

const GDPR_SCANNED = [
  {id:'gdpr-s1', code:'Art. 6', text:'Lawful basis referenced in privacy notice', sev:'high', na:false,
    layman:'Before collecting or using someone’s personal data, you need a valid legal reason — like their consent, a contract with them, or a legitimate business need that doesn’t override their rights.',
    articleTitle:'GDPR Article 6 — Lawfulness of processing',
    articleText:'Processing is only lawful if at least one condition applies: consent, necessity for a contract, a legal obligation, protecting someone’s vital interests, a public-interest task, or a legitimate interest not overridden by the individual’s rights.',
    proposals:['Create a data-processing register mapping every purpose you collect data for to one of the six legal bases.', 'Add a short "why we collect this" note next to each data type in your privacy notice.'],
    hints:{partial:'Lawful basis is referenced generically but not mapped to each processing purpose.', fail:'No documented lawful basis found for processing activities.'},
    evidence:{
      fail:{snippet:'"We use cookies and similar technologies to improve your experience."', location:'Privacy Policy → “How We Use Information” (no legal basis named)'},
      partial:{snippet:'"We process your data as needed to operate our services."', location:'Privacy Policy → “How We Use Information”'}}},
  {id:'gdpr-s2', code:'Art. 7 / ePrivacy', text:'Granular consent mechanism for cookies and trackers', sev:'high', na:false,
    layman:'If your site uses cookies or trackers that aren’t strictly necessary, you need to ask permission first — and it has to be a real choice, not a pre-checked box.',
    articleTitle:'GDPR Art. 7 & ePrivacy Directive — Conditions for consent',
    articleText:'Consent must be freely given, specific, informed, and unambiguous, shown through a clear affirmative action. It must be as easy to withdraw as to give, and bundling unrelated consents together isn’t allowed.',
    proposals:['Make "Reject All" as prominent and one-click as "Accept All" in the cookie banner.', 'Split consent into categories (functional, analytics, marketing) so users can accept some and decline others.'],
    hints:{partial:'Cookie banner exists but lacks granular accept/reject-by-category controls.', fail:'No compliant consent mechanism detected — trackers appear to fire before consent.'},
    evidence:{
      fail:{snippet:'(No cookie banner detected before analytics/marketing scripts loaded)', location:'Homepage, first page load'},
      partial:{snippet:'"Accept All" · "Cookie Settings"', location:'Cookie banner, bottom of homepage (no equally prominent "Reject All")'}}},
  {id:'gdpr-s3', code:'Art. 13', text:'Privacy notice covers all processing purposes in plain language', sev:'med', na:false,
    layman:'Your privacy policy needs to actually explain, in plain language, everything you do with someone’s data — not just exist as a formality.',
    articleTitle:'GDPR Article 13 — Information to be provided',
    articleText:'When collecting data directly from someone, you must tell them who you are, why you’re collecting their data, how long you’ll keep it, who it’s shared with, and what rights they have.',
    proposals:['Audit every data collection point on the site and confirm each purpose is named in the privacy notice.', 'Add a plain-language summary at the top of the policy, above the legal text.'],
    hints:{partial:'Notice covers most processing but omits some data sources found during the crawl.', fail:'Privacy notice is missing, or does not match tracking behavior observed on the site.'},
    evidence:{
      fail:{snippet:'(No privacy policy found at /privacy or linked from the footer)', location:'Footer navigation'},
      partial:{snippet:'"...may share information with our partners for business purposes."', location:'Privacy Policy → “Sharing” section (partners not named)'}}},
  {id:'gdpr-s4', code:'Art. 37', text:'DPO contact designated and published', sev:'low', na:true,
    layman:'If your organization processes a lot of sensitive or large-scale personal data, you may be required to name a specific person responsible for privacy — and publish how to reach them.',
    articleTitle:'GDPR Article 37 — Designation of the data protection officer',
    articleText:'Certain organizations — including those doing large-scale monitoring or processing special categories of data — must appoint a Data Protection Officer and publish their contact details.',
    proposals:['Confirm whether your processing volume/type actually triggers the DPO requirement.', 'If required, publish a named or role-based contact (e.g. privacy@yourcompany.com) in the privacy policy.'],
    hints:{partial:'A privacy contact is listed but not clearly designated as DPO.', fail:'No Data Protection Officer or privacy contact designated.'},
    evidence:{
      fail:{snippet:'(No "Data Protection Officer" or dedicated privacy contact found)', location:'Privacy Policy footer / Contact page'},
      partial:{snippet:'"Questions? Contact privacy@[domain]."', location:'Privacy Policy → “Contact Us” (role not labeled DPO)'}}},
  {id:'gdpr-s5', code:'Ch. V', text:'International transfer safeguards disclosed', sev:'high', na:false,
    layman:'If you send European users’ data to a country outside the EU (like the US), you need a legal safeguard in place so it stays protected once it leaves.',
    articleTitle:'GDPR Chapter V — Transfers of personal data to third countries',
    articleText:'Transfers outside the EEA are only allowed where the destination has an adequacy decision, or where safeguards like Standard Contractual Clauses (SCCs) or binding corporate rules are in place.',
    proposals:['Identify every vendor/subprocessor that stores or processes EU user data outside the EEA.', 'Put Standard Contractual Clauses in place with each vendor and reference them in your privacy policy.'],
    hints:{partial:'Transfers outside the EEA are mentioned but the underlying safeguard isn’t named.', fail:'Cross-border data transfers detected with no documented safeguard.'},
    evidence:{
      fail:{snippet:'"Your data may be transferred to and processed in other countries."', location:'Privacy Policy → “International Users” (no safeguard named)'},
      partial:{snippet:'"...in accordance with applicable data protection laws."', location:'Privacy Policy → “International Users”'}}},
  {id:'gdpr-s6', code:'Art. 30', text:'Records-of-processing commitment referenced in policy', sev:'med', na:false,
    layman:'You’re expected to keep an internal record of what personal data you collect, why, and where it goes — like an inventory of your own data practices.',
    articleTitle:'GDPR Article 30 — Records of processing activities',
    articleText:'Organizations must maintain a record of processing activities, including purposes, categories of data and recipients, and retention periods, available to regulators on request.',
    proposals:['Build an internal record cataloging each processing activity, purpose, and retention period.', 'Reference the existence of this record in your public privacy policy.'],
    hints:{partial:'A general commitment exists but the inventory scope looks incomplete.', fail:'No reference to a records-of-processing practice found.'},
    evidence:{
      fail:{snippet:'(No mention of a data inventory or records-of-processing practice)', location:'Privacy Policy, full text'},
      partial:{snippet:'"We maintain internal records of our data practices."', location:'Privacy Policy → “Our Commitment” (no scope or detail given)'}}},
  {id:'gdpr-s7', code:'Art. 33', text:'Breach notification procedure documented', sev:'high', na:false,
    layman:'If you have a data breach, you’re required to tell the relevant regulator within 72 hours of finding out — and in serious cases, tell affected users too.',
    articleTitle:'GDPR Article 33 — Notification of a personal data breach',
    articleText:'In the event of a breach likely to result in risk to individuals, the controller must notify the supervisory authority within 72 hours, and in high-risk cases, notify affected individuals directly.',
    proposals:['Write an incident-response runbook naming who owns the 72-hour regulator notification.', 'State your breach-notification commitment explicitly in the privacy policy.'],
    hints:{partial:'A breach process is referenced but the 72-hour window isn’t specified.', fail:'No documented data breach notification procedure found.'},
    evidence:{
      fail:{snippet:'(No breach-notification commitment found)', location:'Privacy Policy / Security page'},
      partial:{snippet:'"We take reasonable steps to notify affected users of a security incident."', location:'Security page (72-hour regulator window not mentioned)'}}},
];

const GDPR_CHECKLIST = [
  {id:'gdpr-a1', code:'Art. 15', text:'Self-serve right to access — users can view/download their data from account settings', sev:'med',
    layman:'Users should be able to see and download a copy of what data you hold about them without emailing support and waiting.',
    articleTitle:'GDPR Article 15 — Right of access',
    articleText:'Individuals have the right to obtain confirmation of whether their data is being processed, and access to that data along with details of how it’s used.',
    proposals:['Add a "View my data" / "Download my data" action inside account settings.', 'Make sure the export covers all data categories you actually hold.'],
    guidance:'Typically: an Account → Privacy or Data page with a "View my data" / "Download my data" action that works without emailing support.',
    followUp:'Is this available directly in account settings, and does it complete without a person manually processing it?',
    pos:['self-serve','self serve','instant','automatic','download','account settings','without contacting','no support','button','export'],
    neg:['email support','contact us','support ticket','manually','request via email','support team processes']},
  {id:'gdpr-a2', code:'Art. 17', text:'Self-serve right to erasure — users can delete their account/data without contacting support', sev:'high',
    layman:'Users should be able to delete their account and data themselves, without needing a person on your team to process it manually.',
    articleTitle:'GDPR Article 17 — Right to erasure ("right to be forgotten")',
    articleText:'Individuals can request deletion of their personal data where it’s no longer needed, consent is withdrawn, or processing was unlawful, subject to limited exceptions.',
    proposals:['Add a self-serve "Delete my account" flow in settings with a clear stated timeline.', 'Document legal exceptions (e.g. billing records) so requests are handled consistently.'],
    guidance:'Typically: a "Delete my account" button in account settings that deletes immediately or within a stated window, with no email required.',
    followUp:'Can a user complete deletion entirely within your product UI, or does someone on your team take a manual step?',
    pos:['delete my account','self-serve','automatic','instant','account settings','button','without contacting'],
    neg:['email support','contact us','support ticket','manually processed','case-by-case']},
  {id:'gdpr-a3', code:'Art. 20', text:'Self-serve data portability — structured export (e.g. CSV/JSON)', sev:'low',
    layman:'If a user wants to take their data to another service, you need to give it to them in a format a computer can read — not just a PDF.',
    articleTitle:'GDPR Article 20 — Right to data portability',
    articleText:'Individuals have the right to receive their data in a structured, commonly used, machine-readable format, and to transmit it to another controller.',
    proposals:['Build a CSV or JSON export option alongside (or replacing) any PDF export.', 'Make the export accessible directly from account settings.'],
    guidance:'Typically: an export producing a machine-readable file (CSV/JSON) from account settings, not a manually compiled PDF.',
    followUp:'Does the export come out as a structured, machine-readable file, or as something a person put together?',
    pos:['csv','json','export','machine-readable','structured','download','self-serve'],
    neg:['pdf summary','manually compiled','email attachment','support prepares']},
  {id:'gdpr-a4', code:'Art. 7 (ongoing)', text:'Granular consent preference center — marketing/analytics/tracking toggled independently', sev:'med',
    layman:'Users should be able to manage privacy preferences (like marketing vs. analytics tracking) individually, not just one all-or-nothing toggle.',
    articleTitle:'GDPR Article 7 (ongoing) — Withdrawing and managing consent',
    articleText:'Consent must be as easy to withdraw as to give, and where multiple purposes exist, consent should be obtainable and withdrawable separately for each.',
    proposals:['Build a preferences page with independent toggles per category (marketing, analytics, personalization).', 'Make sure withdrawing one consent doesn’t silently affect unrelated settings.'],
    guidance:'Typically: a preferences page where each consent category has its own toggle, not one blanket accept-all switch.',
    followUp:'Can a user turn off, say, marketing while keeping analytics on, independently of each other?',
    pos:['toggle','independently','granular','separate','preference center','opt out of','turn off'],
    neg:['all or nothing','single toggle','accept all only','one setting']},
];

const CCPA_SCANNED = [
  {id:'ccpa-s1', code:'§1798.135', text:'"Do Not Sell or Share My Personal Information" link present', sev:'high', na:false,
    layman:'California users need a clearly visible link letting them opt out of having their data sold or shared — usually in the footer.',
    articleTitle:'CCPA §1798.135 — Right to opt-out',
    articleText:'Businesses that sell or share personal information must provide a clear and conspicuous "Do Not Sell or Share My Personal Information" link allowing consumers to opt out.',
    proposals:['Move the opt-out link out of a buried sub-menu into the main footer.', 'Make sure the link actually triggers the opt-out rather than just linking to an explainer page.'],
    hints:{partial:'The link exists but is buried in footer navigation rather than prominent.', fail:'No "Do Not Sell or Share My Personal Information" link found.'},
    evidence:{
      fail:{snippet:'(No "Do Not Sell or Share My Personal Information" link found in the footer or elsewhere)', location:'Site-wide footer'},
      partial:{snippet:'"Your Privacy Choices"', location:'Footer link (routes to a generic settings page, not a direct opt-out)'}}},
  {id:'ccpa-s2', code:'§1798.100', text:'Notice at collection describing categories and purposes', sev:'high', na:false,
    layman:'Before or when you collect someone’s data, you need to tell them what categories you’re collecting and why — not bury it in a long policy.',
    articleTitle:'CCPA §1798.100 — Notice at collection',
    articleText:'Businesses must inform consumers, at or before the point of collection, of the categories of personal information collected and the purposes they’ll be used for.',
    proposals:['Add a short notice at each data-collection point (forms, sign-up) listing what’s collected and why.', 'Cross-check the notice against everything actually being collected.'],
    hints:{partial:'A notice is present but doesn’t list all categories of personal information collected.', fail:'No notice at collection shown before or at the point of data collection.'},
    evidence:{
      fail:{snippet:'(No notice shown at or before the point of collection on the sign-up form)', location:'Sign-up / account creation form'},
      partial:{snippet:'"By continuing you agree to our Privacy Policy."', location:'Sign-up form (categories of data collected not listed inline)'}}},
  {id:'ccpa-s3', code:'§1798.125', text:'Non-discrimination commitment stated in policy', sev:'med', na:false,
    layman:'You’re not allowed to punish users — like giving them a worse product or higher prices — just because they exercised their privacy rights.',
    articleTitle:'CCPA §1798.125 — Non-discrimination',
    articleText:'Businesses may not deny goods or services, charge different prices, or provide a different level of service because a consumer exercised a CCPA right.',
    proposals:['Add an explicit non-discrimination statement to the privacy policy.', 'Audit account tiers/pricing to confirm opting out doesn’t quietly downgrade the experience.'],
    hints:{partial:'Policy language exists but doesn’t explicitly rule out degraded service for opt-outs.', fail:'No non-discrimination commitment found in the policy.'},
    evidence:{
      fail:{snippet:'(No non-discrimination statement found anywhere in the policy text)', location:'Privacy Policy, full text'},
      partial:{snippet:'"We may adjust the services available to you based on your settings."', location:'Privacy Policy → “Your Choices” (doesn’t rule out degraded service)'}}},
  {id:'ccpa-s4', code:'§1798.121', text:'Sensitive personal information opt-out link present', sev:'high', na:false,
    layman:'Beyond the general opt-out, California users get an extra right to limit how you use more sensitive info (health, precise location, financial data).',
    articleTitle:'CCPA §1798.121 — Right to limit use of sensitive personal information',
    articleText:'Consumers have the right to direct a business to limit its use of sensitive personal information to what’s necessary to provide the requested goods or services.',
    proposals:['Add a distinct "Limit the Use of My Sensitive Personal Information" link, separate from the general opt-out.', 'Confirm what counts as sensitive PI in your data model first.'],
    hints:{partial:'A "limit use" link is present but not clearly distinguished from the general opt-out.', fail:'No link to limit use of sensitive personal information found.'},
    evidence:{
      fail:{snippet:'(No "Limit the Use of My Sensitive Personal Information" link found)', location:'Footer / Privacy Choices page'},
      partial:{snippet:'"Manage your privacy settings here."', location:'Account → Privacy Choices (sensitive-PI limit not called out separately)'}}},
  {id:'ccpa-s5', code:'§1798.125(b)', text:'Financial incentive program disclosure (if applicable)', sev:'low', na:true,
    layman:'If you offer users a discount or perk in exchange for their data (like a loyalty program), you have to clearly explain that trade-off.',
    articleTitle:'CCPA §1798.125(b) — Financial incentive disclosures',
    articleText:'Businesses offering financial incentives in exchange for personal information must disclose the material terms of the program and obtain opt-in consent.',
    proposals:['If you run a loyalty/rewards program, publish the specific data-for-benefit terms.', 'Add an explicit opt-in step before enrolling users in any incentive program involving their data.'],
    hints:{partial:'A loyalty/rewards program exists but incentive terms aren’t fully disclosed.', fail:'A financial incentive program was detected without the required disclosure.'},
    evidence:{
      fail:{snippet:'"Earn points and rewards for your activity."', location:'Loyalty program page (no data-for-benefit disclosure)'},
      partial:{snippet:'"Rewards program terms available on request."', location:'Loyalty program page (terms not published up front)'}}},
];

const CCPA_CHECKLIST = [
  {id:'ccpa-a1', code:'§1798.110', text:'Self-serve right to know/access from account settings', sev:'med',
    layman:'California users should be able to see what categories of data you have on them directly from their account, not by filing a request and waiting.',
    articleTitle:'CCPA §1798.110 — Right to know',
    articleText:'Consumers have the right to request the specific pieces and categories of personal information a business has collected about them.',
    proposals:['Add a "What we know about you" view inside account settings.', 'Keep it in sync with what’s actually collected, not a static summary.'],
    guidance:'Typically: an account page listing categories of personal info collected, viewable/downloadable without contacting support.',
    followUp:'Can a user see this directly in their account, or does it require submitting a request and waiting?',
    pos:['self-serve','account settings','view','download','automatic','without contacting'],
    neg:['email','contact us','support ticket','wait for response','manually']},
  {id:'ccpa-a2', code:'§1798.105', text:'Self-serve right to delete from account settings', sev:'high',
    layman:'Users should be able to delete their account and personal data themselves, directly in the product, not by emailing support.',
    articleTitle:'CCPA §1798.105 — Right to delete',
    articleText:'Consumers have the right to request deletion of personal information collected about them, subject to certain business exceptions.',
    proposals:['Add a self-serve account deletion flow with a clear completion timeline.', 'List legal retention exceptions so deletion requests are handled consistently.'],
    guidance:'Typically: a "Delete my account" option in settings that completes the request without emailing support.',
    followUp:'Does deletion happen directly through account settings, or does someone process it manually?',
    pos:['delete my account','self-serve','automatic','account settings','button'],
    neg:['email','contact us','support ticket','manually','case-by-case']},
  {id:'ccpa-a3', code:'§1798.106', text:'Self-serve right to correct from account settings', sev:'med',
    layman:'Users should be able to fix wrong information about themselves directly, not have to ask someone on your team to do it.',
    articleTitle:'CCPA §1798.106 — Right to correct',
    articleText:'Consumers have the right to request correction of inaccurate personal information a business maintains about them.',
    proposals:['Make profile fields directly editable wherever possible.', 'For fields that can’t be self-edited, add a lightweight correction-request form inside the account.'],
    guidance:'Typically: an editable profile/settings page where users can directly correct inaccurate personal information.',
    followUp:'Can users edit this themselves in their account, or does your team make the change?',
    pos:['edit','self-serve','account settings','directly','update'],
    neg:['email','contact us','support makes the change','manually']},
  {id:'ccpa-a4', code:'§1798.121', text:'Sensitive-PI "limit use" toggle actually functions (not just a static link)', sev:'med',
    layman:'The "limit use of sensitive info" option needs to be a real, working setting — not just a link to a policy page that doesn’t change anything.',
    articleTitle:'CCPA §1798.121 — Right to limit use of sensitive personal information (functional check)',
    articleText:'The right to limit use of sensitive personal information must be operable by the consumer, not merely described.',
    proposals:['Wire the "limit use" toggle to an actual backend flag that changes how sensitive data is used/shared.', 'Add confirmation feedback when a user turns the toggle on.'],
    guidance:'Typically: a real toggle in account/privacy settings that restricts use of sensitive personal information, not just an informational link.',
    followUp:'Is this an actual working toggle in the account, or just a link to a policy page?',
    pos:['toggle','setting','account','functions','actually limits','opt out'],
    neg:['just a link','static page','informational only','no setting']},
];

/* Real, publicly reported enforcement actions — cited for comparison to the
   TYPE of violation a given requirement covers, not as any claim that a
   scanned site is connected to these companies or committed these specific
   violations. Amounts/outcomes as originally announced by the regulator;
   some remain under appeal. Sourced from each regulator's published decision
   — see README.md for why this replaced the earlier composite placeholders. */
const FINES = {
  'gdpr-s1': {who:'Clearview AI', violation:'Collected and processed facial-recognition data with no valid legal basis', fine:'€20M', amount:20000000, currency:'EUR', regulator:'French data protection authority (CNIL)', year:2022},
  'gdpr-s2': {who:'Amazon Europe Core', violation:'Advertising/tracking practices processed data without a valid consent basis', fine:'€746M', amount:746000000, currency:'EUR', regulator:'Luxembourg data protection authority (CNPD)', year:2021},
  'gdpr-s3': {who:'Google LLC', violation:'Insufficient transparency and invalid consent for ad personalization', fine:'€50M', amount:50000000, currency:'EUR', regulator:'French data protection authority (CNIL)', year:2019},
  'gdpr-s5': {who:'Meta Platforms Ireland', violation:'Transferred EU user data to the US without adequate safeguards', fine:'€1.2B', amount:1200000000, currency:'EUR', regulator:'Irish Data Protection Commission', year:2023},
  'gdpr-s7': {who:'British Airways', violation:'Security failures enabled a breach exposing customer payment data', fine:'£20M', amount:20000000, currency:'GBP', regulator:'UK Information Commissioner’s Office', year:2020},
  'ccpa-s1': {who:'Sephora, Inc.', violation:'Failed to process "Do Not Sell" opt-outs, including via Global Privacy Control', fine:'$1.2M', amount:1200000, currency:'USD', regulator:'California Attorney General', year:2022},
  'ccpa-s2': {who:'DoorDash, Inc.', violation:'Sold personal information via a marketing co-op without required notice', fine:'$375K', amount:375000, currency:'USD', regulator:'California Attorney General', year:2024},
  'ccpa-a2': {who:'American Honda Motor Co.', violation:'Imposed excessive verification burdens on consumers exercising deletion rights', fine:'$632.5K', amount:632500, currency:'USD', regulator:'California Attorney General', year:2023},
};

const BILLS = [
  {name:'EU AI Act — high-risk system obligations', region:'EU', status:'Enforcement phasing in', effective:'Phased 2025–2027',
   summary:'Sets tiered obligations for AI systems by risk level, with the strictest rules applying to "high-risk" use cases like automated decision-making.',
   relevance:'Relevant if the site uses AI-driven personalization, scoring, or automated decisions on EU users.',
   prep:'Inventory AI-driven features on the site and classify each by risk tier.'},
  {name:'American Privacy Rights Act (APRA)', region:'US-Federal', status:'Proposed', effective:'TBD',
   summary:'A proposed federal privacy standard that would preempt parts of the current state-by-state patchwork.',
   relevance:'Would eventually replace or layer on top of state laws currently used for compliance.',
   prep:'Track committee status; avoid building compliance solely around the current state patchwork.'},
  {name:'Colorado Privacy Act — profiling amendments', region:'US-Colorado', status:'In effect', effective:'2024–2026 phased',
   summary:'Adds specific obligations around profiling used for consequential decisions (housing, employment, credit, etc).',
   relevance:'Applies if the site profiles Colorado residents for decisions with legal or similarly significant effects.',
   prep:'Add an opt-out specifically for profiling used in consequential decisions.'},
  {name:'California Delete Act (SB 362)', region:'US-California', status:'Passed, phasing in', effective:'2026',
   summary:'Creates a one-click deletion mechanism across registered data brokers via the DROP portal.',
   relevance:'Relevant if the site sells or shares data with registered data brokers.',
   prep:'Confirm data-broker registration status if the site shares data with brokers.'},
  {name:'California AI Transparency Act (SB 942)', region:'US-California', status:'In effect', effective:'2026',
   summary:'Requires provenance disclosures and detection tools for generative AI content offered to California users.',
   relevance:'Relevant if the site offers generative AI features to California users.',
   prep:'Add AI content provenance disclosures if generative features are in use.'},
  {name:'LGPD enforcement ramp-up', region:'Brazil', status:'In effect', effective:'Ongoing',
   summary:'Brazil’s national data protection authority (ANPD) continuing to increase enforcement activity and guidance.',
   relevance:'Relevant if the site serves Brazilian users or processes their data.',
   prep:'Confirm a data controller is designated for Brazilian operations.'},
  {name:'Consumer Privacy Protection Act (Bill C-27)', region:'Canada', status:'Proposed / reintroduction expected', effective:'TBD',
   summary:'Would modernize PIPEDA with GDPR-like rights including stronger consent and portability provisions.',
   relevance:'Would raise the bar above current PIPEDA obligations if the site serves Canadian users.',
   prep:'Monitor status; current PIPEDA obligations still apply in the meantime.'},
  {name:'UK Data (Use and Access) reforms', region:'UK', status:'Passed, phasing in', effective:'2025–2026',
   summary:'Adjusts UK GDPR in areas like cookie-consent exemptions and legitimate-interest processing.',
   relevance:'Relevant if the site processes UK residents’ data under UK GDPR, which is diverging gradually from EU GDPR.',
   prep:'Watch for updated cookie-consent exemption rules that may simplify some banners.'},
];

const TRUST_CATS = [
  {id:'minimization', name:'Data minimization',
   notes:{good:'Collection appears scoped to stated purposes — keep auditing fields as forms change.',
           moderate:'Some optional fields are collected without a clearly stated purpose. Tag each field with a retention/purpose reason.',
           weak:'Forms request more data than the stated purpose requires. Cut optional fields and require justification for any new one added.'}},
  {id:'consent', name:'Consent clarity',
   notes:{good:'Consent language is specific and avoids bundling unrelated permissions together.',
           moderate:'Consent copy is understandable but bundles marketing and functional cookies together — separate them.',
           weak:'Consent language is dense legal text with no plain-language summary above it.'}},
  {id:'rights', name:'User rights support',
   notes:{good:'Access, delete, and export flows are self-service and confirm completion to the user.',
           moderate:'Rights exist but require emailing support, which adds friction and delay.',
           weak:'No visible self-service path exists for users to exercise their data rights.'}},
  {id:'thirdparty', name:'Third-party transparency',
   notes:{good:'Sub-processors and ad/analytics partners are named with an up-to-date list.',
           moderate:'Third parties are referenced generically ("partners") without a named list.',
           weak:'There is no disclosure of which third parties receive user data.'}},
  {id:'retention', name:'Retention specificity',
   notes:{good:'Retention periods are stated per data category, not just "as long as necessary."',
           moderate:'A general retention statement exists but isn’t broken out by data type.',
           weak:'No retention period is stated anywhere in the policy.'}},
];

/* Fallback comparison set for the "vs. Competitors" tab, used until the user
   types in real competitor names for the site being reviewed (see the manual
   add box on that tab) — generic labels, not real companies, since without
   that input we have no idea who a given scanned site actually competes
   with. "Sector median" is always shown as a benchmark line, real names or
   not. See CHANGELOG for why this tab exists ahead of SPEC.md's Phase 4 item;
   scores are simulated either way — see the disclaimer on that tab. */
const GENERIC_COMPETITOR_LABELS = ['Competitor A', 'Competitor B', 'Competitor C'];
const SECTOR_MEDIAN_LABEL = 'Sector median';


/* How literally a finding must match the letter of the law.
   `threshold` is the share of a requirement phrase's meaningful words that
   must appear for a paraphrase to count (see fuzzyPhraseMatch in
   reviewer.js). `exactOnly` disables paraphrase matching entirely, so only
   the statutory wording counts.

   The canonical example: a footer link reading "Do Not Sell My Information"
   against a statute that says "Do Not Sell My Personal Information."
   Strict flags it; lenient accepts it. Neither reading is wrong — it's a
   posture choice, and it belongs to the user rather than hardcoded in the
   matcher. */
const STRICTNESS_LEVELS = {
  1: {label:'Lenient', threshold:0.4, exactOnly:false,
      blurb:'Accepts loose paraphrases. Closest to how enforcement usually behaves in practice.',
      example:'“Do Not Sell My Info” satisfies the §1798.135 opt-out link.'},
  2: {label:'Relaxed', threshold:0.5, exactOnly:false,
      blurb:'Accepts most equivalent wording, but expects the key terms to be present.',
      example:'“Do Not Sell My Information” passes; “Your Choices” alone does not.'},
  3: {label:'Balanced', threshold:0.6, exactOnly:false,
      blurb:'Equivalent language passes; vague or partial language is flagged. The default.',
      example:'“Do Not Sell My Information” passes as equivalent to “…My Personal Information.”'},
  4: {label:'Careful', threshold:0.8, exactOnly:false,
      blurb:'Expects nearly the statutory phrasing. Surfaces wording gaps a regulator could question.',
      example:'“Do Not Sell My Information” is flagged for omitting “Personal.”'},
  5: {label:'Letter of the law', threshold:1, exactOnly:true,
      blurb:'Only the statutory wording counts. Surfaces every technical deviation, including ones unlikely to be enforced.',
      example:'Only the exact phrase “Do Not Sell My Personal Information” passes.'},
};
const DEFAULT_STRICTNESS = 3;

/* Severity weighting is fixed rather than user-adjustable: the Settings
   slider it used to occupy now controls strictness, which is a different
   question ("how literally do we read this") from severity ("how bad is
   this"). See ROADMAP.md. */
const DEFAULT_SEV_WEIGHT = {high:3, med:2, low:1};
const SEV_LABEL = {high:'High severity', med:'Medium severity', low:'Low severity'};
const STALE_DAYS = 90;
