#!/usr/bin/env node
// Collects news for Paysa and writes data/news.json. Runs on GitHub Actions (see .github/workflows/news.yml).
//
//  • Official: Press Information Bureau releases (pib.gov.in) matching pay/pension keywords.
//  • Media: headlines from Google News searches. Only the headline, source name and link are kept,
//    never article text.
//
// If an official PIB release announces the pending DA instalment, this also writes
// .paysa/da-proposal.json. The workflow turns that into a pull request for a human to approve.
// Rates are never changed automatically.
//
// Usage: node scripts/fetch-news.mjs [--dry]

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { validateNews, NEWS_TAGS } from '../js/validate.js';

const ROOT = new URL('../', import.meta.url);
const NEWS_FILE = new URL('data/news.json', ROOT);
const RATES_FILE = new URL('data/rates.json', ROOT);
const PROPOSAL_DIR = new URL('.paysa/', ROOT);
const DRY = process.argv.includes('--dry');

const MAX_ITEMS = 60;
const MAX_AGE_DAYS = 120;
const MAX_PIB_PAGES = 8;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';

const PIB_FEED = 'https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3';
const GOOGLE_NEWS = q => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:14d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
const QUERIES = [
  '"dearness allowance" central government employees',
  '"dearness relief" pensioners central government',
  '"8th pay commission"',
  '"unified pension scheme" central government employees',
  '"national pension system" central government employees',
  'CGHS central government employees',
  '"railway employees" bonus OR allowance OR pension',
  '"central government employees" HRA OR gratuity OR "leave encashment" OR increment',
];

// ---------- Relevance ----------
const RELEVANT_EN = /dearness|\bDA\b|\bDR\b|pay commission|\bCPC\b|pension|\bNPS\b|\bUPS\b|\bOPS\b|CGHS|gratuity|allowance|increment|MACP|leave encashment|central (govt|government) (employees|staff)|railway (employees|staff)|productivity.linked bonus/i;
const RELEVANT_HI = /महंगाई|पेंशन|वेतन आयोग|केंद्र(ीय)? सरकार के कर्मचारि|सीजीएचएस|रेलवे कर्मचारि|बोनस|भत्त/;
// Skip state-government, bank and PSU pay stories: they don't apply to central employees
const OFF_TOPIC = /\b(state (govt|government)s?|state-?wise|states|uttar pradesh|bihar|punjab|kerala|tamil nadu|west bengal|karnataka|rajasthan|maharashtra|telangana|andhra|odisha|gujarat|haryana|himachal|jharkhand|assam|goa|madhya pradesh|uttarakhand|chhattisgarh|tripura|manipur|meghalaya|mizoram|nagaland|sikkim|arunachal|j&k|jammu|ladakh|puducherry|bank employees|bank staff|LIC|EPFO|EPS-95|PSU|SBI|mla|mp salary)\b/i;

// Low-quality sites that regularly post misleading pay headlines. Add more here as they show up.
const BLOCKED_SOURCES = /(^|\.)(timesbull\.com|jagrantv\.com|thenewsmill\.com)$/i;

const TAG_RULES = [
  ['DA', /dearness|\bDA\b|\bDR\b|महंगाई/i],
  ['8th CPC', /8th (central )?pay commission|8th CPC|fitment|आठवें वेतन आयोग|8वें वेतन आयोग/i],
  ['Pension', /pension|\bNPS\b|\bUPS\b|\bOPS\b|gratuity|commutation|पेंशन/i],
  ['Railways', /railway|रेलवे/i],
  ['CGHS', /CGHS|सीजीएचएस/i],
  ['Tax', /income tax|\bTDS\b|tax regime/i],
  ['Leave', /leave encashment|earned leave|\bLTC\b/i],
  ['Pay', /salary|pay matrix|increment|MACP|allowance|bonus|वेतन|भत्त|बोनस/i],
];
const tagsFor = text => {
  const tags = TAG_RULES.filter(([, re]) => re.test(text)).map(([t]) => t);
  return (tags.length ? tags : ['Pay']).filter(t => NEWS_TAGS.includes(t)).slice(0, 3);
};

