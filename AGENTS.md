# dsh-prompt-optimizer-button · 项目协作说明

> 本工作区根目录就是插件仓库根目录（与 GitHub `AZ-666316/dsh-prompt-optimizer-button` 同源）。
> 目标：DSH 输入框内的「优化提示词」按钮 + 场景徽标 + 结构化诊断面板；本仓库同时含 Codex skill 版本。

## 目录与关键文件

- `index.js` — 宿主插件：`ctx.inject(['webServer'])` 注册 `POST /prompt-optimizer/rewrite`；调 `ctx.llm` 流式生成；模型输出用行标记协议 `SCENARIO: / DIAGNOSIS: / PROMPT:` 解析；不 import 任何 `@deepseek-ai/*` 包（profile 里没有 dsh-llm 等）。
- `client.js` — 浏览器 bundle（`window.__ModuleLoader__.load`）：在 `conversation.input.right` 注册单元格，用 portal 把「场景徽标 + sparkle 按钮」插到 `.standardControls` 之后；点按钮 → 同源 `fetch('prompt-optimizer/rewrite')` → `inputActions.setDraft()` 写回；徽标点开诊断面板（场景 chips 可钉住）。
- `cordis.patch.yml` — `- insert: [{id: prompt-optimizer-button, name: './index.js'}]`（name 是相对 patch 文件的路径）。
- `package.json` — 含 `dsh.bundle.patch` 与 `dsh.client`；`engines.dsh` 指向 0.2.2-rc 线。
- `skills/prompt-optimizer/SKILL.md` — Codex / 其他 agent 的 skill 版；DSH 侧用 `.dsh/skills` junction 指到同一份。
- `publish/` — 商店条目草稿（`awesome-entry.yml`）、PR 正文、release notes、checklist。
- `assets/` — 图标与截图、演示 GIF。

## 发布纪律（最重要）

- **任何 `npm publish` / `git push` / 商店 PR / Release，都必须先等用户说「上传」。** 本地改代码、`node --check`、跑测试、`plugin_manager` 重载验证都允许随时做。
- 发布动作只在一个「发布会话」里执行，避免并发提交/重复发版。
- 发版前先升 `package.json` 版本（改行为 = minor/patch 视情况；只改 README/GIF 也要升 patch 才能更新 npm 页面），再 `npm publish --access public`（token 在本地 `.npmrc`，已 gitignore）。
- npm 新包可能进 staged publishing（`0.0.0-stage` 占位），等或 `npm stage approve`；发布后 `npm view dsh-prompt-optimizer-button version` + 临时目录 `npm install` 验证。

## 验证命令（改完必跑）

```powershell
node --check index.js
node --check client.js
node _test_po_plugin.mjs    # 宿主路由/参数校验用例
node _test_po_client.mjs    # 客户端 bundle 冒烟 + 面板定位
```

插件重载：`plugin_manager set_plugin include:prompt-optimizer-button` disable → enable（返回 `application:"applied"` 即生效；桌面窗口 Ctrl+R 刷新页面看 UI）。

## 约束

- 不改 GitHub 上 `awesome-dsh-plugin` 的生成文件；商店收录 = 向该仓库提 PR 加 `data/plugins/<owner>__<repo>.yml`。
- 不提交 `.npmrc`、`node_modules/`、临时提取物（`_asar_x/` 等）。
- composer DOM/插槽不是公开 API，升级 DSH 后先验证插槽 id 与 `.standardControls` 仍在。
- 中文沟通，称呼用户「老大」；结论前置、少客套。
