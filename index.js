/* eslint-disable */
/**
 * dsh-prompt-optimizer-button — host half.
 *
 * The browser half renders a small sparkle button in the composer. Clicking it
 * asks this host half to rewrite the current draft with one ordinary model call
 * (`ctx.llm`), so the answer lands in the composer instead of becoming a chat
 * turn. The only public surface here is one exact HTTP route:
 *
 *   POST /prompt-optimizer/rewrite
 *   { text: string, provider?: string, model?: string, reasoningEffort?: string }
 *   -> { ok: true, text: string } | { ok: false, error: string }
 *
 * The route is same-origin with the Web GUI, so both the browser build and the
 * desktop shell (which forwards page fetches to this server) reach it without
 * extra configuration. It is loopback-only in practice; no auth is added here
 * because the surrounding Web server does not carry one either.
 *
 * Design notes (learned from `dsh-video-skin`):
 * - `inject` stays empty and nothing is imported from DSH packages, so plugin
 *   activation never blocks the desktop startup handshake.
 * - `webServer` is joined late through `ctx.inject`; `llm` is read lazily with
 *   `ctx.get` at request time so a missing model adapter cannot break boot.
 */

/** Routes this plugin owns. */
export const ROUTE_PREFIX = '/prompt-optimizer';
/** The rewrite endpoint. */
export const REWRITE_ROUTE = `${ROUTE_PREFIX}/rewrite`;

/** Nothing is required at activation time. */
export const inject = [];

const MAX_BODY_BYTES = 256 * 1024;
const MAX_TEXT_CHARS = 20_000;
const MAX_OUTPUT_TOKENS = 4_000;
/** Rewrite is a editing task, not a reasoning puzzle: low effort is both faster and less likely to pad. */
const DEFAULT_REASONING_EFFORT = 'low';
const REQUEST_TIMEOUT_MS = 90_000;
const SCENARIOS = new Set(['paper', 'agent', 'daily', 'english']);

const SCENARIO_HINTS = {
  paper: '用户指定场景：论文 / 科研。优先按科研要求处理（证据等级、竞争性解释、可证伪、不能得出的结论）。',
  agent: '用户指定场景：给 agent 派活。必须写清动作、输入、输出、禁止项、验收命令或失败判据。',
  daily: '用户指定场景：日常提问。只补目标、约束、输出格式，不要加验收表，不要诊断。',
  english: '用户指定场景：英文 / 投稿。保持术语一致性，验收表用英文，不做空泛润色；场景增量仍按草稿内容判断。',
};

