// Run from the repository root: node --test scripts/alternatives.test.cjs
// Uses Node's built-in test runner; no dependencies or browser required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = ['opportunities-data.js', 'alternatives.js'].map(name =>
  fs.readFileSync(path.join(root, 'website/js', name), 'utf8')).join('\n');
const { recommend, data } = vm.runInNewContext(source +
  '\n({ recommend: recommendOpportunities, data: PACT_DEMO_OPPORTUNITIES })');
const profile = { city: 'Manchester', budget: 10, status: 'student', interests: [] };
const all = result => [...result.feelBetterToday, ...result.buildMyFuture];

test('eight fictional records cover both cities and all four categories', () => {
  assert.equal(data.length, 8);
  assert.equal(new Set(data.map(r => r.id)).size, 8);
  for (const city of ['Manchester', 'Liverpool']) {
    const records = data.filter(r => r.city === city);
    assert.equal(records.length, 4);
    for (const category of ['Free activity', 'Affordable activity', 'Job', 'Training']) {
      assert.ok(records.some(r => r.category === category));
    }
  }
  for (const record of data) {
    assert.equal(record.isFictional, true);
    assert.match(record.notice, /not a real listing/);
    assert.ok(Number.isFinite(record.cost) && record.cost >= 0);
  }
});

test('changing city changes every location-specific recommendation', () => {
  for (const city of ['Manchester', 'Liverpool']) {
    const matches = all(recommend({ ...profile, city }));
    assert.ok(matches.length > 0);
    assert.ok(matches.every(r => r.city === city));
  }
});

test('zero activity budget excludes paid activities but keeps jobs and training', () => {
  for (const [city, status] of [['Manchester', 'student'], ['Liverpool', 'worker']]) {
    const result = recommend({ ...profile, city, status, budget: 0 });
    assert.equal(result.feelBetterToday.length, 1);
    assert.ok(result.feelBetterToday.every(r => r.cost === 0));
    assert.ok(result.buildMyFuture.some(r => r.category === 'Job'));
    assert.ok(result.buildMyFuture.some(r => r.category === 'Training'));
  }
});

test('budget boundary includes an activity at its exact cost', () => {
  assert.equal(recommend({ ...profile, budget: 3.99 }).feelBetterToday.length, 1);
  assert.equal(recommend({ ...profile, budget: 4 }).feelBetterToday.length, 2);
});

test('student-only and worker-only jobs respect the selected status', () => {
  assert.ok(!all(recommend({ ...profile, status: 'worker' })).some(r => r.id === 'demo-manchester-job'));
  assert.ok(!all(recommend({ ...profile, city: 'Liverpool' })).some(r => r.id === 'demo-liverpool-job'));
  for (const status of ['student', 'worker']) {
    assert.ok(all(recommend({ ...profile, status })).every(r => r.audiences.includes(status)));
  }
});

test('interests filter with any selected match and explain relevance', () => {
  const matches = all(recommend({ ...profile, interests: [' FOOD ', 'technology'] }));
  assert.equal(matches.length, 3);
  assert.ok(matches.every(r => r.reasons.some(reason => reason.startsWith('Matches your interests:'))));
  assert.equal(all(recommend({ ...profile, interests: ['unknown'] })).length, 0);
});

test('invalid budgets and unsupported cities give no misleading results', () => {
  for (const budget of [-1, '', ' ', NaN, Infinity, null]) {
    assert.equal(all(recommend({ ...profile, budget })).length, 0);
  }
  assert.equal(all(recommend({ ...profile, city: 'Unknown' })).length, 0);
  assert.equal(all(recommend()).length, 0);
});

test('recommendations do not change the source dataset or input profile', () => {
  const before = JSON.stringify({ data, profile });
  recommend(profile);
  assert.equal(JSON.stringify({ data, profile }), before);
});
