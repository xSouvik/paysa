// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import { validateRates, validateNews } from '../js/validate.js';

const RATES = JSON.parse(readFileSync(new URL('../data/rates.json', import.meta.url), 'utf8'));
E.useRates(RATES);
const clone = o => JSON.parse(JSON.stringify(o));

test('published rates.json is valid', () => {
  assert.deepEqual(validateRates(RATES), []);
});

test('validator blocks typos and broken files', () => {
  const typo = clone(RATES); typo.da.at(-1).rate = 630;
  assert.ok(validateRates(typo).some(m => m.includes('jumps')));
  const order = clone(RATES); order.da.reverse();
  assert.ok(validateRates(order).length > 0);
  const noVersion = clone(RATES); delete noVersion.version;
  assert.ok(validateRates(noVersion).length > 0);
  const badLink = clone(RATES); badLink.sources[0].url = 'javascript:alert(1)';
  assert.ok(validateRates(badLink).length > 0);
  assert.ok(validateRates(null).length > 0);
});

test('published news.json is valid', () => {
  const news = JSON.parse(readFileSync(new URL('../data/news.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateNews(news), []);
});

test('pay matrix maxima match the published 7th CPC matrix', () => {
  const max = { 1: 56900, 2: 63200, 3: 69100, 4: 81100, 5: 92300, 6: 112400, 7: 142400, 8: 151100, 9: 167800,
    10: 177500, 11: 208700, 12: 209200, 13: 215900, '13A': 216600, 14: 218200, 15: 224100, 16: 224400, 17: 225000, 18: 250000 };
  for (const [lvl, v] of Object.entries(max)) {
    const cells = E.MATRIX[lvl];
    assert.equal(cells[cells.length - 1], v, `level ${lvl}`);
  }
});

test('known matrix cells', () => {
  assert.deepEqual(E.MATRIX['1'].slice(0, 4), [18000, 18500, 19100, 19700]);
  assert.deepEqual(E.MATRIX['7'].slice(0, 4), [44900, 46200, 47600, 49000]);
});

test('increment and fixation', () => {
  assert.equal(E.nextCell('7', 44900), 46200);
  assert.equal(E.nextCell('18', 250000), 250000);
  // L6 35400 -> notional 36500 -> first L7 cell >= 36500 is 44900
  assert.equal(E.fixOnPromotion('6', 35400, '7'), 44900);
  // L7 52000 -> notional 53600 -> L8 first cell >= 53600 is 53600
  assert.equal(E.fixOnPromotion('7', 52000, '8'), 53600);
});

test('retirement date rule', () => {
  assert.equal(E.toISO(E.retirementDate('1990-06-15')), '2050-06-30');
  assert.equal(E.toISO(E.retirementDate('1990-06-01')), '2050-05-31');
  assert.equal(E.toISO(E.retirementDate('1990-03-01')), '2050-02-28');
});

test('DA lookup', () => {
  assert.equal(E.daFor(new Date(2026, 8, 25), false), 60);
  assert.equal(E.daFor(new Date(2026, 8, 25), true), 63);
  assert.equal(E.daFor(new Date(2025, 2, 1), true), 55);
});

test('salary slip for level 7 X-city', () => {
  const p = { level: '7', basic: 44900, city: 'X', tpta: true, scheme: 'NPS', group: 'B' };
  const s = E.salary(p, 60, { withTax: false });
  assert.equal(s.daAmt, 26940);
  assert.equal(s.hra, 13470);
  assert.equal(s.ta, 5760); // 3600 × 1.6
  assert.equal(s.gross, 44900 + 26940 + 13470 + 5760);
});

test('HRA minimum applies', () => {
  const p = { level: '1', basic: 18000, city: 'Z', tpta: false, scheme: 'NPS', group: 'C' };
  assert.equal(E.salary(p, 60, { withTax: false }).hra, 1800);
});

test('new regime tax: zero up to 12L, marginal relief above', () => {
  assert.equal(E.incomeTaxNew(1275000), 0);
  assert.equal(E.incomeTaxNew(1285000), Math.round(10000 * 1.04));
  assert.equal(E.incomeTaxNew(1675000), Math.round((20000 + 40000 + 60000) * 1.04));
});

test('half years rounding', () => {
  assert.equal(E.halfYears(62), 10);
  assert.equal(E.halfYears(63), 11);
});

test('projection + retirement are sane', () => {
  const p = { name: 'T', dob: '1990-06-15', doj: '2015-03-02', level: '7', basic: 50600, city: 'X', tpta: true, scheme: 'UPS', group: 'B', el: 300, incMonth: 'Jul' };
  const proj = E.project(p, new Date(2026, 8, 25), { macp: true, daStep: 3 });
  assert.equal(E.toISO(proj.retire), '2050-06-30');
  assert.ok(proj.events.some(e => e.type === 'macp' && e.n === 2));
  const r = E.retirement(p, proj, { corpusNow: 0 });
  assert.ok(r.gratuity <= E.GRATUITY_CEILING);
  assert.ok(r.ups.payout > 10000);
  assert.equal(r.service.years, 35);
});

test('DA arrears for pending hike', () => {
  const p = { level: '7', basic: 44900, tpta: true, scheme: 'NPS' };
  const a = E.daArrears(p, new Date(2026, 8, 25));
  assert.equal(a.months, 3);
  assert.equal(a.perMonth, Math.round((44900 + 3600) * 0.03));
});
