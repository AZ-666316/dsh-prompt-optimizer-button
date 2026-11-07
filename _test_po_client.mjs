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
console.log('CLIENT BUNDLE SMOKE PASS');
