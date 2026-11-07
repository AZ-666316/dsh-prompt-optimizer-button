# dsh-prompt-optimizer-button

<p align="center">
  <img src="assets/icon-512.png" alt="prompt-optimizer-button icon" width="128" height="128">
</p>

## Codex / 其他 agent 用法（skill）

Codex 的输入框没有插件接口，做不到在 composer 里加按钮；但可以用 **skill** 版：`skills/prompt-optimizer/SKILL.md`，规则与宿主侧一致（判场景 + 三自检 + 四问 + 长度红线 + 固定输出格式）。

安装 `skills/prompt-optimizer/` 到下面任一位置即可：

- Codex：`~/.codex/skills/prompt-optimizer/`，或 `~/.agents/skills/prompt-optimizer/`（DSH 与 Codex 共用）
- DSH：用户级 `~/.dsh/skills/prompt-optimizer/`，或项目级 `.dsh/skills/prompt-optimizer/`

调用方式：Codex 里说“优化这个提示词”，或显式 `$prompt-optimizer`；DSH 里可用 `/prompt-optimizer`。具体前缀取决于所用客户端的 skill 调用语法。

Codex 里唯一“发送前”的钩子是 `UserPromptSubmit` hook，但它只能阻断或注入上下文、不能替换输入框内容，所以本插件不依赖它（详见 [Codex hooks](https://developers.openai.com/codex/hooks)）。

## 截图

<p align="center">
  <img src="assets/screenshots/01-composer.png" alt="composer with scenario badge and optimize button" width="760"><br>
  <sub>输入框里：场景徽标 + 优化按钮，位于模型选择器与发送按钮之间</sub>
</p>

<p align="center">
  <img src="assets/screenshots/02-diagnosis-panel.png" alt="diagnosis panel" width="760"><br>
  <sub>诊断面板：场景 chips、任务类型与支撑决策、三条自检（✓ / !）</sub>
</p>

<p align="center">
  <img src="assets/screenshots/03-optimizing.png" alt="optimizing state" width="360"><br>
  <sub>优化进行中：按钮呼吸闪烁，面板显示“正在优化…”</sub>
</p>

给 DSH 输入框加一个「优化提示词」小图标（sparkle）按钮，并在它旁边加一个场景徽标：位置在 **模型选择框与发送按钮之间**（麦克风/发送按钮左侧）。

点一下图标，插件会把当前草稿发给宿主侧的一小段服务，用**当前选中的模型**跑一次普通的模型调用，把改写后的提示词**直接替换回输入框**：

- 不发送、不新增对话轮次，你先看、先改，再按 Enter；
- 使用输入框里当前选的 provider/model（含 reasoning effort），不另配密钥；
- 草稿为空时按钮置灰；请求进行中图标呼吸闪烁、按钮不可再点；失败时图标变红并自动打开面板说明原因；
- 徽标显示模型这次判断出的场景（自动 / 论文 / 派活 / 日常 / 英文），点徽标可打开面板、手动钉住下一次要用的场景。

## 场景徽标与诊断面板

一次调用同时返回三样东西：改写后的提示词（写回输入框）、判断出的场景、以及结构化诊断。诊断不进输入框，只显示在弹出面板里：

- 面板标题行右侧显示模型识别到的场景，正文依次是：功能提示、场景选择 chips（自动/论文/派活/日常/英文，点一下即钉住）、诊断（任务类型、要支撑的决策）与三条自检（✓ 通过 / ! 未通过，各带一句理由）、失败原因（仅失败时）；
- 面板用 `position: fixed` 挂在按钮上方（空间不足自动翻到下方），水平居中并夹在视口内；外部点击、`Escape`、关闭按钮都能收起；`role="dialog"`；
- 视觉为深色半透明 + 背景模糊 + 圆角 14 + 投影，徽标是圆点 + 文字的胶囊；按钮禁用态用 `aria-disabled`（原生 `disabled` 会让 Chromium 不派发指针事件），点击守卫仍在 `onClick` 里。

## 结构

```
dsh-prompt-optimizer-button/
├─ package.json        # dsh.bundle.patch + dsh.client
├─ cordis.patch.yml    # 往 profile 组合里插入 host 行
├─ index.js            # 宿主侧：POST /prompt-optimizer/rewrite（ctx.llm 一次调用）
├─ client.js           # 浏览器侧：__ModuleLoader__ bundle，按钮 + portal 定位 + fetch
├─ assets/             # 图标与截图
├─ skills/prompt-optimizer/SKILL.md  # Codex / 其他 agent 的 skill 版
├─ publish/            # 商店上架草稿：awesome-entry.yml、CHECKLIST.md、PR_BODY.md
└─ README.md
```

- 浏览器侧注册 `conversation.input.right` 单元格，用 `ReactDOM.createPortal` 把徽标与按钮插到 composer trailing 行的 `standardControls`（模型选择器块）之后；诊断面板再 portal 到 `document.body`，用按钮矩形算固定定位坐标。
- 宿主侧注册一条同源路由 `POST /prompt-optimizer/rewrite`：
  `{ text, provider, model, reasoningEffort?, scenario? } → { ok: true, text, scenario, diagnosis }`。
  `text` 是改写后的提示词（唯一写回输入框的内容），`scenario` / `diagnosis` 只给面板用。
  桌面版页面 origin 是 `dsh-app://app`，主进程会把非本地资源的 fetch 转发到宿主 Web 服务器（带认证 cookie），所以相对路径 `fetch('prompt-optimizer/rewrite')` 在桌面与网页版都能用。
- 模型答案用行标记解析（`SCENARIO:` / `DIAGNOSIS:` / `PROMPT:`），长提示词正文不塞进 JSON 字符串，避免换行与引号导致解析失败；解析失败时回退为「整段当提示词」。

- 宿主侧不 `import` 任何 `@deepseek-ai/*` 包（profile 里并没有 dsh-llm），只通过 `ctx.get('llm')` / `ctx.inject(['webServer'])` 拿运行时服务，避免插件拖慢或拖垮启动握手。

## 依赖

- 运行中的 DSH（0.2.2 级别）自带 `llm`、`webServer` 服务即可，无需额外包。
- 不再依赖 `prompt-optimizer` 技能：优化规则写在 `index.js` 的 system prompt 里（技能仍是给对话用的，两者不冲突）。

## 安装

本机已通过 `plugin_manager` 的 `install_bundle` 以 `link:` 方式装到 `desktop` profile。手动安装等价于：

1. 在 profile（如 `%USERPROFILE%\.dsh\profiles\desktop\package.json`）的 `dependencies` 加
   `"dsh-prompt-optimizer-button": "link:<本目录绝对路径>"`；
2. 把 `dsh-prompt-optimizer-button` 加进 `dsh.profile.bundles`；
3. 让 profile 重新组装（`plugin_manager` 的 set/install，或重启 DSH），页面刷新后生效。

## 卸载

- `plugin_manager` 里禁用/移除 `prompt-optimizer-button` 行，或
- `dsh plugin --profile desktop remove dsh-prompt-optimizer-button`。

## 已知限制

- DSH 0.2.2 的 composer 内部 DOM 不是公开 API；升级后若 `[data-composer-card]` / `standardControls` 结构变化，按钮定位会失效（有「发送按钮前」的兜底定位）。
- 按钮只在会话输入框出现（欢迎 hero 态没有该单元格）。
- 宿主路由不做额外鉴权，依赖 Web 服务器本身只在 loopback 暴露；若要对外暴露需自行加策略。
- 单次请求上限：输入 20k 字符、输出 4000 tokens、超时 90 秒；输出被 max tokens 截断时，若已解析出完整提示词则保留并标记，否则提示缩短草稿重试。
- 目前不自动发送；要「点完直接发送」改 `client.js` 的 `onClick`，在 `setDraft` 后调用 `inputActions.submit()`。
