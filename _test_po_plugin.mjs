/* Offline harness for the host half of dsh-prompt-optimizer-button.
 * Runs the real apply() against a fake cordis context and fakes one HTTP
 * request/response pair, exercising the JSON contract of the rewrite route.
 */
import assert from 'node:assert/strict';
import { apply, REWRITE_ROUTE } from './index.js';

let modelReply = [
  'SCENARIO: paper',
  'DIAGNOSIS: {"taskType":"评价","decision":"决定该结论能否写入论文","checks":[{"name":"验收可判定","passed":false,"note":"缺原始值"},{"name":"信息还是能力","passed":false,"note":"缺统计"},{"name":"层级还是范围","passed":true,"note":"单目标"}]}',
  'PROMPT:',
  '优化后的提示词',
].join('\n');

const routes = [];
let lastStreamOptions = null;
let lastConfiguredEffort;
let failNext = false;
const ctx = {
  get(name) {
    if (name !== 'llm') return undefined;
    return {
      async prepareCall(config, signal, configure) {
        if (!config.provider || !config.model) throw new Error('bad route');
        if (signal?.aborted) throw new Error('aborted');
        lastConfiguredEffort = typeof configure === 'function' ? configure({}).reasoningEffort : undefined;
        return {
          config: { ...config },
          async *stream(options) {
            if (!options.system || !Array.isArray(options.messages)) throw new Error('bad stream options');
            lastStreamOptions = options;
            if (failNext) {
              failNext = false;
              yield {
                type: 'finish',
                reason: { kind: 'error', failure: { code: 'INVALID_REQUEST', message: '400: {"type":"MissingSessionID"}' } },
              };
              return;
            }
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
// Session id is transport metadata for providers that require it (OpenCode 400 MissingSessionID).
assert.equal(lastStreamOptions.sessionId, 'dsh-prompt-optimizer');
// No explicit effort in the request -> the low default applies.
assert.equal(lastConfiguredEffort, 'low');
console.log('200:', JSON.stringify({ ok: data.ok, scenario: data.scenario, text: data.text }));

// An effort chosen in the composer must be honored instead of the default.
const highEffort = fakeResponse();
await handler(
  fakeRequest('POST', {
    text: 'SBRT 20Gy 组 NE 下降说明神经毁损',
    provider: 'deepseek-account',
    model: 'deepseek-flash',
    reasoningEffort: 'high',
  }),
  highEffort,
);
assert.equal(highEffort.statusCode, 200);
assert.equal(lastConfiguredEffort, 'high');
console.log('reasoningEffort honored:', lastConfiguredEffort);

// A user-defined scenario carries its own instruction; the host must pass both on.
const custom = fakeResponse();
await handler(
  fakeRequest('POST', {
    text: '确认 AMD 驱动版本',
    provider: 'deepseek-account',
    model: 'deepseek-flash',
    scenarioLabel: '驱动核查',
    scenarioInstruction: '官方与 GitHub 都要查，两个都要看',
  }),
  custom,
);
assert.equal(custom.statusCode, 200);
const customData = JSON.parse(custom.body);
assert.equal(customData.requestedScenarioLabel, '驱动核查');
assert.equal(customData.requestedScenario, null);
const userText = lastStreamOptions.messages[0].content[0].text;
assert.ok(userText.includes('驱动核查'), 'custom label should reach the model');
assert.ok(userText.includes('官方与 GitHub 都要查'), 'custom instruction should reach the model');
console.log('custom scenario:', JSON.stringify({ label: customData.requestedScenarioLabel }));

// A preset with an extra instruction: the preset hint AND the override text must both reach the model.
const presetExtra = fakeResponse();
await handler(
  fakeRequest('POST', {
    text: 'SBRT 20Gy 组 NE 下降说明神经毁损',
    provider: 'deepseek-account',
    model: 'deepseek-flash',
    scenario: 'paper',
    scenarioLabel: '投稿论文',
    scenarioInstruction: '额外要求：按英文期刊的表述习惯改写',
  }),
  presetExtra,
);
assert.equal(presetExtra.statusCode, 200);
const presetExtraData = JSON.parse(presetExtra.body);
assert.equal(presetExtraData.requestedScenario, 'paper');
assert.equal(presetExtraData.requestedScenarioLabel, '投稿论文');
const presetUserText = lastStreamOptions.messages[0].content[0].text;
assert.ok(presetUserText.includes('额外要求：按英文期刊的表述习惯改写'), 'preset override must reach the model');
assert.ok(presetUserText.includes('草稿：'), 'preset hint must still be applied');
console.log('preset + extra instruction:', JSON.stringify({ scenario: presetExtraData.requestedScenario }));

// The new repo scenario (external project evaluation / adoption): pinning it must
// reach the model, and an auto-detected `SCENARIO: repo` answer must survive parsing.
const repo = fakeResponse();
await handler(
  fakeRequest('POST', {
    text: '看看这个 https://github.com/example/tool 能不能装进我的工作流',
    provider: 'deepseek-account',
    model: 'deepseek-flash',
    scenario: 'repo',
  }),
  repo,
);
assert.equal(repo.statusCode, 200);
const repoData = JSON.parse(repo.body);
assert.equal(repoData.requestedScenario, 'repo');
const repoUserText = lastStreamOptions.messages[0].content[0].text;
assert.ok(repoUserText.includes('未核实'), 'repo hint should reach the model');
assert.ok(repoUserText.includes('草稿：'), 'repo hint must keep the draft marker');
console.log('repo scenario (pinned):', JSON.stringify({ scenario: repoData.requestedScenario }));

modelReply = [
  'SCENARIO: repo',
  'DIAGNOSIS: {"taskType":"决策","decision":"决定该项目是否引入当前环境","checks":[{"name":"验收可判定","passed":true,"note":"可跑命令核对版本"},{"name":"信息还是能力","passed":false,"note":"缺环境清单"},{"name":"层级还是范围","passed":true,"note":"单目标：用不用"}]}',
  'PROMPT:',
  '改写后的评估提示词',
].join('\n');
const autoRepo = fakeResponse();
await handler(fakeRequest('POST', { text: '这个项目怎么样', provider: 'p', model: 'm' }), autoRepo);
const autoRepoData = JSON.parse(autoRepo.body);
assert.equal(autoRepoData.scenario, 'repo');
assert.equal(autoRepoData.text, '改写后的评估提示词');
console.log('repo scenario (auto):', JSON.stringify({ scenario: autoRepoData.scenario }));

// An unknown pinned scenario id is ignored instead of being forwarded.
const unknownScenario = fakeResponse();
await handler(fakeRequest('POST', { text: 'hi', provider: 'p', model: 'm', scenario: 'nope' }), unknownScenario);
assert.equal(JSON.parse(unknownScenario.body).requestedScenario, null);

const emptyText = fakeResponse();
await handler(fakeRequest('POST', { text: '   ', provider: 'p', model: 'm' }), emptyText);
assert.equal(emptyText.statusCode, 400);

const noRoute = fakeResponse();
await handler(fakeRequest('POST', { text: 'hi', model: 'm' }), noRoute);
assert.equal(noRoute.statusCode, 400);

const badMethod = fakeResponse();
await handler(fakeRequest('GET'), badMethod);
assert.equal(badMethod.statusCode, 405);

// An adapter rejection (e.g. 400 MissingSessionID) must surface its reason
// instead of a bare "model returned no text".
failNext = true;
const rejected = fakeResponse();
await handler(fakeRequest('POST', { text: '写一份周报', provider: 'opencode-go', model: 'deepseek-v4.1-flash' }), rejected);
assert.equal(rejected.statusCode, 502);
const rejectedError = JSON.parse(rejected.body).error;
assert.match(rejectedError, /finish=error/);
assert.match(rejectedError, /INVALID_REQUEST/);
console.log('rejected call surfaced:', rejectedError);

console.log('400 / 400 / 405 OK');
console.log('ALL PASS');
