# v0.5.1 — 修复 opencode-go 等按会话路由的 provider（#1）

Patch release on top of 0.5.0. 修复 GitHub issue #1：在按会话路由的 `pi-ai` provider（如 OpenCode Go `opencode-go`）上，优化请求总是失败并报 `model returned no text`。

## 修复

- **带上 session id**：优化调用现在把稳定的 `sessionId`（`dsh-prompt-optimizer`）作为传输元数据传给 `ctx.llm.stream`。OpenCode 一类网关要求 `x-opencode-session` 头，缺失时返回 `400 MissingSessionID`；该 id 只用于路由/缓存，不会进入模型输入。
- **尊重输入框的 reasoningEffort**：此前永远用默认 `low`，现在优先使用 `modelDirectories` 里当前模型的 effort，只有缺失时才回退。
- **失败不再被吞**：空输出时把 `finish` 原因与 adapter 失败写进错误，例如 `model returned no text [finish=error / INVALID_REQUEST | 400: {"type":"MissingSessionID"}]`；服务端非 stop 结束时也会带上原因，方便自查。

## 验证

- 离线 harness 新增三条断言：`sessionId === 'dsh-prompt-optimizer'`、`reasoningEffort: "high"` 会透传、rejected finish 原因进入响应错误。
- 直线 HTTP 冒烟：`deepseek-account` 正常返回；错误配置的模型名现在会直接显示上游 400 原因，而不是笼统的 “no text”。

---

# v0.5.0 — 新增「项目评估」场景

Prompt optimizer for the DSH composer. 点输入框里的小星星，用当前选中的模型就地润色草稿，不新增对话轮次。

## 功能

- **就地润色**：替换当前草稿，不产生新的 user message，不浪费一轮对话。
- **新增「项目评估」场景（repo）**：草稿里出现 GitHub / GitLab / Gitee / 项目主页链接或明确项目名，且核心决策是「用不用它」时触发。改写沿一条决策链走：确认项目身份与官方来源 → 事实只取一手材料并写核查日期 → 把用户环境当硬约束逐项对照（OS / 运行时 / 已有依赖与插件 / 权限与沙箱 / 网络）→ 给最小验证命令与失败回滚 → 三选一结论（现在能用 / 改造后用 / 不用 + 替代）并写前提与可证伪条件。拿不到的事实标「未核实」，不许凭记忆报版本号与兼容性。
- **场景识别 + 手动钉住**：自动判断 论文 / 项目评估 / 给 agent 派活 / 日常提问 / 英文写作；徽标显示识别结果，点开可手动改。
- **三自检诊断面板**：验收能否机器判定、缺的是信息还是能力、在抬深度还是扩范围；每条给出结论和依据。
- **当前模型**：使用输入框里选中的 provider / model / reasoningEffort，一次独立调用，不带聊天历史。
- **结构化输出协议**：`SCENARIO:` / `DIAGNOSIS:` / `PROMPT:` 行标记，解析失败时回退纯文本，不把 JSON 写进输入框。
- **自定义场景**：chips 末尾 `＋` 可新建；内置场景可重命名、追加说明、临时隐藏，存在本地 `localStorage`。

## 安装

在 DSH 里：设置 → 插件 → 添加插件，填 `dsh-prompt-optimizer-button`。

或命令行：

```bash
dsh plugin --profile desktop add dsh-prompt-optimizer-button
```

## 限制

- 宿主侧需要 `ctx.llm` 与 `webServer` 服务（桌面版与 Web 版均自带）。
- 一次调用：输入 ≤ 20k 字符，输出 ≤ 4000 tokens，超时 90s。
- 按钮依赖 composer DOM（`[data-composer-card]` / `.standardControls`），非公开 API；DSH 大改版可能需要适配。
- 只改写、不提交；润色后仍需你按 Enter 发送。
- 评估场景对「未联网 / 读不到仓库」的处理是标「未核实」并写成能力缺口，不会替你猜版本或兼容性。

## 兼容

- DSH 0.2.2-rc.1 及以上（`engines.dsh: >=0.2.2-rc.1 <0.3.0-0`）。
- 第三方 bundle，不依赖任何 `@deepseek-ai/*` 的 import（宿主侧只走 `ctx.llm` / `ctx.webServer` 服务）。
