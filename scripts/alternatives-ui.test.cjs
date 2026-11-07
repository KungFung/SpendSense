// Lightweight DOM smoke test, not a real browser or visual layout test.
// Loads every script in index.html order to catch integration/startup errors.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..', 'website');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function createApp() {
  class Element {
    constructor() {
      this.children = []; this.listeners = {}; this.dataset = {}; this.style = {};
      this.textContent = ''; this.value = ''; this.checked = false; this.hidden = false;
      const classes = new Set();
      this.classList = {
        toggle: (name, active) => active ? classes.add(name) : classes.delete(name),
        contains: name => classes.has(name),
      };
      this.validity = { valid: true };
    }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, callback) { (this.listeners[name] ??= []).push(callback); }
    dispatch(name) { for (const callback of this.listeners[name] ?? []) callback({ preventDefault() {}, target: this }); }
    querySelectorAll() { return interests.filter(input => input.checked); }
    reset() {}
    play() { return Promise.resolve(); }
    pause() {}
  }
  const elements = new Map();
  const views = [], tabs = [], interests = [];
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const attrs = match[2];
    const el = new Element();
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    const tab = attrs.match(/\bdata-tab="([^"]+)"/)?.[1];
    el.value = attrs.match(/\bvalue="([^"]*)"/)?.[1] ?? '';
    if (id) { el.id = id; assert.ok(!elements.has(id), `Duplicate HTML id: ${id}`); elements.set(id, el); }
    if (tab) { el.dataset.tab = tab; tabs.push(el); }
    if (/\bclass="view\b/.test(attrs)) views.push(el);
    if (/\bname="interests"/.test(attrs)) interests.push(el);
  }
  elements.get('alternatives-city').value = 'Manchester';
  elements.get('alternatives-status').value = 'student';
  elements.get('demo-mode').checked = true;
  const storage = new Map();
  const context = vm.createContext({
    document: {
      getElementById: id => elements.get(id) ?? null,
      createElement: () => new Element(), body: new Element(),
      querySelectorAll: selector => selector === '.view' ? views : selector.includes('[data-tab]') ? tabs : [],
      addEventListener() {}, dispatchEvent() {},
    },
    location: { protocol: 'file:' }, // like opening index.html from disk
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: { addEventListener() {} }, setInterval() {}, setTimeout() {},
  });
  for (const match of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const filename = path.join(root, match[1]);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  return { context, elements, tabs, interests, storage };
}

test('all app scripts start; navigation and profile controls update recommendation cards', () => {
  const { context, elements, tabs, interests, storage } = createApp();
  const form = elements.get('alternatives-profile');
  const today = elements.get('alternatives-today');
  const future = elements.get('alternatives-future');
  assert.equal(today.children.length, 2);
  assert.equal(future.children.length, 2);
  tabs.find(tab => tab.dataset.tab === 'alternatives').dispatch('click');
  assert.equal(elements.get('page-title').textContent, 'Explore alternatives');
  assert.equal(elements.get('view-alternatives').classList.contains('active'), true);

  elements.get('alternatives-city').value = 'Liverpool';
  form.dispatch('change');
  assert.equal(future.children.length, 1); // student does not see worker-only job
  assert.ok(today.children[0].children.some(child => /Liverpool/.test(child.textContent)));
  elements.get('alternatives-budget').value = '0';
  form.dispatch('input');
  assert.equal(today.children.length, 1);
  elements.get('alternatives-status').value = 'worker';
  form.dispatch('change');
  assert.equal(future.children.length, 2); // job and training remain at zero budget

  interests.find(input => input.value === 'food').checked = true;
  form.dispatch('change');
  assert.equal(today.children.length, 0);
  assert.equal(future.children.length, 0);
  assert.equal(elements.get('alternatives-today-empty').hidden, false);
  assert.equal(elements.get('alternatives-future-empty').hidden, false);
  elements.get('alternatives-budget').value = '';
  form.dispatch('input');
  assert.match(elements.get('alternatives-summary').textContent, /Enter an activity budget/);
  assert.equal(storage.size, 0, 'Profile controls must not save personal selections');

  // Smoke-check existing screens and purchase planning after loading the feature.
  for (const name of ['home', 'plan', 'pact']) {
    context.showTab(name);
    assert.equal(elements.get(`view-${name}`).classList.contains('active'), true);
  }
  elements.get('item').value = 'Demo headphones';
  elements.get('price').value = '40';
  elements.get('plan-form').dispatch('submit');
  assert.equal(elements.get('plans').children.length, 1);
  if (typeof context.handlePurchase === 'function') {
    // Newer main uses a simulated purchase handler and hold overlay.
    assert.equal(context.handlePurchase({ shop: 'Demo groceries', amount: 20, type: 'need' }).action, 'allow');
    assert.equal(context.handlePurchase({ shop: 'Demo coat', amount: 200, type: 'want' }).action, 'hold');
    assert.equal(elements.get('hold-overlay').hidden, false);
  } else {
    // This feature branch still uses the original dashboard hold controls.
    elements.get('hold-plan').dispatch('click');
    assert.equal(elements.get('plans').children.length, 2);
    assert.equal(elements.get('hold-card').hidden, true);
    elements.get('demo-reset').dispatch('click');
    assert.equal(elements.get('plans').children.length, 0);
    assert.equal(elements.get('hold-card').hidden, false);
    elements.get('hold-cancel').dispatch('click');
    assert.equal(elements.get('hold-card').hidden, true);
    assert.ok(storage.has('pact.kept'));
  }
});
