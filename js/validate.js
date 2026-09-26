// Shared checks for the remote data files. Used by the app (reject bad downloads, keep the last
// good copy) and by CI (block a bad file from ever being published). Returns a list of problems.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '13A', '14', '15', '16', '17', '18'];
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isHttps = u => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };

export function validateRates(r) {
  const e = [];
  const need = (cond, msg) => { if (!cond) e.push(msg); };
  if (!r || typeof r !== 'object') return ['rates: not an object'];
  need(r.schema === 1, 'schema must be 1');
  need(Number.isInteger(r.version) && r.version > 0, 'version must be a positive whole number');
  need(ISO.test(r.updated ?? ''), 'updated must be YYYY-MM-DD');
  need(r.notice == null || (typeof r.notice === 'string' && r.notice.length <= 300), 'notice must be short text');

  // DA: ascending half-years, sensible values, at most one "expected" and only at the end
  const da = r.da;
  need(Array.isArray(da) && da.length > 0, 'da must be a non-empty list');
  if (Array.isArray(da)) {
    da.forEach((d, i) => {
      const at = `da[${i}]`;
      need(ISO.test(d?.from ?? '') && /-(01|07)-01$/.test(d.from), `${at}.from must be 1 Jan or 1 Jul (YYYY-01-01 / YYYY-07-01)`);
      need(isNum(d?.rate, 0, 300), `${at}.rate must be 0–300`);
      need(['notified', 'expected'].includes(d?.status), `${at}.status must be "notified" or "expected"`);
      need(d?.source == null || isHttps(d.source), `${at}.source must be an https link`);
      if (i > 0) {
        need(d.from > da[i - 1].from, `${at}.from must come after the previous entry`);
        const jump = d.rate - da[i - 1].rate;
        need(jump >= 0 && jump <= 10, `${at}.rate jumps by ${jump} points (expected 0–10). Typo?`);
      }
      if (d?.status === 'expected') need(i === da.length - 1, `${at}: only the last entry can be "expected"`);
    });
  }

  const hra = r.hra;
  need(Array.isArray(hra?.bands) && hra.bands.length > 0, 'hra.bands missing');
  (hra?.bands ?? []).forEach((b, i) => {
    need(isNum(b.minDA, 0, 300), `hra.bands[${i}].minDA invalid`);
    for (const c of ['X', 'Y', 'Z']) need(isNum(b[c], 0, 50), `hra.bands[${i}].${c} must be 0–50 (%)`);
    if (i > 0) need(b.minDA > hra.bands[i - 1].minDA, `hra.bands must be in ascending minDA order`);
  });
  for (const c of ['X', 'Y', 'Z']) need(isNum(hra?.min?.[c], 0, 100000), `hra.min.${c} invalid`);

  need(Array.isArray(r.ta) && r.ta.length > 0, 'ta missing');
  (r.ta ?? []).forEach((t, i) => {
    need(LEVELS.includes(t.minLevel), `ta[${i}].minLevel invalid`);
    need(isNum(t.tpta, 0, 100000) && isNum(t.other, 0, 100000), `ta[${i}] amounts invalid`);
    need(t.minPay == null || isNum(t.minPay, 0, 1e6), `ta[${i}].minPay invalid`);
  });
  need((r.ta ?? []).some(t => t.minLevel === '1' && t.minPay == null), 'ta needs a catch-all row for level 1');

  need(Array.isArray(r.cghs) && r.cghs.some(c => c.maxLevel === '18'), 'cghs must cover up to level 18');
  (r.cghs ?? []).forEach((c, i) => need(LEVELS.includes(c.maxLevel) && isNum(c.amount, 0, 10000), `cghs[${i}] invalid`));
  for (const g of ['A', 'B', 'C']) need(isNum(r.cgegis?.[g], 0, 10000), `cgegis.${g} invalid`);

  need(isNum(r.gratuityCeiling, 100000, 1e8), 'gratuityCeiling invalid');
  need(isNum(r.leaveMaxDays, 0, 600), 'leaveMaxDays invalid');
  need(isNum(r.nps?.employee, 0, 30) && isNum(r.nps?.govt, 0, 30), 'nps contribution % invalid');
  const u = r.ups ?? {};
  need(isNum(u.employee, 0, 30) && isNum(u.govt, 0, 30) && isNum(u.individualGovt, 0, 30), 'ups contribution % invalid');
  need(isNum(u.minPayout, 0, 1e6) && isNum(u.fullServiceMonths, 1, 600) && isNum(u.minServiceYears, 0, 40), 'ups rules invalid');
  const o = r.ops ?? {};
  need(isNum(o.minPension, 0, 1e6) && isNum(o.commutePct, 0, 100) && isNum(o.commutationFactor, 1, 20), 'ops rules invalid');

  const t = r.tax ?? {};
  need(isNum(t.stdDeduction, 0, 1e6) && isNum(t.rebateLimit, 0, 1e8) && isNum(t.cessPct, 0, 20), 'tax basics invalid');
  need(Array.isArray(t.slabs) && t.slabs.length > 1 && t.slabs[t.slabs.length - 1][0] === null, 'tax.slabs must end with [null, rate]');
  (t.slabs ?? []).forEach(([cap, pct], i) => {
    need(isNum(pct, 0, 50), `tax.slabs[${i}] rate must be 0–50`);
    if (i < t.slabs.length - 1) need(isNum(cap, 1, 1e9) && (i === 0 || cap > t.slabs[i - 1][0]), `tax.slabs[${i}] limits must go up`);
  });

  const c8 = r.cpc8 ?? {};
  need(isNum(c8.fitmentMin, 1, 5) && isNum(c8.fitmentMax, 1, 5) && c8.fitmentMin < c8.fitmentMax, 'cpc8 fitment range invalid');
  need(isNum(c8.fitmentDefault, c8.fitmentMin ?? 1, c8.fitmentMax ?? 5), 'cpc8.fitmentDefault out of range');

  need(Array.isArray(r.sources), 'sources must be a list');
  (r.sources ?? []).forEach((s, i) => need(typeof s.title === 'string' && isHttps(s.url), `sources[${i}] needs a title and https link`));
  return e;
}

export const NEWS_TAGS = ['DA', 'Pension', '8th CPC', 'Railways', 'CGHS', 'Tax', 'Pay', 'Leave'];

export function validateNews(n) {
  const e = [];
  const need = (cond, msg) => { if (!cond) e.push(msg); };
  if (!n || typeof n !== 'object') return ['news: not an object'];
  need(n.schema === 1, 'news.schema must be 1');
  need(typeof n.updated === 'string' && !Number.isNaN(Date.parse(n.updated)), 'news.updated must be a date');
  need(Array.isArray(n.items) && n.items.length <= 200, 'news.items must be a list (max 200)');
  (n.items ?? []).forEach((it, i) => {
    const at = `items[${i}]`;
    need(typeof it.id === 'string' && it.id.length <= 64, `${at}.id invalid`);
    need(typeof it.title === 'string' && it.title.length > 0 && it.title.length <= 300, `${at}.title invalid`);
    need(typeof it.source === 'string' && it.source.length <= 80, `${at}.source invalid`);
    need(isHttps(it.url), `${at}.url must be https`);
    need(!Number.isNaN(Date.parse(it.date)), `${at}.date invalid`);
    need(typeof it.official === 'boolean', `${at}.official must be true/false`);
    need(Array.isArray(it.tags) && it.tags.every(t => NEWS_TAGS.includes(t)), `${at}.tags invalid`);
  });
  return e;
}
