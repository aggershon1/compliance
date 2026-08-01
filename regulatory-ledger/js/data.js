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
    guide:{partial:'Lawful basis is referenced generically, but not mapped to each processing purpose.', fail:'No lawful basis is documented for your processing activities.'}},
  {id:'gdpr-s2', code:'Art. 7 / ePrivacy', text:'Granular consent mechanism for cookies and trackers', sev:'high', na:false,
    layman:'If your site uses cookies or trackers that aren’t strictly necessary, you need to ask permission first — and it has to be a real choice, not a pre-checked box.',
    articleTitle:'GDPR Art. 7 & ePrivacy Directive — Conditions for consent',
    articleText:'Consent must be freely given, specific, informed, and unambiguous, shown through a clear affirmative action. It must be as easy to withdraw as to give, and bundling unrelated consents together isn’t allowed.',
    proposals:['Make "Reject All" as prominent and one-click as "Accept All" in the cookie banner.', 'Split consent into categories (functional, analytics, marketing) so users can accept some and decline others.'],
    guide:{partial:'A cookie banner exists, but without granular accept/reject-by-category controls.', fail:'No compliant consent mechanism exists, or trackers fire before consent is given.'}},
  {id:'gdpr-s3', code:'Art. 13', text:'Privacy notice covers all processing purposes in plain language', sev:'med', na:false,
    layman:'Your privacy policy needs to actually explain, in plain language, everything you do with someone’s data — not just exist as a formality.',
    articleTitle:'GDPR Article 13 — Information to be provided',
    articleText:'When collecting data directly from someone, you must tell them who you are, why you’re collecting their data, how long you’ll keep it, who it’s shared with, and what rights they have.',
    proposals:['Audit every data collection point on the site and confirm each purpose is named in the privacy notice.', 'Add a plain-language summary at the top of the policy, above the legal text.'],
    guide:{partial:'The notice covers most processing, but omits some data you actually collect.', fail:'The privacy notice is missing, or does not match how the site actually behaves.'}},
  {id:'gdpr-s4', code:'Art. 37', text:'DPO contact designated and published', sev:'low', na:true,
    layman:'If your organization processes a lot of sensitive or large-scale personal data, you may be required to name a specific person responsible for privacy — and publish how to reach them.',
    articleTitle:'GDPR Article 37 — Designation of the data protection officer',
    articleText:'Certain organizations — including those doing large-scale monitoring or processing special categories of data — must appoint a Data Protection Officer and publish their contact details.',
    proposals:['Confirm whether your processing volume/type actually triggers the DPO requirement.', 'If required, publish a named or role-based contact (e.g. privacy@yourcompany.com) in the privacy policy.'],
    guide:{partial:'A privacy contact is listed, but not clearly designated as DPO.', fail:'No Data Protection Officer or privacy contact is designated.'}},
  {id:'gdpr-s5', code:'Ch. V', text:'International transfer safeguards disclosed', sev:'high', na:false,
    layman:'If you send European users’ data to a country outside the EU (like the US), you need a legal safeguard in place so it stays protected once it leaves.',
    articleTitle:'GDPR Chapter V — Transfers of personal data to third countries',
    articleText:'Transfers outside the EEA are only allowed where the destination has an adequacy decision, or where safeguards like Standard Contractual Clauses (SCCs) or binding corporate rules are in place.',
    proposals:['Identify every vendor/subprocessor that stores or processes EU user data outside the EEA.', 'Put Standard Contractual Clauses in place with each vendor and reference them in your privacy policy.'],
    guide:{partial:'Transfers outside the EEA are mentioned, but the underlying safeguard isn’t named.', fail:'Cross-border transfers happen with no documented safeguard.'}},
  {id:'gdpr-s6', code:'Art. 30', text:'Records-of-processing commitment referenced in policy', sev:'med', na:false,
    layman:'You’re expected to keep an internal record of what personal data you collect, why, and where it goes — like an inventory of your own data practices.',
    articleTitle:'GDPR Article 30 — Records of processing activities',
    articleText:'Organizations must maintain a record of processing activities, including purposes, categories of data and recipients, and retention periods, available to regulators on request.',
    proposals:['Build an internal record cataloging each processing activity, purpose, and retention period.', 'Reference the existence of this record in your public privacy policy.'],
    guide:{partial:'A general commitment exists, but the inventory’s scope is incomplete.', fail:'No records-of-processing practice is referenced anywhere.'}},
  {id:'gdpr-s7', code:'Art. 33', text:'Breach notification procedure documented', sev:'high', na:false,
    layman:'If you have a data breach, you’re required to tell the relevant regulator within 72 hours of finding out — and in serious cases, tell affected users too.',
    articleTitle:'GDPR Article 33 — Notification of a personal data breach',
    articleText:'In the event of a breach likely to result in risk to individuals, the controller must notify the supervisory authority within 72 hours, and in high-risk cases, notify affected individuals directly.',
    proposals:['Write an incident-response runbook naming who owns the 72-hour regulator notification.', 'State your breach-notification commitment explicitly in the privacy policy.'],
    guide:{partial:'A breach process is referenced, but the 72-hour window isn’t specified.', fail:'No breach-notification procedure is documented.'}},
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
    guide:{partial:'The link exists, but is buried rather than clear and conspicuous.', fail:'No "Do Not Sell or Share My Personal Information" link is present.'}},
  {id:'ccpa-s2', code:'§1798.100', text:'Notice at collection describing categories and purposes', sev:'high', na:false,
    layman:'Before or when you collect someone’s data, you need to tell them what categories you’re collecting and why — not bury it in a long policy.',
    articleTitle:'CCPA §1798.100 — Notice at collection',
    articleText:'Businesses must inform consumers, at or before the point of collection, of the categories of personal information collected and the purposes they’ll be used for.',
    proposals:['Add a short notice at each data-collection point (forms, sign-up) listing what’s collected and why.', 'Cross-check the notice against everything actually being collected.'],
    guide:{partial:'A notice is present, but doesn’t list every category of personal information collected.', fail:'No notice is shown at or before the point of collection.'}},
  {id:'ccpa-s3', code:'§1798.125', text:'Non-discrimination commitment stated in policy', sev:'med', na:false,
    layman:'You’re not allowed to punish users — like giving them a worse product or higher prices — just because they exercised their privacy rights.',
    articleTitle:'CCPA §1798.125 — Non-discrimination',
    articleText:'Businesses may not deny goods or services, charge different prices, or provide a different level of service because a consumer exercised a CCPA right.',
    proposals:['Add an explicit non-discrimination statement to the privacy policy.', 'Audit account tiers/pricing to confirm opting out doesn’t quietly downgrade the experience.'],
    guide:{partial:'Policy language exists, but doesn’t rule out degraded service for opt-outs.', fail:'No non-discrimination commitment appears in the policy.'}},
  {id:'ccpa-s4', code:'§1798.121', text:'Sensitive personal information opt-out link present', sev:'high', na:false,
    layman:'Beyond the general opt-out, California users get an extra right to limit how you use more sensitive info (health, precise location, financial data).',
    articleTitle:'CCPA §1798.121 — Right to limit use of sensitive personal information',
    articleText:'Consumers have the right to direct a business to limit its use of sensitive personal information to what’s necessary to provide the requested goods or services.',
    proposals:['Add a distinct "Limit the Use of My Sensitive Personal Information" link, separate from the general opt-out.', 'Confirm what counts as sensitive PI in your data model first.'],
    guide:{partial:'A "limit use" link is present, but not distinguished from the general opt-out.', fail:'No link to limit use of sensitive personal information is present.'}},
  {id:'ccpa-s5', code:'§1798.125(b)', text:'Financial incentive program disclosure (if applicable)', sev:'low', na:true,
    layman:'If you offer users a discount or perk in exchange for their data (like a loyalty program), you have to clearly explain that trade-off.',
    articleTitle:'CCPA §1798.125(b) — Financial incentive disclosures',
    articleText:'Businesses offering financial incentives in exchange for personal information must disclose the material terms of the program and obtain opt-in consent.',
    proposals:['If you run a loyalty/rewards program, publish the specific data-for-benefit terms.', 'Add an explicit opt-in step before enrolling users in any incentive program involving their data.'],
    guide:{partial:'A loyalty/rewards program exists, but incentive terms aren’t fully disclosed.', fail:'A financial incentive program runs without the required disclosure.'}},
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

