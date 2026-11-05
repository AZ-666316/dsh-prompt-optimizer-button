# PR: Add OWNER/dsh-prompt-optimizer-button

## What it is

A DSH client plugin that puts a small sparkle button and a scenario badge inside the
composer, between the model selector and the send button. Clicking the sparkle rewrites
the current draft **in place** with the model already selected in the composer 鈥?no extra
chat turn, no assistant message, draft stays editable before sending.

It classifies the draft into one of four scenarios (paper / agent task / daily question /
English writing), runs a three-check diagnosis, and shows the result in a compact panel:

1. 楠屾敹鍙垽瀹?鈥?can completion be machine-checked?
2. 淇℃伅杩樻槸鑳藉姏 鈥?is the model missing information, capability, or task definition?
3. 灞傜骇杩樻槸鑼冨洿 鈥?did the rewrite raise depth or widen scope?

The scenario can be pinned manually from the panel, and the panel re-runs the rewrite.

## Why it is different

Prompt-optimizer web apps and browser extensions optimize text in a separate UI or on
arbitrary web pages. This one runs inside an agent harness composer, so it (a) uses the
session's current model and reasoning effort, (b) writes back into the same draft instead
of creating a new chat turn, and (c) returns structured scenario + diagnosis rather than
just rewritten text.

## Structure

```
package.json          # declares dsh.bundle.patch and dsh.client
cordis.patch.yml      # inserts this bundle into the DSH profile
index.js              # host half: POST /prompt-optimizer/rewrite (ctx.llm, no @deepseek-ai/* imports)
client.js             # UI half: composer badge + button, diagnosis panel, model route lookup
publish/              # store submission drafts (this entry + checklist)
assets/icon-*.png
```

## Compatibility / testing

- Tested against DSH desktop profile `0.2.2-rc.1` (`engines.dsh: ">=0.2.2-rc.1 <0.3.0-0"`).
- Uses only public runtime services (`ctx.llm`, `ctx.webServer`, `ctx.slots`, `ctx.locale`,
  `ctx.modelDirectories`); no `@deepseek-ai/*` imports.
- Host half verified with a fake-context harness (route registration, 200/400/405, JSON limits)
  and live against `deepseek-account / deepseek-flash`; UI half verified by loading the bundle
  and the slot registration smoke test.
- No telemetry, no network calls other than the same-origin rewrite route.
- MIT.

## Screenshot

(attach: composer with sparkle button + scenario badge, and the diagnosis panel open)