const SYSTEM_PROMPT = `你是提示词改写器，不执行任务、不回答用户的问题。输入是一段原始需求草稿；输出必须是一个 JSON 对象（结构见最后），不解释自己、不加前后缀、不用代码块包裹。

内部步骤（只在大脑里做，不要输出过程）：
0. 保留清单（先做）：把用户明确列出的对象、来源、交付物、禁止项和并列要求（"都查 / 都要看 / 分别 / 对比 / 两个都要"）逐条抄出来；改写后逐项核对，任何一项都不能被删除、合并、缩窄，或降级成"不作为依据"。用户点名的来源是硬要求：要求"官方 + GitHub / 论坛 / 第三方"都看，就都要保留，只补可信度标注（官方 = 权威 / 结论依据，第三方 = 旁证 / 交叉核对），**绝不能改写成"只依据官方、不把第三方作为依据"**。允许新增约束，不允许收窄原需求。改写时不要出现"用户点名 / 用户要求"这类元陈述，直接写成任务要求（例："官方驱动页与 GitHub 发布页都要查，缺一不可"），并保留用户原话里的数量词（两个 / 分别 / 各自）。
1. 诊断：任务类型（生成 / 评价 / 决策 / 诊断 / 执行）；它要支撑的决策或用途是什么。
2. 三自检，哪项不过关就按处置规则改：
   ① 验收能否被机器判定？完成这件事是否存在不依赖模型自我声明的判定方式——一个数字、一条命令、一份可核对的原始材料；判定依据不能来自干活的模型自己。不能：先造判据（写测试、定口径、找对照），或明确写"人审：谁审、审什么"。绝对不要用改措辞来对付这一项。
   ② 缺的是信息还是能力？给同领域顶尖的人完全相同的 prompt 和材料，他能做出来吗？能做出来 → 缺信息（补一手材料，别喂二手结论）；做不出来且因为没工具 / 没权限 / 没数据访问 → 缺能力（写明需要什么工具，或直接承认给不了）；两者都不缺 → 任务定义问题（把名词换成动词，给出可执行动作）。
   ③ 在抬抽象层级还是扩范围？同一目标下加深判据（"修好这个崩溃"→"应用始终不崩溃"）是抬层级；新增主题或交付物是扩范围。改写后必须只剩一个可验收的产出；出现两个以上主题就砍掉，回到单目标重做 ①②。
3. 按四问补深度，只补与主任务相关的：
   Q1 该领域顶尖的人会额外做哪些检查或步骤？
   Q2 应当从哪些一手材料入手，而不是二手结论？（用户已点名来源时以用户点名者为准，只补可信度标注，不删来源）
   Q3 他们会用哪些具体方法、工具、参数？
   Q4 什么结果出现就说明判断是错的（要可证伪，不要"证明对"）？
   领域惯例不确定就写【待补：…】，不编造、不罗列通用的正确废话；数字标 [实测] 或 [推断]。
4. 验收（只在论文 / 派活的场景加；日常与英文短草稿不加）：正文末尾加一节"## 验收标准"，表格三列：检查项 | 合格标准 | 不合格的样子，**最多 3 行**，每格一句话（≤20 字）。合格标准必须可机器判定或可外部核对；确实写不出就写"缺可验证判据：…"。
5. 长度与边界（最重要）：只加深度不加宽度；**正文默认不超过原文 1.5 倍且不超过 450 字**，论文 / 派活最多 650 字；不写开场白、不写"以下是改写后的版本"、不复述原稿、不解释改写理由；禁止"从 A/B/C/D 多维度评估"这类横向清单；不用人设词；保留原语言、专有名词、参数名、文件名与既有格式；一稿只保留一个主任务。**改写不得删减用户明确要求（对象 / 来源 / 交付物 / 禁止项）；"只加深度不加宽度"指不新增主题或交付物，不是删掉用户已要的东西。**
6. 原稿已经足够清晰：不重写正文，只在原文后补"验收标准"一节，并在末尾加一行"原稿已达标，仅补验收"。

场景增量（先判断，判断后只按对应要求执行；按 paper → agent → daily 的顺序取最先命中，english 是叠加项、不参与排序）：
- 判据：出现专业术语、数据 / 剂量 / 机制 / 论文或审稿措辞 → paper；草稿里有明确动作 + 交付物（输出格式、文件名、清单、命令、判定标准）→ agent；只有一句话、无交付物、不支撑决策 → daily；整段英文 → english 叠加。
- 只要草稿里出现"输出格式 / 约束 / 交付物"中的任意一项，就按 agent 处理，不要按 daily。
- 论文改稿 / 科研：验收表必须覆盖证据等级、竞争性解释、相关性与机制证明的区分，以及"哪些结论不能由本数据得出"。
- 给 agent 派活：动作、输入、输出、禁止项、验收命令或失败判据必须齐全。
- 日常一句话提问（无明确交付物、不支撑决策）：只补目标、约束、输出格式，不加验收表。**草稿 ≤30 字时更严：把它改写成一个具体、可回答的问题（点明对象 / 环境 / 目标），1–3 句，最多 2 处【待补：…】；不要输出编号步骤模板、不要清单、不要角色设定。**
- 英文 / 投稿：保留术语一致性，验收表用英文，不做空泛润色。

场景可以叠加：英文/投稿只影响语言与术语要求，不改变"科研"或"派活"的增量要求。用户显式指定了场景时，以用户指定为准，不要改判。

输出格式（严格遵守；不要用代码块包裹，不要在三个标题行之外输出任何解释）：
第一行：SCENARIO: paper|agent|daily|english
第二行：DIAGNOSIS:（单独一行，随后紧接一行 JSON 对象，不要换行拆开）
第三行：PROMPT:（单独一行，随后是改写后的提示词全文，Markdown，含验收表）
示例：
SCENARIO: paper
DIAGNOSIS: {"taskType":"评价","decision":"决定能否把该比较写进讨论","checks":[{"name":"验收可判定","passed":true,"note":"与 sham 组对照可核对"},{"name":"信息还是能力","passed":false,"note":"缺信息：未给 sham 数据"},{"name":"层级还是范围","passed":true,"note":"单目标，未扩范围"}]}
PROMPT:
（改写后的提示词全文）
要求：scenario 取最先命中的场景；diagnosis 必须包含 taskType、decision、checks 三项检查；PROMPT: 之后不要出现"诊断/自检/改写说明"，也不要重复本格式说明。`;

