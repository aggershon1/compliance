'use strict';
/* ============================================================
   LEGISLATION WATCH
   ============================================================
   ROADMAP item 1. The point of it, in the roadmap's words: "Notify when a
   bill relevant to your jurisdictions lands on the docket, changes status,
   or is approaching its effective date — so compliance work can start
   before the deadline rather than after."

   ---- What this is, and what it deliberately isn't ---------------------
   The roadmap asked for "a real ingestion pipeline (state legislature
   feeds, EU Official Journal, regulator enforcement pages)". A parser per
   source, producing structured bill records, is the version that sounds
   right — and it is the version this project must not ship without being
   able to verify it. A bill status this tool invented, or scraped wrong
   and rendered confidently, is a compliance decision made on a fiction.
   That is the v0.9.0 failure with legal deadlines attached.

   So this watches pages and reports **what changed**, quoting it. It makes
   no claim to have parsed a bill, understood its status, or know its
   effective date. "This page changed, here are the lines that appeared"
   is checkable by clicking through, which is the standard everything else
   here is held to.

   The `BILLS` list in js/data.js stays exactly what it has always been:
   seed data, labelled as such. Watches are the real half.

   ---- No accounts, no email --------------------------------------------
   The roadmap also wanted "accounts and a delivery channel (email/Slack)".
   Both are out of scope here: this service binds to loopback and holds no
   user data by design, and adding SMTP credentials to it would be a
   different product. Alerts surface in the app on check. Scheduling is
   whatever runs the check — a cron entry calling /api/legislation/check
   works today.
   ============================================================ */

const fs = require('node:fs');
const path = require('node:path');
const { fetchPage, extractText } = require('./crawler.js');

const STATE_FILE = process.env.WATCH_STATE_FILE || path.join(__dirname, '.watch-state.json');
const MAX_SNAPSHOT_CHARS = 200_000;
const MAX_CHANGED_LINES = 40;

/* Suggested starting points, and it matters that these are *suggestions*.
   They were not fetched from this machine and their URLs are not verified
   here — a regulator reorganising its site is exactly the kind of thing
   that silently breaks a hardcoded list. Each watch reports its own fetch
   result, so a URL that has moved shows up as an error on the first check
   rather than as quiet silence. Confirm before relying on any of them. */
const SUGGESTED_SOURCES = [
  { id: 'edpb-news', label: 'EDPB — news and guidelines', url: 'https://www.edpb.europa.eu/news/news_en', regions: ['EU'] },
  { id: 'edpb-consultations', label: 'EDPB — public consultations', url: 'https://www.edpb.europa.eu/our-work-tools/public-consultations_en', regions: ['EU'] },
  { id: 'ico-news', label: 'ICO — news and blogs (UK)', url: 'https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/', regions: ['UK'] },
  { id: 'cppa-rulemaking', label: 'California Privacy Protection Agency — rulemaking', url: 'https://cppa.ca.gov/regulations/', regions: ['US-CA'] },
  { id: 'oag-ccpa', label: 'California Attorney General — CCPA enforcement', url: 'https://oag.ca.gov/privacy/ccpa', regions: ['US-CA'] },
];

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return { watches: {}, lastCheckedAt: null };
  }
}
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

/* Line-level, deliberately. Character diffs of a rendered page are noise;
   what a person wants is "these lines are new". Boilerplate that changes
   on every load — timestamps, session ids, rotating banners — will show up
   as churn, which is why a watch reports how much changed and lets you
   judge whether the source is worth keeping. */
function diffLines(before, after) {
  const a = new Set(String(before || '').split('\n').map(l => l.trim()).filter(Boolean));
  const b = String(after || '').split('\n').map(l => l.trim()).filter(Boolean);
  const seen = new Set();
  const added = [];
  for (const line of b) {
    if (a.has(line) || seen.has(line)) continue;
    seen.add(line);
    added.push(line);
  }
  const bSet = new Set(b);
  const removed = [...a].filter(l => !bSet.has(l));
  return { added, removed };
}