// A headline like "Cabinet approves 2% DA hike" that matches the last hike already in rates.json is
// almost always the old announcement resurfacing with a new date. Skip those unless PIB confirms a new one.
function echoOfLastHike(title, rates) {
  const n = rates.da.filter(d => d.status === 'notified');
  if (n.length < 2) return false;
  const lastInc = n[n.length - 1].rate - n[n.length - 2].rate;
  const aboutDA = /dearness|\bDA\b|\bDR\b/i.test(title);
  const claimsApproval = /(approv|clear|okay|\bnod\b|laud|hail|hike[sd]?\b|increas|announc|raise)/i.test(title);
  const pct = title.match(/(\d+(?:\.\d+)?)\s*(?:%|per\s?cent|pc\b)/i);
  return aboutDA && claimsApproval && !!pct && (Number(pct[1]) === lastInc || Number(pct[1]) === n[n.length - 1].rate);
}

// ---------- Tiny RSS/HTML helpers (no dependencies) ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const clean = s => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? clean(m[1]) : ''; };
const items = xml => [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m => m[1]);
const key = title => title.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, '').slice(0, 70);
const idFor = s => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.codePointAt(0)) >>> 0; return h.toString(36); };
const isHttps = u => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };
const cap = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-IN,en;q=0.8' }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// ---------- Sources ----------
async function fromGoogleNews() {
  const out = [];
  for (const q of QUERIES) {
    try {
      for (const it of items(await get(GOOGLE_NEWS(q)))) {
        const source = tag(it, 'source');
        const sourceUrl = (it.match(/<source[^>]*url="([^"]+)"/i) || [])[1] || '';
        let title = tag(it, 'title');
        if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
        const url = tag(it, 'link');
        const date = new Date(tag(it, 'pubDate'));
        if (!title || !isHttps(url) || Number.isNaN(+date)) continue;
        if (!RELEVANT_EN.test(title) || OFF_TOPIC.test(title)) continue;
        let host = '';
        try { host = new URL(sourceUrl).hostname; } catch { /* ignore */ }
        if (BLOCKED_SOURCES.test(host)) continue;
        out.push({
          title: cap(title, 240), source: cap(source || host || 'News', 60), url, date: date.toISOString(),
          official: /(\.gov\.in|\.nic\.in|pfrda\.org\.in)$/.test(host), tags: tagsFor(title),
        });
      }
    } catch (err) { console.warn('Google News:', err.message); }
  }
  return out;
}

async function fromPIB() {
  const out = [];
  let pages = 0;
  try {
    for (const it of items(await get(PIB_FEED))) {
      const feedTitle = tag(it, 'title');
      const link = tag(it, 'link');
      if (!isHttps(link) || !(RELEVANT_HI.test(feedTitle) || RELEVANT_EN.test(feedTitle))) continue;
      if (pages++ >= MAX_PIB_PAGES) break;
      try {
        const html = await get(link);
        const og = (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i) || [])[1];
        const title = og ? clean(og) : feedTitle;
        const text = clean(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' '));
        const posted = text.match(/Posted On:\s*(\d{1,2} [A-Z]{3} \d{4})/i);
        const date = posted ? new Date(`${posted[1]} 12:00 +0530`) : new Date();
        const bodyStart = text.indexOf('by PIB');
        const summary = bodyStart > 0 ? cap(text.slice(bodyStart).replace(/^by PIB \w+\s*/, ''), 220) : '';
        if (OFF_TOPIC.test(title)) continue;
        out.push({ title: cap(title, 240), summary, source: 'PIB', url: link, date: date.toISOString(), official: true, tags: tagsFor(`${title} ${feedTitle}`), _text: text });
      } catch (err) { console.warn('PIB page:', err.message); }
    }
  } catch (err) { console.warn('PIB feed:', err.message); }
  return out;
}

// ---------- DA announcement detection (proposal only) ----------
function nextHalfYear(iso) {
  const [y, m] = iso.split('-').map(Number);
  return m === 1 ? `${y}-07-01` : `${y + 1}-01-01`;
}
function datePatterns(iso) {
  const [y, m] = iso.split('-').map(Number);
  const en = m === 1 ? 'January' : 'July', hi = m === 1 ? 'जनवरी' : 'जुलाई', mm = String(m).padStart(2, '0');
  return new RegExp([
    `0?1\\.${mm}\\.${y}`, `0?1\\.0?${m}\\.${y}`, `0?1-${mm}-${y}`, `0?1/${mm}/${y}`,
    `1(st)?\\s+${en},?\\s+${y}`, `${en}\\s+1(st)?,?\\s+${y}`, `1\\s+${hi},?\\s+${y}`,
  ].join('|'), 'i');
}