/* ============================================================
   CRAWL RULES (matched against text the crawler actually retrieved)
   ============================================================
   Phrases, not regexes, so the Settings strictness dial governs how
   literally they must appear — the same matcher used for self-attestations
   (`countMatches` in reviewer.js). At "Letter of the law" only the
   statutory wording counts; at "Lenient" a paraphrase does. This is where
   the "Do Not Sell My Information" vs "…My Personal Information" question
   actually gets decided, now against real page text.

   Per rule:
   - scope: 'policy' searches retrieved policy pages, 'any' searches every
     retrieved page, 'links' searches link text across the site.
   - cap: the best status a match can earn, where presence is detectable
     but sufficiency isn't (a policy existing says nothing about whether
     it's complete).
   - needs: 'policy' means the requirement is NOT determinable unless a
     policy page was actually retrieved — a crawl that found no policy
     reports Unassessed, never Fail.
   - analystLiftsCap: the Partial cap exists because phrase matching can't
     *read* — a reviewer that actually reads the document can settle it, so
     the cap is lifted when the analyst produced the finding. Rules whose
     cap is about something outside the document (whether trackers fire
     before consent, whether a form behind a login carries a notice) keep
     it, because no amount of reading answers those.
   - limitation: shown alongside the result when the crawl can only
     partially answer the question. */
