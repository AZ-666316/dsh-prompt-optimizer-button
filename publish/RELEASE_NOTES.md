# v0.4.0 — 场景徽标 + 三自检诊断面板

Prompt optimizer for the DSH composer. 点输入框里的小星星，用当前选中的模型就地润色草稿，不新增对话轮次。

## 功能

- **就地润色**：替换当前草稿，不产生新的 user message，不浪费一轮对话。
- **场景识别 + 手动钉住**：自动判断 论文 / 给 agent 派活 / 日常提问 / 英文写作；徽标显示识别结果，点开可手动改。
- **三自检诊断面板**：验收能否机器判定、缺的是信息还是能力、在抬深度还是扩范围；每条给出结论和依据。
- **当前模型**：使用输入框里选中的 provider / model / reasoningEffort，一次独立调用，不带聊天历史。
- **结构化输出协议**：`SCENARIO:` / `DIAGNOSIS:` / `PROMPT:` 行标记，解析失败时回退纯文本，不把 JSON 写进输入框。

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

## 兼容

- DSH 0.2.2-rc.1 及以上（`engines.dsh: >=0.2.2-rc.1 <0.3.0-0`）。
- 第三方 bundle，不依赖任何 `@deepseek-ai/*` 的 import（宿主侧只走 `ctx.llm` / `ctx.webServer` 服务）。
