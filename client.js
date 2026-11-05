/* eslint-disable */
/**
 * dsh-prompt-optimizer-button — browser half (v0.4).
 *
 * Adds one sparkle button plus a scenario badge between the model selector and
 * the send button of the composer. Clicking the icon sends the current draft to
 * the host half (`POST /prompt-optimizer/rewrite`), which runs ONE model call
 * and answers `{ ok, text, scenario, diagnosis }`:
 *
 * - `text`       → written back into the draft (the rewritten prompt);
 * - `scenario`   → which rule set the model judged (paper / agent / daily / english);
 * - `diagnosis`  → task type, the decision the prompt supports, and the three
 *                  self-checks, shown in a small popover instead of the draft.
 *
 * The badge next to the icon shows the detected scenario and opens the popover;
 * inside it the scenario can be pinned manually (auto / paper / agent / daily /
 * english) before the next rewrite.
 *
 * Why a portal: the composer exposes `conversation.input.right` (before the model
 * selector) and `conversation.input.activity` (single-occupant microphone).
 * Neither sits between the model selector and the send button, so we register a
 * cell in `conversation.input.right` and portal the controls into the composer's
 * trailing row, right after `.standardControls` and before activity/stop/send.
 */
window.__ModuleLoader__.load({
  id: 'dsh-prompt-optimizer-button',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    const NS = 'dsh-prompt-optimizer-button';
    const REWRITE_ROUTE = 'prompt-optimizer/rewrite';
    const SCENARIOS = ['auto', 'paper', 'agent', 'daily', 'english'];
    const PANEL_WIDTH = 324;
    const PANEL_MARGIN = 12;

    // ── dictionaries ───────────────────────────────────────────────────────
    const zh = {
      'button.label': '优化提示词',
      'button.empty': '先写点内容，再点这里优化',
      'button.busy': '正在优化…',
      'button.failed': '优化失败，点这里重试',
      'badge.auto': '自动',
      'panel.title': '提示词优化',
      'panel.close': '关闭',
      'panel.scenario': '场景',
      'panel.hint': '点图标改写草稿，结果直接写回输入框，不会自动发送。',
      'panel.diagnosis': '诊断',
      'panel.taskType': '任务类型',
      'panel.decision': '支撑决策',
      'panel.checks': '三自检',
      'panel.noDiagnosis': '这次没有返回结构化诊断（模型未按 JSON 返回）。',
      'panel.error': '失败原因',
      'panel.retry': '重新润色',
      'panel.empty': '输入框是空的，先写一句需求。',
      'scenario.auto': '自动',
      'scenario.paper': '论文',
      'scenario.agent': '派活',
      'scenario.daily': '日常',
      'scenario.english': '英文',
      'tip.scenarioPrefix': '场景：',
      'tip.badgeHint': '点击查看诊断',
    };
    const en = {
      'button.label': 'Optimize prompt',
      'button.empty': 'Write something first, then optimize',
      'button.busy': 'Optimizing…',
      'button.failed': 'Optimization failed — click to retry',
      'badge.auto': 'Auto',
      'panel.title': 'Prompt optimizer',
      'panel.close': 'Close',
      'panel.scenario': 'Scenario',
      'panel.hint': 'Click the icon to rewrite the draft; the result replaces it and is never sent.',
      'panel.diagnosis': 'Diagnosis',
      'panel.taskType': 'Task',
      'panel.decision': 'Decision',
      'panel.checks': 'Self-checks',
      'panel.noDiagnosis': 'No structured diagnosis came back (the model did not answer with JSON).',
      'panel.error': 'Reason',
      'panel.retry': 'Rewrite again',
      'panel.empty': 'The composer is empty — write a requirement first.',
      'scenario.auto': 'Auto',
      'scenario.paper': 'Paper',
      'scenario.agent': 'Agent task',
      'scenario.daily': 'Daily',
      'scenario.english': 'English',
      'tip.scenarioPrefix': 'Scenario: ',
      'tip.badgeHint': 'click for diagnosis',
    };

    function fallbackT(key) {
      return zh[key] ?? key;
    }

    // ── styles ─────────────────────────────────────────────────────────────
    const CSS = `
      .dsh-prompt-opt-anchor {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        flex: none;
      }
      .dsh-prompt-opt-btn {
        display: inline-grid;
        place-items: center;
        width: 28px;
        height: 28px;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        opacity: 0.72;
        cursor: pointer;
        flex: none;
        transition: opacity 0.15s ease, background-color 0.15s ease, color 0.15s ease;
      }
      .dsh-prompt-opt-btn:hover:not([aria-disabled="true"]) {
        opacity: 1;
        background: rgba(128, 128, 128, 0.16);
      }
      .dsh-prompt-opt-btn:active:not([aria-disabled="true"]) {
        background: rgba(128, 128, 128, 0.26);
      }
      .dsh-prompt-opt-btn[aria-disabled="true"] {
        opacity: 0.32;
        cursor: default;
      }
      .dsh-prompt-opt-btn[aria-disabled="true"]:hover {
        background: transparent;
      }
      .dsh-prompt-opt-btn[data-busy="true"] {
        opacity: 1;
        cursor: progress;
      }
      .dsh-prompt-opt-btn[data-busy="true"] svg {
        animation: dsh-prompt-opt-pulse 1s ease-in-out infinite;
      }
      .dsh-prompt-opt-btn[data-failed="true"] {
        color: #e5484d;
        opacity: 1;
      }
      .dsh-prompt-opt-btn:focus-visible,
      .dsh-prompt-opt-badge:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 1px;
      }
      .dsh-prompt-opt-badge {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        max-width: 72px;
        padding: 2px 6px;
        border: 1px solid rgba(128, 128, 128, 0.28);
        border-radius: 999px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 11px;
        line-height: 15px;
        letter-spacing: 0.01em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        opacity: 0.72;
        cursor: pointer;
        transition: opacity 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
      }
      .dsh-prompt-opt-badge:hover {
        opacity: 1;
        background: rgba(128, 128, 128, 0.12);
        border-color: rgba(128, 128, 128, 0.42);
      }
      .dsh-prompt-opt-badge[data-open="true"] {
        opacity: 1;
        border-color: rgba(107, 124, 255, 0.7);
        background: rgba(107, 124, 255, 0.14);
      }
      .dsh-prompt-opt-badge-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        flex: none;
        background: currentColor;
        opacity: 0.7;
      }
      .dsh-prompt-opt-badge[data-pinned="true"] .dsh-prompt-opt-badge-dot {
        background: #6b7cff;
        opacity: 1;
      }
      .dsh-prompt-opt-panel {
        position: fixed;
        z-index: 2147482900;
        box-sizing: border-box;
        width: 324px;
        max-width: calc(100vw - 24px);
        padding: 12px 12px 11px;
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 14px;
        background: rgba(24, 24, 27, 0.96);
        background: color-mix(in srgb, #18181b 96%, transparent);
        -webkit-backdrop-filter: blur(18px) saturate(160%);
        backdrop-filter: blur(18px) saturate(160%);
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.38), 0 2px 8px rgba(0, 0, 0, 0.22);
        color: #f4f4f5;
        font-family: inherit;
        font-size: 12px;
        line-height: 1.5;
        text-align: left;
        animation: dsh-prompt-opt-pop 0.14s ease-out;
      }
      .dsh-prompt-opt-panel-head {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
      }
      .dsh-prompt-opt-panel-title {
        font-size: 12.5px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .dsh-prompt-opt-panel-sub {
        margin-left: auto;
        font-size: 10.5px;
        color: rgba(244, 244, 245, 0.5);
        white-space: nowrap;
      }
      .dsh-prompt-opt-close {
        display: inline-grid;
        place-items: center;
        width: 20px;
        height: 20px;
        margin-left: 2px;
        padding: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: rgba(244, 244, 245, 0.6);
        font: inherit;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
      }
      .dsh-prompt-opt-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }
      .dsh-prompt-opt-hint {
        margin: 0 0 10px;
        color: rgba(244, 244, 245, 0.62);
        font-size: 11.5px;
      }
      .dsh-prompt-opt-section-label {
        margin: 10px 0 5px;
        color: rgba(244, 244, 245, 0.5);
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .dsh-prompt-opt-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .dsh-prompt-opt-chip {
        padding: 3px 9px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 999px;
        background: transparent;
        color: rgba(244, 244, 245, 0.82);
        font: inherit;
        font-size: 11.5px;
        line-height: 17px;
        cursor: pointer;
        transition: background-color 0.13s ease, border-color 0.13s ease, color 0.13s ease;
      }
      .dsh-prompt-opt-chip:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.3);
      }
      .dsh-prompt-opt-chip[data-active="true"] {
        background: rgba(107, 124, 255, 0.26);
        border-color: rgba(124, 140, 255, 0.85);
        color: #e6e9ff;
      }
      .dsh-prompt-opt-check {
        display: grid;
        grid-template-columns: 15px 1fr;
        gap: 7px;
        padding: 4px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.07);
      }
      .dsh-prompt-opt-check:first-of-type {
        border-top: 0;
      }
      .dsh-prompt-opt-check-icon {
        display: inline-grid;
        place-items: center;
        width: 15px;
        height: 15px;
        margin-top: 2px;
        border-radius: 50%;
        font-size: 9.5px;
        font-weight: 700;
        line-height: 1;
      }
      .dsh-prompt-opt-check[data-passed="true"] .dsh-prompt-opt-check-icon {
        background: rgba(52, 199, 123, 0.2);
        color: #55d193;
      }
      .dsh-prompt-opt-check[data-passed="false"] .dsh-prompt-opt-check-icon {
        background: rgba(245, 166, 35, 0.2);
        color: #f2b25c;
      }
      .dsh-prompt-opt-check-name {
        font-size: 11.5px;
        font-weight: 600;
        color: rgba(244, 244, 245, 0.92);
      }
      .dsh-prompt-opt-check-note {
        margin-top: 1px;
        color: rgba(244, 244, 245, 0.58);
        font-size: 11px;
        word-break: break-word;
      }
      .dsh-prompt-opt-kv {
        display: flex;
        gap: 8px;
        margin: 2px 0;
        font-size: 11.5px;
      }
      .dsh-prompt-opt-kv-label {
        flex: none;
        color: rgba(244, 244, 245, 0.5);
      }
      .dsh-prompt-opt-kv-value {
        flex: 1 1 auto;
        min-width: 0;
        color: rgba(244, 244, 245, 0.88);
        word-break: break-word;
      }
      .dsh-prompt-opt-error {
        margin-top: 9px;
        padding: 7px 9px;
        border-radius: 8px;
        background: rgba(229, 72, 77, 0.14);
        color: #ffb3b6;
        font-size: 11.5px;
        word-break: break-word;
      }
      .dsh-prompt-opt-empty-note {
        margin-top: 6px;
        color: rgba(244, 244, 245, 0.5);
        font-size: 11px;
      }
      .dsh-prompt-opt-foot {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 11px;
      }
      .dsh-prompt-opt-run {
        padding: 5px 11px;
        border: 0;
        border-radius: 8px;
        background: #5b6cff;
        color: #fff;
        font: inherit;
        font-size: 11.5px;
        font-weight: 500;
        line-height: 17px;
        cursor: pointer;
        transition: background-color 0.13s ease, opacity 0.13s ease;
      }
      .dsh-prompt-opt-run:hover:not([aria-disabled="true"]) {
        background: #6c7cff;
      }
      .dsh-prompt-opt-run[aria-disabled="true"] {
        opacity: 0.45;
        cursor: default;
      }
      .dsh-prompt-opt-tip {
        position: fixed;
        z-index: 2147483100;
        max-width: 280px;
        padding: 5px 9px;
        border: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
        border-radius: 8px;
        background: color-mix(in srgb, Canvas 94%, transparent);
        -webkit-backdrop-filter: blur(12px);
        backdrop-filter: blur(12px);
        color: CanvasText;
        font-family: inherit;
        font-size: 11.5px;
        line-height: 1.45;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
        animation: dsh-prompt-opt-tip-in 0.12s ease-out;
      }
      @keyframes dsh-prompt-opt-tip-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes dsh-prompt-opt-pulse {
        0%, 100% { opacity: 0.35; }
        50% { opacity: 1; }
      }
      @keyframes dsh-prompt-opt-pop {
        from { opacity: 0; transform: translateY(3px) scale(0.99); }
        to { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        .dsh-prompt-opt-btn[data-busy="true"] svg { animation: none; }
        .dsh-prompt-opt-panel { animation: none; }
      }
    `;

    function ensureStyles() {
      if (typeof document === 'undefined') return;
      if (document.querySelector(`style[data-plugin="${NS}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = NS;
      style.textContent = CSS;
      (document.head ?? document.documentElement).append(style);
    }

    // ── icons ──────────────────────────────────────────────────────────────
    function SparkleIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', {
          d: 'M8 1.5l1.32 3.68L13 6.5 9.32 7.82 8 11.5 6.68 7.82 3 6.5l3.68-1.32L8 1.5Z',
          fill: 'currentColor',
        }),
        h('path', {
          d: 'M12.6 10.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3Z',
          fill: 'currentColor',
          opacity: 0.65,
        }),
      );
    }

    function CheckMark(props) {
      return h(
        'span',
        { className: 'dsh-prompt-opt-check-icon', 'aria-hidden': 'true' },
        props.passed === true ? '✓' : '!',
      );
    }

    // ── helpers ────────────────────────────────────────────────────────────
    function findComposerCard(marker) {
      if (marker !== null && marker.isConnected === true) {
        const own = marker.closest('[data-composer-card]');
        if (own !== null) return own;
      }
      return document.querySelector('[data-composer-card]');
    }

    /**
     * Read the session's current model route from the composer's model service.
     * `modelDirectories` is declared in this plugin's `inject` list, which is
     * what the client guard requires before the service can be read.
     * @param {object} ctx client plugin context
     * @param {string | undefined} sessionId
     * @returns {{ provider: string, model: string, reasoningEffort?: string } | undefined}
     */
    function readModelRoute(ctx, sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return undefined;
      try {
        const models = ctx.modelDirectories ?? (typeof ctx.get === 'function' ? ctx.get('modelDirectories') : undefined);
        if (models === undefined || models === null || typeof models.directoryFor !== 'function') return undefined;
        const directory = models.directoryFor(sessionId);
        const snapshot = directory?.store?.getSnapshot?.();
        const current = snapshot?.current;
        if (current === undefined || current === null) return undefined;
        if (typeof current.provider !== 'string' || typeof current.model !== 'string') return undefined;
        return {
          provider: current.provider,
          model: current.model,
          ...(typeof current.reasoningEffort === 'string' && current.reasoningEffort !== ''
            ? { reasoningEffort: current.reasoningEffort }
            : {}),
        };
      } catch {
        return undefined;
      }
    }

    /** Fixed-position coordinates for the popover, anchored above/below a rect. */
    function computePanelPlacement(rect, viewportWidth, viewportHeight) {
      const width = Math.min(PANEL_WIDTH, Math.max(240, viewportWidth - PANEL_MARGIN * 2));
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - width / 2, PANEL_MARGIN),
        Math.max(PANEL_MARGIN, viewportWidth - width - PANEL_MARGIN),
      );
      const above = rect.top >= 280;
      return above
        ? { left: Math.round(left), bottom: Math.round(viewportHeight - rect.top + 10), width }
        : { left: Math.round(left), top: Math.round(rect.bottom + 10), width };
    }

    // ── component ──────────────────────────────────────────────────────────
    function OptimizeButton(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT;
      const useInput = props.useInput;
      const inputActions = props.inputActions;
      const readRoute = props.readRoute;

      const draft =
        typeof useInput === 'function'
          ? useInput((state) => (state !== null && typeof state.draft === 'string' ? state.draft : ''))
          : '';

      const markerRef = React.useRef(null);
      const buttonRef = React.useRef(null);
      const badgeRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const busyRef = React.useRef(false);
      const tipTimerRef = React.useRef(null);

      const [host, setHost] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [open, setOpen] = React.useState(false);
      const [override, setOverride] = React.useState('auto');
      const [result, setResult] = React.useState(null);
      const [placement, setPlacement] = React.useState(null);
      const [tip, setTip] = React.useState(null);

      // ── placement: keep the fixed popover glued to the button ────────────
      const updatePlacement = React.useCallback(() => {
        const button = buttonRef.current;
        if (button === null || typeof window === 'undefined') return;
        const rect = button.getBoundingClientRect();
        setPlacement(computePanelPlacement(rect, window.innerWidth, window.innerHeight));
      }, []);

      React.useLayoutEffect(() => {
        if (!open) return undefined;
        updatePlacement();
        const onChange = () => updatePlacement();
        window.addEventListener('resize', onChange);
        window.addEventListener('scroll', onChange, true);
        return () => {
          window.removeEventListener('resize', onChange);
          window.removeEventListener('scroll', onChange, true);
        };
      }, [open, updatePlacement]);

      // ── close on outside click / Escape ──────────────────────────────────
      React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          const target = event.target;
          if (target instanceof Node === false) return;
          if (panelRef.current !== null && panelRef.current.contains(target)) return;
          if (badgeRef.current !== null && badgeRef.current.contains(target)) return;
          if (buttonRef.current !== null && buttonRef.current.contains(target)) return;
          setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown, true);
        };
      }, [open]);

      // ── attach the control cluster into the composer ─────────────────────
      React.useLayoutEffect(() => {
        let disposed = false;
        let wrap = null;
        let wrapObserver = null;
        let layoutWatcher = null;

        const detach = () => {
          if (wrapObserver !== null) {
            wrapObserver.disconnect();
            wrapObserver = null;
          }
          if (wrap !== null && wrap.isConnected === true) wrap.remove();
          wrap = null;
        };

        const attach = () => {
          if (disposed) return true;
          const card = findComposerCard(markerRef.current);
          if (card === null) return false;
          const controls = card.querySelector('[class*="standardControls"]');
          const buttons = card.querySelectorAll('button');
          const send = buttons.length > 0 ? buttons[buttons.length - 1] : null;

          let anchor = null;
          if (controls !== null && controls.parentElement !== null) anchor = controls;
          else if (send !== null && send.parentElement !== null) anchor = send;
          if (anchor === null) return false;

          detach();

          wrap = document.createElement('span');
          wrap.className = 'dsh-prompt-opt-anchor';
          anchor.parentElement.insertBefore(wrap, anchor === controls ? anchor.nextSibling : anchor);

          const syncHidden = () => {
            if (wrap === null) return;
            const hidden = controls !== null && controls.hasAttribute('hidden');
            wrap.style.display = hidden ? 'none' : 'inline-flex';
          };
          syncHidden();
          if (controls !== null) {
            wrapObserver = new MutationObserver(syncHidden);
            wrapObserver.observe(controls, { attributes: true, attributeFilter: ['hidden'] });
          }
          setHost(wrap);
          return true;
        };

        if (!attach()) {
          layoutWatcher = new MutationObserver(() => {
            if (attach() && layoutWatcher !== null) {
              layoutWatcher.disconnect();
              layoutWatcher = null;
            }
          });
          layoutWatcher.observe(document.body, { childList: true, subtree: true });
        }

        const keepAlive = new MutationObserver(() => {
          if (disposed) return;
          if (wrap !== null && wrap.isConnected === true) return;
          if (attach() && layoutWatcher !== null) {
            layoutWatcher.disconnect();
            layoutWatcher = null;
          }
        });
        keepAlive.observe(document.body, { childList: true, subtree: true });

        return () => {
          disposed = true;
          keepAlive.disconnect();
          if (layoutWatcher !== null) layoutWatcher.disconnect();
          detach();
        };
      }, []);

      const text = typeof draft === 'string' ? draft : '';
      const empty = text.trim() === '';
      const canWrite = inputActions !== null && inputActions !== undefined && typeof inputActions.setDraft === 'function';

      // Styled hover hint (the native `title` tooltip is what looked ugly).
      const clearTipTimer = React.useCallback(() => {
        if (tipTimerRef.current !== null) {
          clearTimeout(tipTimerRef.current);
          tipTimerRef.current = null;
        }
      }, []);
      const hideTip = React.useCallback(() => {
        clearTipTimer();
        setTip(null);
      }, [clearTipTimer]);
      const showTip = React.useCallback(
        (kind, element) => {
          clearTipTimer();
          if (element === null || element === undefined) return;
          const rect = element.getBoundingClientRect();
          tipTimerRef.current = setTimeout(() => {
            tipTimerRef.current = null;
            setTip({ kind, left: rect.left + rect.width / 2, top: rect.top - 8 });
          }, 260);
        },
        [clearTipTimer],
      );
      React.useEffect(() => () => clearTipTimer(), [clearTipTimer]);
      React.useEffect(() => {
        if (open) hideTip();
      }, [open, hideTip]);

      const run = React.useCallback(async () => {
        if (busyRef.current || empty || !canWrite) return;
        busyRef.current = true;
        setBusy(true);
        setError('');
        try {
          const route = typeof readRoute === 'function' ? readRoute() : undefined;
          const payload = {
            text,
            provider: route?.provider,
            model: route?.model,
            reasoningEffort: route?.reasoningEffort,
          };
          if (override !== 'auto') payload.scenario = override;
          const response = await fetch(REWRITE_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          let data = null;
          try {
            data = await response.json();
          } catch {
            data = null;
          }
          if (data === null || data.ok !== true || typeof data.text !== 'string' || data.text.trim() === '') {
            const reason = data !== null && typeof data.error === 'string' ? data.error : `HTTP ${response.status}`;
            throw new Error(reason);
          }
          inputActions.setDraft(data.text.trim());
          setResult(data);
          setOpen(true);
        } catch (failure) {
          const message = String(failure?.message ?? failure);
          setError(message);
          setOpen(true);
          // eslint-disable-next-line no-console
          console.warn('[prompt-optimizer-button]', message);
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
      }, [canWrite, empty, override, readRoute, text]);

      if (host === null) {
        // Marker only: it is the DOM anchor used to find the composer.
        return h('span', { ref: markerRef, hidden: true });
      }

      const detected = result !== null && typeof result.scenario === 'string' ? result.scenario : null;
      const activeScenario = override !== 'auto' ? override : detected;
      const badgeLabel = t(`scenario.${activeScenario ?? 'auto'}`);
      const label = busy
        ? t('button.busy')
        : error !== ''
          ? t('button.failed')
          : empty
            ? t('button.empty')
            : t('button.label');

      const button = h(
        'button',
        {
          type: 'button',
          className: 'dsh-prompt-opt-btn',
          ref: buttonRef,
          'aria-label': label,
          'aria-busy': busy || undefined,
          'aria-disabled': empty || !canWrite || busy ? 'true' : undefined,
          'data-disabled': empty || !canWrite ? 'true' : undefined,
          'data-busy': busy ? 'true' : undefined,
          'data-failed': error !== '' ? 'true' : undefined,
          onMouseDown: (event) => event.preventDefault(),
          onMouseEnter: (event) => showTip('button', event.currentTarget),
          onMouseLeave: hideTip,
          onFocus: (event) => showTip('button', event.currentTarget),
          onBlur: hideTip,
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            void run();
          },
        },
        h(SparkleIcon),
      );

      const badge = h(
        'button',
        {
          type: 'button',
          className: 'dsh-prompt-opt-badge',
          ref: badgeRef,
          'aria-label': `${t('panel.scenario')}: ${badgeLabel}`,
          'aria-expanded': open ? 'true' : 'false',
          'data-open': open ? 'true' : undefined,
          'data-pinned': override !== 'auto' ? 'true' : undefined,
          onMouseDown: (event) => event.preventDefault(),
          onMouseEnter: (event) => showTip('badge', event.currentTarget),
          onMouseLeave: hideTip,
          onFocus: (event) => showTip('badge', event.currentTarget),
          onBlur: hideTip,
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            hideTip();
            setOpen((value) => !value);
          },
        },
        h('span', { className: 'dsh-prompt-opt-badge-dot' }),
        h('span', null, badgeLabel),
      );

      let panel = null;
      if (open && typeof document !== 'undefined') {
        const diagnosis = result !== null && result.diagnosis !== null && typeof result.diagnosis === 'object'
          ? result.diagnosis
          : null;
        const checks = diagnosis !== null && Array.isArray(diagnosis.checks) ? diagnosis.checks : [];

        const chips = SCENARIOS.map((scenario) =>
          h(
            'button',
            {
              type: 'button',
              key: scenario,
              className: 'dsh-prompt-opt-chip',
              'data-active': (scenario === 'auto' ? override === 'auto' : override === scenario) ? 'true' : undefined,
              onClick: (event) => {
                event.preventDefault();
                setOverride(scenario);
              },
            },
            t(`scenario.${scenario}`),
          ),
        );

        const panelBody = h(
          'div',
          { className: 'dsh-prompt-opt-panel', ref: panelRef, role: 'dialog', 'aria-label': t('panel.title'), style: placement ?? {} },
          h(
            'div',
            { className: 'dsh-prompt-opt-panel-head' },
            h('span', { className: 'dsh-prompt-opt-panel-title' }, t('panel.title')),
            detected !== null ? h('span', { className: 'dsh-prompt-opt-panel-sub' }, t(`scenario.${detected}`)) : null,
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-prompt-opt-close',
                'aria-label': t('panel.close'),
                onClick: (event) => {
                  event.preventDefault();
                  setOpen(false);
                },
              },
              '×',
            ),
          ),
          h('div', { className: 'dsh-prompt-opt-hint' }, t('panel.hint')),
          h('div', { className: 'dsh-prompt-opt-section-label' }, t('panel.scenario')),
          h('div', { className: 'dsh-prompt-opt-chips' }, chips),
          diagnosis !== null && checks.length > 0
            ? h(
                React.Fragment,
                null,
                h('div', { className: 'dsh-prompt-opt-section-label' }, t('panel.diagnosis')),
                diagnosis.taskType
                  ? h(
                      'div',
                      { className: 'dsh-prompt-opt-kv' },
                      h('span', { className: 'dsh-prompt-opt-kv-label' }, t('panel.taskType')),
                      h('span', { className: 'dsh-prompt-opt-kv-value' }, diagnosis.taskType),
                    )
                  : null,
                diagnosis.decision
                  ? h(
                      'div',
                      { className: 'dsh-prompt-opt-kv' },
                      h('span', { className: 'dsh-prompt-opt-kv-label' }, t('panel.decision')),
                      h('span', { className: 'dsh-prompt-opt-kv-value' }, diagnosis.decision),
                    )
                  : null,
                checks.map((check, index) =>
                  h(
                    'div',
                    {
                      key: `${index}-${check.name}`,
                      className: 'dsh-prompt-opt-check',
                      'data-passed': check.passed === true ? 'true' : 'false',
                    },
                    h(CheckMark, { passed: check.passed }),
                    h(
                      'div',
                      null,
                      h('div', { className: 'dsh-prompt-opt-check-name' }, check.name || t('panel.checks')),
                      check.note ? h('div', { className: 'dsh-prompt-opt-check-note' }, check.note) : null,
                    ),
                  ),
                ),
              )
            : null,
          result !== null && diagnosis === null && error === ''
            ? h('div', { className: 'dsh-prompt-opt-empty-note' }, t('panel.noDiagnosis'))
            : null,
          error !== ''
            ? h(
                React.Fragment,
                null,
                h('div', { className: 'dsh-prompt-opt-section-label' }, t('panel.error')),
                h('div', { className: 'dsh-prompt-opt-error' }, error),
              )
            : null,
          h(
            'div',
            { className: 'dsh-prompt-opt-foot' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-prompt-opt-run',
                'aria-disabled': empty || busy || !canWrite ? 'true' : undefined,
                onClick: (event) => {
                  event.preventDefault();
                  void run();
                },
              },
              busy ? t('button.busy') : t('panel.retry'),
            ),
            empty ? h('span', { className: 'dsh-prompt-opt-empty-note' }, t('panel.empty')) : null,
          ),
        );

        panel = ReactDOM.createPortal(panelBody, document.body);
      }

      let tooltip = null;
      if (tip !== null && typeof document !== 'undefined' && typeof window !== 'undefined') {
        const tipText = tip.kind === 'badge' ? `${t('tip.scenarioPrefix')}${badgeLabel} · ${t('tip.badgeHint')}` : label;
        const left = Math.min(Math.max(tip.left, 140), Math.max(140, window.innerWidth - 140));
        tooltip = ReactDOM.createPortal(
          h(
            'div',
            {
              className: 'dsh-prompt-opt-tip',
              role: 'tooltip',
              style: { left, top: tip.top, transform: 'translate(-50%, -100%)' },
            },
            tipText,
          ),
          document.body,
        );
      }

      return h(
        React.Fragment,
        null,
        h('span', { ref: markerRef, hidden: true }),
        ReactDOM.createPortal(h(React.Fragment, null, badge, button), host),
        panel,
        tooltip,
      );
    }

    return {
      __test: { computePanelPlacement, readModelRoute, zh, en },
      inject: ['slots', 'locale', 'modelDirectories'],
      apply(ctx) {
        ensureStyles();
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'prompt-optimizer-button: dictionaries');
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.right',
              id: 'prompt-optimizer-button',
              order: 100,
              locale: NS,
              inject: (sessionId) => ({ sessionId }),
            },
            (props) => h(OptimizeButton, { ...props, readRoute: () => readModelRoute(ctx, props.sessionId) }),
          ),
        );
      },
    };
  },
});