const CRAWL_RULES = {
  'gdpr-s1': {scope:'policy', needs:'policy', cap:'Partial', analystLiftsCap:true,
    strong:['lawful basis','legal basis for processing'],
    weak:['legitimate interest','legitimate interests'],
    limitation:'A crawl can find lawful-basis language, but not whether every processing purpose is mapped to a basis. Confirm and record the real status.'},
  'gdpr-s2': {scope:'any', cap:'Partial',
    strong:['cookie consent','manage cookies','cookie preferences','reject all'],
    weak:['cookie policy','we use cookies'],
    trackerScripts:['googletagmanager','google-analytics','facebook.net','doubleclick','hotjar','segment.com','mixpanel'],
    cmpScripts:['onetrust','cookiebot','didomi','usercentrics','cookieyes','trustarc','klaro'],
    limitation:'Fetching a page cannot show whether trackers fire before consent, or whether "Reject All" is as easy as "Accept All" — that needs a real browser session. Treat this as evidence a banner exists, not proof it is compliant.'},
  'gdpr-s3': {scope:'policy', needs:'policy', cap:'Partial', analystLiftsCap:true,
    strong:['privacy policy','privacy notice'],
    weak:['how we use your information','how we use your data'],
    limitation:'The crawl confirms a policy exists and was readable. Whether it covers every processing purpose in plain language is a judgment only you can make.'},
  'gdpr-s4': {scope:'policy', needs:'policy',
    strong:['data protection officer','dpo@'],
    weak:['privacy@','privacy team'],
    limitation:'Finding a contact does not confirm the role is formally designated as required.'},
  'gdpr-s5': {scope:'policy', needs:'policy',
    strong:['standard contractual clauses','binding corporate rules','adequacy decision'],
    weak:['international transfers','transfer your data outside','outside the eea'],
    limitation:'The phrase being present does not mean the safeguards are actually executed and adequate.'},
  'gdpr-s6': {scope:'policy', needs:'policy',
    strong:['records of processing','record of processing activities'],
    weak:['processing register','data inventory'],
    limitation:'Records of processing are an internal document; a public policy rarely evidences them either way.'},
  'gdpr-s7': {scope:'policy', needs:'policy',
    strong:['breach notification','notify the supervisory authority','personal data breach'],
    weak:['security incident','72 hours'],
    limitation:'A stated commitment is not evidence of a working incident-response process.'},
  'ccpa-s1': {scope:'links', needs:'homepage',
    strong:['do not sell or share my personal information','do not sell my personal information'],
    weak:['do not sell my info','your privacy choices','do not sell'],
    limitation:'The crawl checks the link exists and how it is worded. Whether it actually processes an opt-out is not verifiable this way.'},
  'ccpa-s2': {scope:'policy', needs:'policy', cap:'Partial',
    strong:['notice at collection'],
    weak:['categories of personal information'],
    limitation:'Notice-at-collection must appear at the point of collection — often on forms behind interactions a crawl does not reach.'},
  'ccpa-s3': {scope:'policy', needs:'policy',
    strong:['will not discriminate','non-discrimination','not discriminate against you'],
    weak:['same level of service','equal service']},
  'ccpa-s4': {scope:'links', needs:'homepage',
    strong:['limit the use of my sensitive personal information'],
    weak:['sensitive personal information'],
    limitation:'As with the opt-out link, presence and wording are checkable; whether the control functions is not.'},
  'ccpa-s5': {scope:'policy', needs:'policy',
    strong:['financial incentive'],
    weak:['loyalty program','rewards program'],
    limitation:'If no incentive program exists this requirement may simply not apply — record NA if that is the case.'},
};

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
