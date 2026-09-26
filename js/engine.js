// Paysa calculation engine — pure functions, no DOM. Works in the browser and in Node.

// ---------- 7th CPC pay matrix ----------
// [level, entry pay, number of cells]. Each next cell = previous × 1.03, rounded to nearest ₹100.
export const LEVEL_DEFS = [
  ['1', 18000, 40], ['2', 19900, 40], ['3', 21700, 40], ['4', 25500, 40],
  ['5', 29200, 40], ['6', 35400, 40], ['7', 44900, 40], ['8', 47600, 40],
  ['9', 53100, 40], ['10', 56100, 40], ['11', 67700, 39], ['12', 78800, 34],
  ['13', 123100, 20], ['13A', 131100, 18], ['14', 144200, 15], ['15', 182200, 8],
  ['16', 205400, 4], ['17', 225000, 1], ['18', 250000, 1],
];
export const LEVELS = LEVEL_DEFS.map(d => d[0]);

export const round100 = x => Math.round(x / 100) * 100;

export const MATRIX = Object.fromEntries(LEVEL_DEFS.map(([lvl, start, n]) => {
  const cells = [start];
  while (cells.length < n) cells.push(round100(cells[cells.length - 1] * 1.03));
  return [lvl, cells];
}));

export const levelIndex = lvl => LEVELS.indexOf(String(lvl));
export const nextLevel = lvl => LEVELS[Math.min(levelIndex(lvl) + 1, LEVELS.length - 1)];

/** Next cell in the same level; stays put at the top of the level (stagnation). */
export function nextCell(level, basic) {
  const cells = MATRIX[level];
  const i = cells.findIndex(c => c > basic);
  return i === -1 ? basic : cells[i];
}
export const isMaxCell = (level, basic) => basic >= MATRIX[level][MATRIX[level].length - 1];

/** Pay fixation on promotion / MACP: one notional increment, then the first cell ≥ that in the new level. */
export function fixOnPromotion(fromLevel, basic, toLevel) {
  const notional = isMaxCell(fromLevel, basic) ? round100(basic * 1.03) : nextCell(fromLevel, basic);
  const cells = MATRIX[toLevel];
  return cells.find(c => c >= notional) ?? cells[cells.length - 1];
}

// ---------- Rates ----------
// Every rate (DA, HRA, TA, CGHS, tax slabs, pension rules…) comes from data/rates.json, which is
// published separately and refreshed on every device. Call useRates() before calculating.
export let RATES = null;
export let DA_HISTORY = [];
export let GRATUITY_CEILING = 0;
export let HRA_MIN = {};
export let CGEGIS = {};
export let RATES_CHECKED = '';

