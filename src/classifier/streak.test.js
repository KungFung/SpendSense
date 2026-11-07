const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateStreak, isoWeekKey } = require('../../website/js/streak.js');
const { parseStatementCsv } = require('../../website/js/classifier/csvLoader.js');

const tx = (date, type, amount, extra = {}) => ({ date, type, amount, ...extra });

test('counts a clean run across days with no purchases', () => {
  const result = calculateStreak([
    tx('2026-11-01', 'want', 10),
    tx('2026-11-03', 'need', 20),
  ], { allowance: null, events: [] });
  assert.equal(result.days, 3);
  assert.equal(result.onTrackLast30, 3);
});

test('one allowance breach in a week uses the grace day', () => {
  const result = calculateStreak([
    tx('2026-11-02', 'want', 30),
    tx('2026-11-03', 'want', 80),
    tx('2026-11-04', 'want', 30),
  ], { allowance: 50, events: [] });
  assert.equal(result.statuses.find((d) => d.date === '2026-11-03').status, 'grace');
  assert.equal(result.days, 3);
});

test('second breach in the same week breaks the streak', () => {
  const result = calculateStreak([
    tx('2026-11-02', 'want', 80),
    tx('2026-11-03', 'want', 80),
  ], { allowance: 50, events: [] });
  assert.equal(result.statuses[0].status, 'grace');
  assert.equal(result.statuses[1].status, 'broken');
  assert.equal(result.days, 0);
});

test('emergency overrides use the weekly grace day; a later one can break', () => {
  const result = calculateStreak([
    tx('2026-11-02', 'want', 10),
    tx('2026-11-03', 'want', 10),
  ], { allowance: null, events: [
    { date: '2026-11-02', type: 'emergency_override' },
    { date: '2026-11-03', type: 'emergency_override' },
  ] });
  assert.equal(result.statuses[0].status, 'grace');
  assert.equal(result.statuses[1].status, 'broken');
  assert.equal(result.days, 0);
});

test('grace allowance resets at the start of a new ISO week', () => {
  assert.notEqual(isoWeekKey('2026-11-01'), isoWeekKey('2026-11-02'));
  const result = calculateStreak([
    tx('2026-11-01', 'want', 80),
    tx('2026-11-02', 'want', 80),
  ], { allowance: 50, events: [] });
  assert.equal(result.statuses[0].status, 'grace');
  assert.equal(result.statuses[1].status, 'grace');
  assert.equal(result.days, 2);
});

test('needs do not count towards the optional daily want limit', () => {
  const result = calculateStreak([
    tx('2026-11-02', 'need', 500),
    tx('2026-11-02', 'want', 40),
  ], { allowance: 50, events: [] });
  assert.equal(result.statuses[0].status, 'on_track');
});

test('CSV parser reads an explicit emergency override column without treating ordinary flags as overrides', () => {
  const rows = parseStatementCsv([
    'Date,Description,Value,Flagged,Emergency Override',
    '2026-11-01,Shop,-20,Yes,No',
    '2026-11-02,Shop,-30,No,Yes',
  ].join('\n'));
  assert.equal(rows[0].emergencyOverride, false);
  assert.equal(rows[1].emergencyOverride, true);
});

test('a flagged, unplanned transaction breaks the day after the weekly grace day is used', () => {
  const result = calculateStreak([
    tx('2026-11-02', 'want', 20, { ruleBroken: true }),
    tx('2026-11-03', 'want', 20, { ruleBroken: true }),
  ], { allowance: null, events: [] });
  assert.equal(result.statuses[0].status, 'grace');
  assert.equal(result.statuses[1].status, 'broken');
  assert.equal(result.days, 0);
});

test('a planned/pre-approved purchase does not break the streak', () => {
  const rows = parseStatementCsv([
    'Date,Type,Description,Value,Flagged,Pre-approved',
    '02 Nov 2026 12:00,POS,\'CURRYS,-250.00,Yes,Yes',
  ].join('\n'));
  assert.equal(rows[0].flagged, true);
  assert.equal(rows[0].preApproved, true);
  const result = calculateStreak([
    tx(rows[0].date, 'want', 250, { ruleBroken: rows[0].flagged && !rows[0].preApproved }),
  ], { allowance: null, events: [] });
  assert.equal(result.statuses[0].status, 'on_track');
});

test('the generated statement CSV columns are parsed into rule and planned-purchase signals', () => {
  const rows = parseStatementCsv([
    'Date,Type,Description,Value,Balance,Flagged,Pre-approved',
    '02 Nov 2026 12:00,POS,\'DELIVEROO,-25.00,900.00,Yes,No',
    '03 Nov 2026 12:00,POS,\'CURRYS,-250.00,650.00,Yes,Yes',
  ].join('\n'));
  assert.deepEqual(rows.map(({ flagged, preApproved }) => [flagged, preApproved]), [
    [true, false],
    [true, true],
  ]);
});