async function checkOne(watch, state) {
  const prev = state.watches[watch.id] || {};
  const result = {
    id: watch.id,
    label: watch.label,
    url: watch.url,
    regions: watch.regions || [],
    checkedAt: Date.now(),
    previouslyCheckedAt: prev.checkedAt || null,
  };

  let page;
  try {
    page = await fetchPage(watch.url);
  } catch (err) {
    /* A source that cannot be reached is reported as unreachable, never as
       "no changes" — the difference between "nothing happened" and "we
       didn't look" is the whole discipline of this project. */
    result.ok = false;
    result.error = err.message;
    state.watches[watch.id] = { ...prev, checkedAt: result.checkedAt, lastError: err.message };
    return result;
  }

  /* A 404 has a body, and that body is stable. Without this check a source
     that moved would quietly baseline its error page and then report "no
     changes" forever — a watch that looks like it is working and is
     watching nothing. Status first, content second. */
  if (page.status < 200 || page.status >= 300) {
    result.ok = false;
    result.error = `The source returned HTTP ${page.status}. If it has moved, update the URL — a watch left pointing at an error page reports no changes indefinitely.`;
    state.watches[watch.id] = { ...prev, checkedAt: result.checkedAt, lastError: result.error };
    return result;
  }

  const text = extractText(page.html || '').slice(0, MAX_SNAPSHOT_CHARS);
  if (!text) {
    result.ok = false;
    result.error = `Retrieved ${page.status} but no readable text — the page may render its content with JavaScript, which this crawler cannot run.`;
    state.watches[watch.id] = { ...prev, checkedAt: result.checkedAt, lastError: result.error };
    return result;
  }

  result.ok = true;
  result.status = page.status;

  if (!prev.snapshot) {
    result.firstCheck = true;
    result.changed = false;
    result.note = 'First check — this is the baseline. Changes will be reported from the next check onward.';
  } else {
    const { added, removed } = diffLines(prev.snapshot, text);
    result.changed = added.length > 0 || removed.length > 0;
    result.added = added.slice(0, MAX_CHANGED_LINES);
    result.removed = removed.slice(0, MAX_CHANGED_LINES);
    result.addedCount = added.length;
    result.removedCount = removed.length;
    result.since = prev.checkedAt;
  }

  state.watches[watch.id] = {
    checkedAt: result.checkedAt,
    snapshot: text,
    url: watch.url,
    label: watch.label,
    regions: watch.regions || [],
    lastError: null,
  };
  return result;
}

async function check({ watches } = {}) {
  const sources = (watches && watches.length) ? watches : SUGGESTED_SOURCES;
  const state = loadState();
  const results = [];
  for (const w of sources) {
    if (!w || !w.url) continue;
    results.push(await checkOne(w, state));
  }
  state.lastCheckedAt = Date.now();
  const saved = saveState(state);

  return {
    ok: true,
    checkedAt: state.lastCheckedAt,
    results,
    changedCount: results.filter(r => r.ok && r.changed).length,
    failedCount: results.filter(r => !r.ok).length,
    /* Without somewhere to keep snapshots, every check is a first check
       and nothing can ever be reported as changed. Say so rather than
       returning a permanently quiet watch list. */
    persisted: saved,
    persistWarning: saved ? null
      : `Could not write ${STATE_FILE}. Snapshots are not being kept, so every check will look like a first check and no change can be detected. Set WATCH_STATE_FILE to a writable path.`,
  };
}

function listWatches() {
  const state = loadState();
  return {
    ok: true,
    suggested: SUGGESTED_SOURCES,
    tracked: Object.entries(state.watches || {}).map(([id, w]) => ({
      id, url: w.url, label: w.label, regions: w.regions || [],
      checkedAt: w.checkedAt || null,
      lastError: w.lastError || null,
      hasBaseline: !!w.snapshot,
    })),
    lastCheckedAt: state.lastCheckedAt || null,
    stateFile: STATE_FILE,
  };
}

module.exports = { check, listWatches, diffLines, SUGGESTED_SOURCES };
