// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDA, isSpeculative } from '../scripts/fetch-news.mjs';

test('guesswork headlines are flagged as speculation, facts are not', () => {
  assert.equal(isSpeculative('DA Hike 2026: Central Govt Employees May Get 3% Increase From July', false), true);
  assert.equal(isSpeculative('8th Pay Commission: When will salary hikes reach employees?', false), true);
  assert.equal(isSpeculative('Dearness allowance: No DA hike decision in Union Cabinet meeting today', false), false);
  assert.equal(isSpeculative('Railways notifies Unified Pension Scheme rules for NPS-covered employees', false), false);
  assert.equal(isSpeculative('Cabinet may approve DA', true), false); // official sources are never marked speculation
});

// Wording of the real PIB release of 18 Apr 2026 (DA from 01.01.2026)
const PIB_JAN_2026 = 'Cabinet approves additional instalment of Dearness Allowance to Central Government employees and Dearness Relief (DR) to pensioners w.e.f. 01.01.2026 Posted On: 18 APR 2026 3:14PM by PIB Delhi The Union Cabinet chaired by the Prime Minister has approved to release an additional instalment of Dearness Allowance (DA) to Central Government employees and Dearness Relief (DR) to pensioners w.e.f. 01.01.2026 representing an increase of 2% over the existing rate of 58% of the Basic Pay/Pension, to compensate against price rise.';
const item = text => ({ title: 'Cabinet approves DA', url: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=1', _text: text });

const ratesBefore = {
  da: [
    { from: '2025-01-01', rate: 55, status: 'notified' },
    { from: '2025-07-01', rate: 58, status: 'notified' },
    { from: '2026-01-01', rate: 61, status: 'expected' },
  ],
};

test('official release for the pending period proposes the new DA', () => {
  const p = detectDA(ratesBefore, [item(PIB_JAN_2026)]);
  assert.equal(p.rate, 60);
  assert.equal(p.from, '2026-01-01');
  assert.equal(p.baseMatches, true);
});

test('an old release for an already-notified period proposes nothing', () => {
  const ratesNow = { da: [...ratesBefore.da.slice(0, 2), { from: '2026-01-01', rate: 60, status: 'notified' }, { from: '2026-07-01', rate: 63, status: 'expected' }] };
  assert.equal(detectDA(ratesNow, [item(PIB_JAN_2026)]), null);
});

test('releases that are not about DA are ignored', () => {
  assert.equal(detectDA(ratesBefore, [item('Cabinet approves new railway line w.e.f. 01.01.2026, an increase of 2% in capacity')]), null);
});

test('Hindi release is understood', () => {
  const hi = 'मंत्रिमंडल ने केंद्र सरकार के कर्मचारियों को महंगाई भत्ते की अतिरिक्त किस्त 01.01.2026 से जारी करने को मंजूरी दी, जो मूल वेतन के मौजूदा 58 प्रतिशत की दर पर 2 प्रतिशत की वृद्धि है।';
  assert.equal(detectDA(ratesBefore, [item(hi)]).rate, 60);
});