/**
 * Read and parse a bounded JSON request body from a Node HTTP request.
 * @param {import('node:http').IncomingMessage} request
 * @returns {Promise<unknown>}
 */
async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('payload too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text === '') return {};
  return JSON.parse(text);
}

/**
 * Send one JSON response.
 * @param {import('node:http').ServerResponse} response
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

/**
 * Strip an optional Markdown fence the model may still wrap around its JSON.
 * @param {string} raw
 * @returns {string}
 */
function stripCodeFence(raw) {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return fenced === null ? trimmed : fenced[1].trim();
}

/**
 * Extract the first balanced `{...}` object starting at `from` (string-aware).
 * @param {string} source
 * @param {number} from index of the opening brace
 * @returns {string | null}
 */
function sliceBalancedObject(source, from) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(from, index + 1);
    }
  }
  return null;
}

/**
 * Normalise one diagnosis payload from the model.
 * @param {unknown} rawDiagnosis
 * @returns {{ taskType: string, decision: string, checks: { name: string, passed: boolean, note: string }[] } | null}
 */
function normaliseDiagnosis(rawDiagnosis) {
  if (rawDiagnosis === null || typeof rawDiagnosis !== 'object') return null;
  const source = rawDiagnosis;
  const checks = Array.isArray(source.checks)
    ? source.checks
        .filter((check) => check !== null && typeof check === 'object')
        .slice(0, 3)
        .map((check) => ({
          name: typeof check.name === 'string' ? check.name : '',
          passed: check.passed === true,
          note: typeof check.note === 'string' ? check.note : '',
        }))
    : [];
  return {
    taskType: typeof source.taskType === 'string' ? source.taskType : '',
    decision: typeof source.decision === 'string' ? source.decision : '',
    checks,
  };
}

/**
 * Parse the marker-based model answer:
 *
 *   SCENARIO: paper
 *   DIAGNOSIS: {...json...}
 *   PROMPT:
 *   <rewritten prompt>
 *
 * Long prompt bodies are kept out of JSON so literal newlines and quotes cannot
 * break parsing. A legacy pure-JSON answer is still accepted as a fallback.
 * @param {string} raw
 * @param {string | undefined} requestedScenario scenario pinned in the UI
 * @returns {{ prompt: string, scenario: string | null, diagnosis: object | null }}
 */