export function useRates(r) {
  RATES = r;
  DA_HISTORY = r.da;
  GRATUITY_CEILING = r.gratuityCeiling;
  HRA_MIN = r.hra.min;
  CGEGIS = r.cgegis;
  const [y, m, d] = r.updated.split('-').map(Number);
  RATES_CHECKED = new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daFor(date, includeExpected) {
  const iso = toISO(date);
  let r = 0;
  for (const d of DA_HISTORY) {
    if (d.from <= iso && (includeExpected || d.status === 'notified')) r = d.rate;
  }
  return r;
}

export function hraRate(city, da) {
  let band = RATES.hra.bands[0];
  for (const b of RATES.hra.bands) if (da >= b.minDA) band = b;
  return band[city] / 100;
}

/** Transport Allowance base (before DA). tpta = one of the notified higher-TPTA cities. */
export function taBase(level, basic, tpta) {
  const i = levelIndex(level);
  const row = RATES.ta.find(t => i >= levelIndex(t.minLevel) && (t.minPay == null || basic >= t.minPay));
  return tpta ? row.tpta : row.other;
}

export function cghs(level) {
  const i = levelIndex(level);
  return RATES.cghs.find(c => i <= levelIndex(c.maxLevel)).amount;
}

/** New tax regime. Returns annual tax incl. cess. */
export function incomeTaxNew(annualGross) {
  const t = RATES.tax;
  const taxable = Math.max(0, annualGross - t.stdDeduction);
  let tax = 0, prev = 0;
  for (const [cap, pct] of t.slabs) {
    const top = cap ?? Infinity;
    if (taxable > prev) tax += (Math.min(taxable, top) - prev) * pct / 100;
    prev = top;
  }
  if (taxable <= t.rebateLimit) tax = 0;
  else tax = Math.min(tax, taxable - t.rebateLimit); // marginal relief just above the rebate limit
  return Math.round(tax * (1 + t.cessPct / 100));
}

/** Monthly pay slip. */
export function salary(p, da, { withTax = true, hraOverrideDA } = {}) {
  const basic = p.basic;
  const daAmt = Math.round(basic * da / 100);
  const hra = Math.max(Math.round(basic * hraRate(p.city, hraOverrideDA ?? da)), HRA_MIN[p.city]);
  const ta0 = taBase(p.level, basic, p.tpta);
  const ta = Math.round(ta0 * (1 + da / 100));
  const gross = basic + daAmt + hra + ta;

  const deductions = [];
  const empPct = p.scheme === 'UPS' ? RATES.ups.employee : RATES.nps.employee;
  if (p.scheme === 'OPS') deductions.push(['GPF subscription', Math.round(basic * (p.gpfPct ?? 6) / 100)]);
  else deductions.push([`${p.scheme} (${empPct}% of Basic + DA)`, Math.round((basic + daAmt) * empPct / 100)]);
  deductions.push(['CGEGIS', CGEGIS[p.group] ?? CGEGIS.B]);
  deductions.push(['CGHS', cghs(p.level)]);
  const tax = withTax ? Math.round(incomeTaxNew(gross * 12) / 12) : 0;
  if (withTax) deductions.push([`Income tax (new regime, est.)`, tax]);
  const totalDed = deductions.reduce((s, d) => s + d[1], 0);

  const govtPct = p.scheme === 'UPS' ? RATES.ups.govt : RATES.nps.govt;
  const govtShare = p.scheme === 'OPS' ? 0 : Math.round((basic + daAmt) * govtPct / 100);
  return {
    basic, da, daAmt, hra, hraPct: Math.round(hraRate(p.city, hraOverrideDA ?? da) * 100), ta, ta0, gross,
    deductions, totalDed, net: gross - totalDed, govtShare, govtPct,
  };
}

/** Arrears if a pending DA hike is approved: months from its effective date up to `asOf` (inclusive). */
export function daArrears(p, asOf) {
  const pending = DA_HISTORY.find(d => d.status === 'expected');
  if (!pending) return null;
  const prev = DA_HISTORY[DA_HISTORY.indexOf(pending) - 1];
  const from = parseISO(pending.from);
  const months = monthsBetween(from, asOf) + 1;
  if (months <= 0) return null;
  const diff = (pending.rate - prev.rate) / 100;
  const perMonth = Math.round((p.basic + taBase(p.level, p.basic, p.tpta)) * diff);
  const empCut = p.scheme === 'OPS' ? 0 : Math.round(p.basic * diff * (p.scheme === 'UPS' ? RATES.ups.employee : RATES.nps.employee) / 100);
  return { from, to: asOf, months, perMonth, total: perMonth * months, net: (perMonth - empCut) * months, oldRate: prev.rate, newRate: pending.rate };
}

// ---------- Dates ----------
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const toISO = d => typeof d === 'string' ? d : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const monthsBetween = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
const lastDayOfMonth = (y, m) => new Date(y, m + 1, 0);

/** Superannuation at 60: last day of the birth month; born on the 1st → last day of previous month. */
export function retirementDate(dob) {
  const d = parseISO(dob);
  const y = d.getFullYear() + 60;
  return d.getDate() === 1 ? lastDayOfMonth(y, d.getMonth() - 1) : lastDayOfMonth(y, d.getMonth());
}

/** Service between two dates as {years, months, days, totalMonths}. */
export function serviceSpan(from, to) {
  let months = monthsBetween(from, to);
  let days = to.getDate() - from.getDate() + 1;
  if (days < 0) { months -= 1; days += lastDayOfMonth(to.getFullYear(), to.getMonth() - 1).getDate(); }
  if (days >= lastDayOfMonth(to.getFullYear(), to.getMonth()).getDate()) { months += 1; days = 0; }
  return { years: Math.floor(months / 12), months: months % 12, days, totalMonths: months };
}

/** Completed six-monthly periods; a fraction of 3 months or more counts as a full half-year. */
export const halfYears = totalMonths => Math.floor(totalMonths / 6) + (totalMonths % 6 >= 3 ? 1 : 0);

// ---------- Career projection ----------
/**
 * Month-by-month pay from `start` to retirement.
 * opts: { macp, daStep (percentage points every Jan/Jul), cpc8: factor|null, includeExpected }
 */
export function project(p, start, opts = {}) {
  const { macp = true, daStep = 3, cpc8 = null, includeExpected = true } = opts;
  const retire = retirementDate(p.dob);
  const doj = parseISO(p.doj);
  let level = p.level, basic = p.basic, da = daFor(start, includeExpected);
  if (cpc8) { basic = round100(basic * cpc8); da = 0; }
  const incMonth = p.incMonth === 'Jan' ? 0 : 6;
  const macpDone = new Set();
  const rows = [], events = [];

  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const end = new Date(retire.getFullYear(), retire.getMonth(), 1);
  let first = true;
  while (cur <= end) {
    if (!first) {
      const m = cur.getMonth();
      if (m === 0 || m === 6) da += daStep;
      if (m === incMonth) {
        const nb = cpc8 ? round100(basic * 1.03) : nextCell(level, basic);
        if (nb !== basic) events.push({ date: new Date(cur), type: 'increment', level, basic: nb, from: basic });
        else events.push({ date: new Date(cur), type: 'stagnation', level, basic });
        basic = nb;
      }
    }
    if (macp) {
      for (const yrs of [10, 20, 30]) {
        const due = new Date(doj.getFullYear() + yrs, doj.getMonth(), doj.getDate());
        if (!macpDone.has(yrs) && due <= lastDayOfMonth(cur.getFullYear(), cur.getMonth()) && due >= start && due <= retire) {
          macpDone.add(yrs);
          const to = nextLevel(level);
          const nb = cpc8 ? round100(basic * 1.03 * 1.03) : fixOnPromotion(level, basic, to);
          events.push({ date: due, type: 'macp', n: yrs / 10, fromLevel: level, level: to, from: basic, basic: nb });
          level = to; basic = nb;
        }
      }
    }
    rows.push({ date: new Date(cur), level, basic, da });
    first = false;
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  events.push({ date: retire, type: 'retire', level, basic });
  events.sort((a, b) => a.date - b.date);
  return { rows, events, retire };
}

// ---------- Retirement benefits ----------
// Monthly share of Basic + DA going into the individual corpus (you + Govt)
const shares = scheme => scheme === 'UPS'
  ? (RATES.ups.employee + RATES.ups.individualGovt) / 100
  : (RATES.nps.employee + RATES.nps.govt) / 100;

/** Rough estimate of NPS corpus built so far: today's contribution deflated by past pay growth, compounded at r. */
export function estimateCorpusSoFar(p, asOf, r = 0.09, payGrowth = 0.07) {
  const s = salary(p, daFor(asOf, false), { withTax: false });
  const c = Math.round((p.basic + s.daAmt) * shares(p.scheme === 'UPS' ? 'UPS' : 'NPS'));
  const M = Math.max(0, monthsBetween(parseISO(p.doj), asOf));
  let corpus = 0;
  for (let k = 1; k <= M; k++) corpus += c * Math.pow(1 + payGrowth, -k / 12) * Math.pow(1 + r / 12, k);
  return round100(corpus);
}

export function retirement(p, proj, opts = {}) {
  const { npsReturn = 0.09, annuityRate = 0.06, corpusNow = 0 } = opts;
  const rows = proj.rows;
  const last = rows[rows.length - 1];
  const svc = serviceSpan(parseISO(p.doj), proj.retire);
  const hy = halfYears(svc.totalMonths);
  const emol = last.basic + Math.round(last.basic * last.da / 100);

  const gratuity = Math.min(Math.round(0.25 * emol * Math.min(hy, 66)), GRATUITY_CEILING);
  const leave = Math.round(emol / 30 * Math.min(p.el ?? RATES.leaveMaxDays, RATES.leaveMaxDays));

  // OPS: 50% of last basic (with a minimum), 10+ years qualifying service
  const opsEligible = p.doj < '2004-01-01';
  const opsBasicPension = svc.years >= 10 ? Math.max(Math.round(last.basic * 0.5), RATES.ops.minPension) : 0;
  const commutation = Math.round(opsBasicPension * RATES.ops.commutePct / 100 * RATES.ops.commutationFactor * 12);

  // NPS / UPS corpus accumulation along the projection
  const grow = (share) => {
    let c = corpusNow;
    for (const r of rows) c = c * (1 + npsReturn / 12) + (r.basic + r.basic * r.da / 100) * share;
    return round100(c);
  };
  const npsCorpus = grow(shares('NPS'));
  const upsCorpus = grow(shares('UPS'));

  // UPS: 50% of average basic of last 12 months, proportional below full service, with a minimum
  const last12 = rows.slice(-12);
  const avg12 = last12.reduce((s, r) => s + r.basic, 0) / last12.length;
  let upsPayout = 0;
  const U = RATES.ups;
  if (svc.years >= U.minServiceYears) upsPayout = Math.max(Math.round(avg12 * 0.5 * Math.min(svc.totalMonths, U.fullServiceMonths) / U.fullServiceMonths), U.minPayout);
  const upsLump = Math.round(emol / 10 * hy);

  const dr = last.da / 100;
  return {
    retire: proj.retire, service: svc, halfYears: hy, lastBasic: last.basic, lastDA: last.da, lastLevel: last.level, emol,
    gratuity, leave,
    ops: { eligible: opsEligible, pension: opsBasicPension, withDR: Math.round(opsBasicPension * (1 + dr)), commutation, reduced: Math.round(opsBasicPension * (1 - RATES.ops.commutePct / 100) * (1 + dr)) },
    nps: { corpus: npsCorpus, lump: Math.round(npsCorpus * 0.6), pension: Math.round(npsCorpus * 0.4 * annuityRate / 12) },
    ups: { payout: upsPayout, withDR: Math.round(upsPayout * (1 + dr)), lump: upsLump, corpus: upsCorpus, family: Math.round(upsPayout * 0.6) },
  };
}
