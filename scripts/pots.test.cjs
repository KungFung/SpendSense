// Run from the repo root: node --test scripts/pots.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pots = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../website/js/pots.js'), 'utf8') + '\nPactPots');
const create = (state = pots.initialState(), name = 'Emergency', target = '100') =>
  pots.createPot(state, { name, category: 'emergency', target }, name);

test('creating pots leaves the fictional starting balance unchanged', () => {
  const state = create();
  assert.equal(state.availablePence, 20000);
  assert.equal(state.pots[0].balancePence, 0);
  assert.equal(state.pots[0].targetPence, 10000);
  assert.equal(create(pots.initialState(), 'Flexible', '').pots[0].targetPence, null);
});

test('adding and withdrawing preserve the total across multiple pots', () => {
  let state = create(create(), 'Holiday', '500');
  state = pots.transfer(state, 'Emergency', '50', 'add');
  state = pots.transfer(state, 'Holiday', '20', 'add');
  assert.equal(state.availablePence, 13000);
  state = pots.transfer(state, 'Emergency', '10', 'withdraw');
  assert.equal(state.availablePence, 14000);
  assert.equal(state.pots[0].balancePence, 4000);
  assert.equal(state.availablePence + state.pots.reduce((sum, pot) => sum + pot.balancePence, 0), 20000);
});

test('penny amounts remain exact through repeated transfers', () => {
  let state = create();
  for (let i = 0; i < 100; i++) state = pots.transfer(state, 'Emergency', '0.01', 'add');
  assert.equal(state.pots[0].balancePence, 100);
  assert.equal(state.availablePence, 19900);
  assert.equal(pots.toPence('12.34'), 1234);
});

test('cannot spend more than available or withdraw more than a pot holds', () => {
  const state = create();
  assert.throws(() => pots.transfer(state, 'Emergency', '200.01', 'add'), /enough available/);
  assert.throws(() => pots.transfer(state, 'Emergency', '1', 'withdraw'), /that much/);
  const full = pots.transfer(state, 'Emergency', '200', 'add');
  assert.equal(full.availablePence, 0);
  assert.equal(pots.transfer(full, 'Emergency', '200', 'withdraw').availablePence, 20000);
});

test('invalid amounts are rejected without changing the state', () => {
  const state = create();
  const before = JSON.stringify(state);
  for (const amount of ['0', '-1', '1.001', '', 'abc', 'Infinity', '1e2', '9007199254740992']) {
    assert.throws(() => pots.transfer(state, 'Emergency', amount, 'add'));
  }
  assert.throws(() => pots.transfer(state, 'missing', '1', 'add'));
  assert.throws(() => pots.transfer(state, 'Emergency', '1', 'other'));
  assert.equal(JSON.stringify(state), before);
});

test('names, categories and optional targets are validated', () => {
  assert.throws(() => create(pots.initialState(), '   '));
  assert.throws(() => create(pots.initialState(), 'x'.repeat(41)));
  assert.throws(() => create(create(), ' emergency '), /already have/);
  assert.throws(() => create(pots.initialState(), 'New', '0'));
  assert.throws(() => create(pots.initialState(), 'New', '-20'));
  assert.throws(() => pots.createPot(pots.initialState(), { name: 'New', category: 'unknown' }));
});

test('targets are progress goals, not limits on saving', () => {
  const state = pots.transfer(create(pots.initialState(), 'Emergency', '10'), 'Emergency', '20', 'add');
  assert.equal(state.pots[0].balancePence, 2000);
  assert.equal(state.pots[0].targetPence, 1000);
});

function memoryStorage() {
  const records = new Map();
  return {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
  };
}

test('balances, names and targets survive saving and reloading', () => {
  const storage = memoryStorage();
  const state = pots.transfer(create(), 'Emergency', '12.34', 'add');
  assert.equal(pots.persist(storage, state), true);
  const restored = pots.restore(storage);
  assert.equal(restored.warning, '');
  assert.equal(JSON.stringify(restored.state), JSON.stringify(state));
});

test('missing storage starts fresh without writing over other Pact features', () => {
  const storage = memoryStorage();
  storage.setItem('pact.kept', '340');
  const restored = pots.restore(storage);
  assert.equal(restored.state.availablePence, 20000);
  pots.persist(storage, create());
  assert.equal(storage.getItem('pact.kept'), '340');
});

test('corrupt or inconsistent saved data shows a warning instead of invalid balances', () => {
  for (const raw of ['{broken', 'null', JSON.stringify({ version: 1, availablePence: -1, pots: [] }),
    JSON.stringify({ ...create(), availablePence: 50000 }),
    JSON.stringify({ ...create(), version: 99 })]) {
    const restored = pots.restore({ getItem: () => raw });
    assert.ok(restored.warning);
    assert.equal(restored.state.availablePence, 20000);
    assert.equal(restored.state.pots.length, 0);
  }
});

test('unavailable storage keeps manual operations usable and reports saving failure', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('full'); },
  };
  assert.ok(pots.restore(storage).warning);
  const state = pots.transfer(create(), 'Emergency', '1', 'add');
  assert.equal(pots.persist(storage, state), false);
  assert.equal(state.pots[0].balancePence, 100);
});