function parseModelAnswer(raw, requestedScenario) {
  const candidate = stripCodeFence(raw).trim();
  const scenarioMatch = /^[ \t]*SCENARIO:[ \t]*([a-z]+)/im.exec(candidate);
  const scenarioFromModel =
    scenarioMatch !== null && SCENARIOS.has(scenarioMatch[1].toLowerCase()) ? scenarioMatch[1].toLowerCase() : null;
  const scenario = requestedScenario ?? scenarioFromModel;

  let diagnosis = null;
  const diagnosisMarker = /^[ \t]*DIAGNOSIS:[ \t]*/im.exec(candidate);
  if (diagnosisMarker !== null) {
    const braceStart = candidate.indexOf('{', diagnosisMarker.index + diagnosisMarker[0].length);
    if (braceStart >= 0) {
      const objectText = sliceBalancedObject(candidate, braceStart);
      if (objectText !== null) {
        try {
          diagnosis = normaliseDiagnosis(JSON.parse(objectText));
        } catch {
          diagnosis = null;
        }
      }
    }
  }

  const promptMarker = /^[ \t]*PROMPT:[ \t]*$/im.exec(candidate);
  let prompt = '';
  if (promptMarker !== null) {
    prompt = candidate.slice(promptMarker.index + promptMarker[0].length).trim();
  }
  prompt = stripCodeFence(prompt);

  if (prompt !== '') return { prompt, scenario, diagnosis };

  // Legacy fallback: the whole answer may still be a JSON object with a "prompt" key.
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (parsed !== null && typeof parsed === 'object' && typeof parsed.prompt === 'string' && parsed.prompt.trim() !== '') {
        return {
          prompt: parsed.prompt.trim(),
          scenario: requestedScenario ?? (typeof parsed.scenario === 'string' && SCENARIOS.has(parsed.scenario) ? parsed.scenario : scenarioFromModel),
          diagnosis: normaliseDiagnosis(parsed.diagnosis),
        };
      }
    } catch {
      // fall through to raw
    }
  }

  // Last resort: keep whatever text the model produced (minus the marker lines).
  const cleaned = candidate
    .replace(/^[ \t]*SCENARIO:[^\n]*\n?/im, '')
    .replace(/^[ \t]*DIAGNOSIS:[^\n]*\n?/im, '')
    .replace(/^[ \t]*PROMPT:[ \t]*\n?/im, '')
    .trim();
  return { prompt: cleaned === '' ? candidate : cleaned, scenario, diagnosis };
}


/**
 * Rewrite the draft with a single model call and parse the structured answer.
 * @param {object} options
 * @param {{ stream: Function, prepareCall: Function }} options.llm
 * @param {{ provider: string, model: string, reasoningEffort?: string }} options.route
 * @param {string} options.text
 * @param {AbortSignal} options.signal
 * @param {string | undefined} options.scenario explicit scenario chosen in the UI
 * @returns {Promise<{ prompt: string, scenario: string | null, diagnosis: object | null }>}
 */
async function rewriteViaLlm({ llm, route, text, signal, scenario }) {
  const userText = scenario === undefined ? text : `${SCENARIO_HINTS[scenario]}\n\n草稿：\n${text}`;
  const messages = [{ role: 'user', content: [{ type: 'text', text: userText }] }];
  let output = '';
  let finishKind = null;

  const consume = async (call) => {
    for await (const chunk of call.stream({ ...call.config, system: SYSTEM_PROMPT, messages, signal })) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        output += chunk.text;
      } else if (chunk.type === 'finish') {
        finishKind = chunk.reason?.kind ?? null;
      }
    }
  };
  const configure = (reasoningEffort) => (controls) => ({
    ...controls,
    maxTokens: MAX_OUTPUT_TOKENS,
    ...(reasoningEffort === null ? {} : { reasoningEffort }),
  });
  const prepare = () => llm.prepareCall({ provider: route.provider, model: route.model }, signal, configure(DEFAULT_REASONING_EFFORT));

  try {
    await consume(await prepare());
  } catch (error) {
    const message = String(error?.message ?? error);
    // A model that does not accept the effort id still has to work: retry once without it.
    if (signal.aborted || !/reasoning|effort/i.test(message)) throw error;
    output = '';
    finishKind = null;
    await consume(await llm.prepareCall({ provider: route.provider, model: route.model }, signal, configure(null)));
  }

  const trimmed = output.trim();
  if (trimmed === '') throw new Error('model returned no text');
  if (finishKind !== null && finishKind !== 'stop') {
    if (finishKind === 'max-tokens') {
      // The prompt section is usually complete even when the tail was cut: keep it rather than failing.
      const hasPromptSection = /(^|\n)\s*PROMPT:\s*\n[\s\S]*\S/.test(trimmed);
      if (hasPromptSection) {
        const partial = parseModelAnswer(trimmed, scenario);
        if (partial.prompt) return { ...partial, truncated: true };
      }
      throw new Error('输出被截断（达到 max tokens），请缩短草稿或重试');
    }
    throw new Error(`model call ended with ${finishKind}`);
  }
  return parseModelAnswer(trimmed, scenario);
}

