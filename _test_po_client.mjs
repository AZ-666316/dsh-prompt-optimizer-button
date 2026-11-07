/* Offline smoke test for client.js (the browser bundle).
 * Captures the module definition from window.__ModuleLoader__, evaluates the
 * factory with minimal react stubs, then checks the exported contract and the
 * panel placement math.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('client.js', 'utf8');

let definition = null;
globalThis.window = { __ModuleLoader__: { load(value) { definition = value; } } };
globalThis.document = {
  head: { appendChild() {}, append() {} },
  body: {},
  createElement() {
    return { textContent: '', dataset: {}, setAttribute() {}, appendChild() {}, removeChild() {} };
  },
  addEventListener() {},
  removeEventListener() {},
  querySelector: () => null,
};
try {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN', languages: ['zh-CN'] }, configurable: true });
} catch {
  // Node's own navigator is fine for the smoke test.
}
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, text: 'x' }) });

// eslint-disable-next-line no-new-func
new Function(source)();

assert.ok(definition, 'module loader was never called');
assert.equal(definition.id, 'dsh-prompt-optimizer-button');

const reactStub = {
  createElement: (...args) => ({ type: args[0] }),
  Fragment: Symbol('Fragment'),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect() {},
  useLayoutEffect() {},
  useRef: () => ({ current: null }),
  useMemo: (run) => run(),
  useCallback: (run) => run,
};
const requireStub = (id) => {
  if (id === 'react') return reactStub;
  if (id === 'react-dom') return { createPortal: (node) => node, flushSync: (run) => run() };
  return {};
};

const plugin = definition.factory(requireStub);
assert.deepEqual(plugin.inject, ['slots', 'locale', 'modelDirectories']);
assert.equal(typeof plugin.apply, 'function');
assert.equal(typeof plugin.__test.computePanelPlacement, 'function');

const { computePanelPlacement } = plugin.__test;
const placed = computePanelPlacement({ left: 500, top: 400, right: 700, bottom: 440, width: 200, height: 40 }, 1200, 800);
assert.ok(placed.width <= 1176, 'panel should clamp to viewport width');
assert.ok(placed.left >= 12, 'panel should keep a left margin');
const above = computePanelPlacement({ left: 500, top: 400, bottom: 440, width: 200, height: 40 }, 1200, 800);
assert.ok(above.bottom > 0, 'panel should flip above when there is room');
const below = computePanelPlacement({ left: 500, top: 100, bottom: 140, width: 200, height: 40 }, 1200, 800);
assert.ok(below.top > 0, 'panel should flip below when the button is near the top');
console.log('panel placement:', JSON.stringify({ above, below }));

const slotted = [];
const ctx = {
  effect: (run) => run(),
  locale: { register() {} },
  slots: {
    inject(name, callback) {
      callback();
    },
    register(options, component) {
      slotted.push({ options, component });
      return () => {};
    },
  },
};
plugin.apply(ctx);
assert.equal(slotted.length, 1);
assert.equal(slotted[0].options.id, 'prompt-optimizer-button');
assert.equal(slotted[0].options.order, 100);
assert.equal(typeof slotted[0].component, 'function');
console.log('slot options:', JSON.stringify(slotted[0].options));

// Scenario config: custom scenarios + preset overrides + hidden presets, in localStorage.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};
const { readScenarioConfig, writeScenarioConfig, SCENARIO_CONFIG_KEY, CUSTOM_SCENARIOS_KEY, EDITABLE_PRESETS } = plugin.__test;
assert.deepEqual(readScenarioConfig(), { custom: [], presets: {}, hidden: [] }, 'empty storage reads as defaults');
assert.deepEqual(EDITABLE_PRESETS, ['paper', 'agent', 'daily', 'english']);

// v1 (custom-only) storage is migrated.
store.set(CUSTOM_SCENARIOS_KEY, JSON.stringify([{ id: 'custom-1', label: '  代码审查  ', instruction: '  只补动作和验收  ' }]));
const migrated = readScenarioConfig();
assert.equal(migrated.custom.length, 1);
assert.equal(migrated.custom[0].label, '代码审查');
assert.deepEqual(migrated.presets, {});

// v2 round-trip: custom + preset override + hidden preset.
writeScenarioConfig({
  custom: [{ id: 'custom-1', label: '  代码审查  ', instruction: '  只补动作和验收  ' }],
  presets: { paper: { label: ' 投稿论文 ', instruction: ' 额外按英文期刊习惯 ' }, daily: { label: 'x', instruction: '' } },
  hidden: ['english', 'nope'],
});
const loaded = readScenarioConfig();
assert.ok(store.get(SCENARIO_CONFIG_KEY), 'config should be written to localStorage');
assert.equal(loaded.custom[0].label, '代码审查');
assert.equal(loaded.custom[0].instruction, '只补动作和验收');
assert.deepEqual(loaded.presets.paper, { label: '投稿论文', instruction: '额外按英文期刊习惯' });
assert.equal(loaded.presets.daily.label, 'x', 'rename-only preset overrides are kept');
assert.deepEqual(loaded.hidden, ['english'], 'unknown hidden ids are dropped');

// Invalid entries are dropped on read.
writeScenarioConfig({ custom: [{ id: 'x', label: '', instruction: 'y' }], presets: null, hidden: 'paper' });
assert.deepEqual(readScenarioConfig(), { custom: [], presets: {}, hidden: [] });
console.log('scenario config persistence: OK');
console.log('CLIENT BUNDLE SMOKE PASS');