export function detectDA(rates, officialItems) {
  const notified = rates.da.filter(d => d.status === 'notified');
  const last = notified[notified.length - 1];
  const pendingFrom = nextHalfYear(last.from);
  const when = datePatterns(pendingFrom);
  for (const it of officialItems) {
    const text = it._text || '';
    if (!/dearness allowance|महंगाई भत्त/i.test(text) || !when.test(text)) continue;
    const inc = text.match(/increase of\s*(\d+(?:\.\d+)?)\s*(?:%|per\s?cent)/i) || text.match(/(\d+(?:\.\d+)?)\s*प्रतिशत की (?:वृद्धि|बढ़ोतरी)/);
    const base = text.match(/existing rate of\s*(\d+(?:\.\d+)?)\s*(?:%|per\s?cent)/i) || text.match(/मौजूदा\s*(?:दर)?\s*(\d+(?:\.\d+)?)\s*प्रतिशत/);
    const total = text.match(/(?:to|at)\s*(\d{2,3})\s*(?:%|per\s?cent)\s*of the basic/i);
    let rate = null;
    if (inc && base) rate = Number(base[1]) + Number(inc[1]);
    else if (total) rate = Number(total[1]);
    else if (inc) rate = last.rate + Number(inc[1]);
    if (rate == null || rate <= last.rate || rate > last.rate + 10) continue;
    const already = rates.da.find(d => d.from === pendingFrom);
    if (already?.status === 'notified' && already.rate === rate) return null;
    const idx = text.search(/dearness allowance|महंगाई भत्त/i);
    return {
      from: pendingFrom, rate, source: it.url, title: it.title,
      evidence: cap(text.slice(Math.max(0, idx - 120), idx + 420), 540),
      baseMatches: base ? Number(base[1]) === last.rate : null, previousRate: last.rate,
    };
  }
  return null;
}

// ---------- Merge & write ----------
async function main() {
  const rates = JSON.parse(await readFile(RATES_FILE, 'utf8'));
  let existing = { schema: 1, updated: new Date(0).toISOString(), items: [] };
  try { existing = JSON.parse(await readFile(NEWS_FILE, 'utf8')); } catch { /* first run */ }

  const [pib, allMedia] = await Promise.all([fromPIB(), fromGoogleNews()]);
  const proposal = detectDA(rates, pib);
  const media = proposal ? allMedia : allMedia.filter(m => !echoOfLastHike(m.title, rates));
  console.log(`PIB matches: ${pib.length}, media headlines: ${allMedia.length} (${allMedia.length - media.length} old-hike echoes skipped)`);

  // Known stories keep their first-seen date, so re-dated old stories don't jump back to the top
  const seen = new Map(existing.items.map(i => [key(i.title), i]));
  const fresh = [];
  for (const it of [...pib, ...media]) {        // official first, so it wins over media duplicates
    const k = key(it.title);
    if (seen.has(k)) continue;
    const { _text, ...item } = it;
    const clean = { id: idFor(item.url + k), ...item };
    if (!clean.summary) delete clean.summary;
    seen.set(k, clean);
    fresh.push(clean);
  }

  const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
  const now = Date.now() + 864e5;                // ignore obviously future-dated items
  const all = [...fresh, ...existing.items]
    .filter(i => Date.parse(i.date) > cutoff && Date.parse(i.date) < now)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, MAX_ITEMS);

  const next = { schema: 1, updated: new Date().toISOString(), items: all };
  const problems = validateNews(next);
  if (problems.length) { console.error('News failed validation:\n' + problems.join('\n')); process.exit(1); }
  console.log(`New stories: ${fresh.length}, total kept: ${all.length}`);

  await rm(PROPOSAL_DIR, { recursive: true, force: true });
  if (proposal) {
    console.log(`Possible DA announcement: ${proposal.rate}% from ${proposal.from}`);
    if (!DRY) { await mkdir(PROPOSAL_DIR, { recursive: true }); await writeFile(new URL('da-proposal.json', PROPOSAL_DIR), JSON.stringify(proposal, null, 2)); }
  }

  if (DRY) { console.log(JSON.stringify(fresh.slice(0, 5), null, 2)); return; }
  if (fresh.length || !existing.items.length) await writeFile(NEWS_FILE, JSON.stringify(next, null, 2) + '\n');
}

if (process.argv[1]?.endsWith('fetch-news.mjs')) {
  main().catch(err => { console.error(err); process.exit(1); });
}