/**
 * Host plugin body: register the rewrite route on the Web server.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  /**
   * One HTTP handler: validate, call the model, answer JSON.
   * @param {import('node:http').IncomingMessage} request
   * @param {import('node:http').ServerResponse} response
   */
  const handler = async (request, response) => {
    if (request.method !== 'POST') {
      sendJson(response, 405, { ok: false, error: 'method not allowed' });
      return;
    }

    let input;
    try {
      input = await readJsonBody(request);
    } catch (error) {
      sendJson(response, 400, { ok: false, error: String(error?.message ?? error) });
      return;
    }

    const payload = input !== null && typeof input === 'object' ? input : {};
    const text = typeof payload.text === 'string' ? payload.text : '';
    if (text.trim() === '') {
      sendJson(response, 400, { ok: false, error: 'text is empty' });
      return;
    }
    if (text.length > MAX_TEXT_CHARS) {
      sendJson(response, 413, { ok: false, error: `text is longer than ${MAX_TEXT_CHARS} characters` });
      return;
    }

    const provider = typeof payload.provider === 'string' ? payload.provider.trim() : '';
    const model = typeof payload.model === 'string' ? payload.model.trim() : '';
    if (provider === '' || model === '') {
      sendJson(response, 400, { ok: false, error: 'provider and model are required (pick a model in the composer)' });
      return;
    }

    const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined;
    if (llm === undefined || llm === null || typeof llm.prepareCall !== 'function' || typeof llm.stream !== 'function') {
      sendJson(response, 503, { ok: false, error: 'model service is not available' });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), REQUEST_TIMEOUT_MS);
    // Abort only when the CLIENT goes away before we finish. `request`'s own
    // 'close' fires on normal completion in Node, so watch the response instead.
    const onClose = () => {
      if (!response.writableEnded) controller.abort(new Error('client closed'));
    };
    if (typeof response.once === 'function') response.once('close', onClose);

    // Optional explicit scenario from the client ("auto" or absent = let the model judge).
    const requestedScenario =
      typeof payload.scenario === 'string' && SCENARIOS.has(payload.scenario) ? payload.scenario : undefined;

    try {
      const result = await rewriteViaLlm({
        llm,
        route: {
          provider,
          model,
          reasoningEffort: typeof payload.reasoningEffort === 'string' ? payload.reasoningEffort : undefined,
        },
        text,
        signal: controller.signal,
        scenario: requestedScenario,
      });
      sendJson(response, 200, {
        ok: true,
        text: result.prompt,
        scenario: result.scenario,
        diagnosis: result.diagnosis,
        requestedScenario: requestedScenario ?? null,
      });
    } catch (error) {
      const message = String(error?.message ?? error);
      const status = /abort|timeout|client closed/i.test(message) ? 499 : 502;
      sendJson(response, status, { ok: false, error: message });
    } finally {
      clearTimeout(timer);
      if (typeof response.off === 'function') response.off('close', onClose);
    }
  };

  // Join the Web server late: activation never waits for it, and the route is
  // removed again if the plugin is disposed.
  ctx.inject(['webServer'], (child) => {
    child.effect(() => {
      const dispose = child.webServer.register({
        kind: 'exact',
        path: REWRITE_ROUTE,
        handler,
      });
      return () => {
        if (typeof dispose === 'function') dispose();
      };
    }, 'prompt-optimizer-button: rewrite route');
  });
}
