/* Offline harness for the host half of dsh-prompt-optimizer-button.
 * Runs the real apply() against a fake cordis context and fakes one HTTP
 * request/response pair, exercising the JSON contract of the rewrite route.
 */
import assert from 'node:assert/strict';
import { apply, REWRITE_ROUTE } from './index.js';

const modelReply = [
  'SCENARIO: paper',
  'DIAGNOSIS: {"taskType":"评价","decision":"决定该结论能否写入论文","checks":[{"name":"验收可判定","passed":false,"note":"缺原始值"},{"name":"信息还是能力","passed":false,"note":"缺统计"},{"name":"层级还是范围","passed":true,"note":"单目标"}]}',
  'PROMPT:',
  '优化后的提示词',
].join('\n');

const routes = [];
const ctx = {
  get(name) {
    if (name !== 'llm') return undefined;
    return {
      async prepareCall(config, signal) {
        if (!config.provider || !config.model) throw new Error('bad route');
        if (signal?.aborted) throw new Error('aborted');
        return {
          config: { ...config },
          async *stream(options) {
            if (!options.system || !Array.isArray(options.messages)) throw new Error('bad stream options');
            yield { type: 'block-start', index: 0 };
            const step = 24;
            for (let i = 0; i < modelReply.length; i += step) {
              yield { type: 'text-delta', index: 0, text: modelReply.slice(i, i + step) };
            }
            yield { type: 'finish', reason: { kind: 'stop' } };
          },
        };
      },
      async *stream() {},
    };
  },
  inject(services, callback) {
    callback({
      effect: (run) => run(),
      webServer: {
        register(route) {
          routes.push(route);
          return () => {};
        },
      },
    });
  },
};

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    writableEnded: false,
    writeHead(code, headers) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
    },
    end(chunk) {
      this.body = String(chunk ?? '');
      this.writableEnded = true;
    },
    once() {},
    off() {},
    on() {},
  };
}

function fakeRequest(method, payload) {
  async function* body() {
    yield Buffer.from(JSON.stringify(payload ?? {}));
  }
  return { method, [Symbol.asyncIterator]: body };
}

apply(ctx);
assert.equal(routes.length, 1);
assert.equal(routes[0].kind, 'exact');
assert.equal(routes[0].path, REWRITE_ROUTE);
console.log('route registered:', routes[0].kind, routes[0].path);

const handler = routes[0].handler;

const ok = fakeResponse();
await handler(fakeRequest('POST', { text: 'SBRT 20Gy 组 NE 下降说明神经毁损', provider: 'deepseek-account', model: 'deepseek-flash' }), ok);
assert.equal(ok.statusCode, 200);
const data = JSON.parse(ok.body);
assert.equal(data.ok, true);
assert.equal(data.scenario, 'paper');
assert.equal(data.text, '优化后的提示词');
assert.equal(data.diagnosis.checks.length, 3);
assert.equal(data.diagnosis.checks[0].passed, false);
console.log('200:', JSON.stringify({ ok: data.ok, scenario: data.scenario, text: data.text }));

const emptyText = fakeResponse();
await handler(fakeRequest('POST', { text: '   ', provider: 'p', model: 'm' }), emptyText);
assert.equal(emptyText.statusCode, 400);

const noRoute = fakeResponse();
await handler(fakeRequest('POST', { text: 'hi', model: 'm' }), noRoute);
assert.equal(noRoute.statusCode, 400);

const badMethod = fakeResponse();
await handler(fakeRequest('GET'), badMethod);
assert.equal(badMethod.statusCode, 405);

console.log('400 / 400 / 405 OK');
console.log('ALL PASS');
