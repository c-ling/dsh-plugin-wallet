/**
 * dsh-plugin-wallet client half: hand-written factory-CJS browser bundle.
 *
 * Three slot contributions:
 *   - sidebar.footer.action: wallet button above the settings row (matching the
 *     settings trigger geometry; collapsed rail gets a frosted hover popup)
 *     with a low-balance status dot.
 *   - shell.overlay: centered wallet modal with mask (balance card + cost
 *     estimate + all-session cost ranking) toggled by the button.
 *   - conversation.composer.dock: shadows the built-in stats line and prepends
 *     the session amount to it, fed by the host `walletSessionCost` projection.
 *
 * The API key secret never reaches this bundle; balance facts come from the
 * host route `/dsh-plugin-wallet/balance` (amounts and status codes).
 * All-session costs come from `/dsh-plugin-wallet/session-costs`.
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-wallet",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    // Shipped icon/tooltip primitives shared with the built-in settings UI.
    // The loader registry always provides them in the real web runtime; keep the
    // bundle loadable offline/under test when the registry is stubbed out.
    var uiPrimitives = null;
    try {
      uiPrimitives = require("@deepseek-ai/dsh-client-ui-primitives");
    } catch (error) {
      uiPrimitives = null;
    }

    var NS = "dsh-plugin-wallet";
    var PROJECTION_KEY = "walletSessionCost";
    var DEFAULT_POLL_MS = 5 * 60 * 1000;

    // ── dictionaries (zh is the source-of-truth key set) ───────────────────

    var DICT = {
      zh: {
        nav: "钱包",
        navTooltip: "钱包：余额与用量",
        open: "打开钱包",
        close: "关闭",
        refresh: "刷新",
        refreshing: "刷新中…",
        balanceTitle: "DeepSeek 余额",
        recharge: "充值",
        balanceTotal: "总余额",
        balanceAvailable: "可用",
        balanceUnavailable: "不可用",
        balanceUpdatedAt: "更新于 {time}",
        balanceStale: "显示上次成功值",
        balanceUnsupportedBaseUrl: "当前 baseURL 不是 DeepSeek 官方地址，无法查询余额",
        balanceMissingKey: "未配置 DeepSeek API Key",
        balanceRouteUnavailable: "未找到可用的 deepseek-official 路由",
        balanceErrorUnauthorized: "API Key 无效",
        balanceErrorRateLimited: "余额接口限流，稍后自动重试",
        balanceErrorTimeout: "余额接口超时",
        balanceErrorNetwork: "网络错误",
        balanceErrorUpstream: "余额接口返回错误",
        balanceErrorBadResponse: "余额接口返回格式异常",
        balanceErrorGeneric: "余额查询失败",
        lowBalance: "余额低于 ¥{amount}",
        lowBalanceBadge: "余额不足",
        costTitle: "成本估算",
        costTotal: "总估算 {amount}",
        costCacheSaved: "缓存节省",
        costInputTotal: "输入 token 总数",
        costOutputTotal: "输出 token 总数",
        costCacheHitAverage: "平均缓存命中率",
        costAverageTokens: "平均",
        costMinValue: "最低",
        costMaxValue: "最高",
        costLine: "≈ {amount} · 缓存命中 {percent}% · 本会话估算",
        costAmountInline: "金额 ≈ {amount}",
        "stats.counts": "{turns} 轮 · {steps} 步",
        "stats.llm": "LLM {duration}",
        "stats.toolCall": "工具调用 {duration}",
        "stats.ttftAverage": "首 token 平均 {duration}",
        "stats.tokensPerSecond": "{throughput} tok/s",
        "stats.cacheHit": "缓存命中 {percent}%",
        "stats.tokens": "输入 {input} tok · 输出 {output} tok",
        costTooltipTotal: "本会话估算：{amount}",
        costTooltipPeriod: "{label}：{amount}",
        costTooltipModel: "{model}：{amount}",
        costTooltipUnknown: "含无价格模型 {tokens} tok，未计入金额",
        costTooltipUnsupported: "含非 DeepSeek 用量 {tokens} tok，未计入金额",
        costPeriodLegacy: "旧价",
        costPeriodOffpeak: "空闲",
        costPeriodPeak: "高峰",
        costUnknownLine: "≈ {amount} · 含无价格模型 · 本会话估算",
        costSessions: "会话成本排行",
        costSession: "会话",
        costModel: "模型",
        costInput: "输入",
        costOutput: "输出",
        costCacheHit: "缓存命中",
        costAmount: "金额",
        costEmpty: "暂无会话成本数据",
        costComputing: "成本计算中…",
        costDisclaimer: "按会话日志与内置价格表估算，非官方账单；fork 与 subagent 各自独立统计。",
        costUnknownBadge: "含无价格模型",
        costUnsupportedBadge: "含非 DeepSeek 用量",
        timeHm: "{h}:{m}",
        moreModels: " 等 {n} 个模型",
      },
      en: {
        nav: "Wallet",
        navTooltip: "Wallet: balance and usage",
        open: "Open wallet",
        close: "Close",
        refresh: "Refresh",
        refreshing: "Refreshing…",
        balanceTitle: "DeepSeek Balance",
        recharge: "Recharge",
        balanceTotal: "Total balance",
        balanceAvailable: "Available",
        balanceUnavailable: "Unavailable",
        balanceUpdatedAt: "Updated {time}",
        balanceStale: "Showing last good value",
        balanceUnsupportedBaseUrl: "The base URL is not the official DeepSeek endpoint; balance is unavailable",
        balanceMissingKey: "DeepSeek API key is not configured",
        balanceRouteUnavailable: "No active deepseek-official route was found",
        balanceErrorUnauthorized: "Invalid API key",
        balanceErrorRateLimited: "Balance endpoint rate-limited; retrying automatically",
        balanceErrorTimeout: "Balance endpoint timed out",
        balanceErrorNetwork: "Network error",
        balanceErrorUpstream: "Balance endpoint returned an error",
        balanceErrorBadResponse: "Balance endpoint returned an invalid payload",
        balanceErrorGeneric: "Balance query failed",
        lowBalance: "Balance below ¥{amount}",
        lowBalanceBadge: "Low balance",
        costTitle: "Cost estimate",
        costTotal: "Total estimate {amount}",
        costCacheSaved: "Cache savings",
        costInputTotal: "Total input tokens",
        costOutputTotal: "Total output tokens",
        costCacheHitAverage: "Avg cache hit rate",
        costAverageTokens: "Avg",
        costMinValue: "Min",
        costMaxValue: "Max",
        costLine: "≈ {amount} · cache hit {percent}% · this session",
        costAmountInline: "Amount ≈ {amount}",
        "stats.counts": "{turns} turns · {steps} steps",
        "stats.llm": "LLM {duration}",
        "stats.toolCall": "Tool call {duration}",
        "stats.ttftAverage": "TTFT avg {duration}",
        "stats.tokensPerSecond": "{throughput} tok/s",
        "stats.cacheHit": "Cache hit {percent}%",
        "stats.tokens": "Input {input} tok · Output {output} tok",
        costTooltipTotal: "This session: {amount}",
        costTooltipPeriod: "{label}: {amount}",
        costTooltipModel: "{model}: {amount}",
        costTooltipUnknown: "{tokens} tok from unpriced models excluded",
        costTooltipUnsupported: "{tokens} tok from non-DeepSeek providers excluded",
        costPeriodLegacy: "Legacy price",
        costPeriodOffpeak: "Off-peak",
        costPeriodPeak: "Peak",
        costUnknownLine: "≈ {amount} · includes unpriced models · this session",
        costSessions: "Session cost ranking",
        costSession: "Session",
        costModel: "Model",
        costInput: "Input",
        costOutput: "Output",
        costCacheHit: "Cache hit",
        costAmount: "Amount",
        costEmpty: "No session cost data yet",
        costComputing: "Computing cost…",
        costDisclaimer: "Estimated from session logs and the built-in price table; not an official bill. Forks and subagents are counted independently.",
        costUnknownBadge: "Unpriced models",
        costUnsupportedBadge: "Non-DeepSeek usage",
        timeHm: "{h}:{m}",
        moreModels: " +{n} models",
      },
    };

    function fallbackT(key, params) {
      var text = DICT.zh[key] ?? key;
      if (params) for (var k in params) text = text.replace("{" + k + "}", String(params[k]));
      return text;
    }

    // ── tiny external stores ───────────────────────────────────────────────

    function createStore(initial) {
      var state = initial;
      var listeners = new Set();
      return {
        getSnapshot: function () {
          return state;
        },
        subscribe: function (listener) {
          listeners.add(listener);
          return function () {
            listeners.delete(listener);
          };
        },
        set: function (next) {
          var value = typeof next === "function" ? next(state) : next;
          if (value === state) return;
          state = value;
          for (var listenersCopy = Array.from(listeners), i = 0; i < listenersCopy.length; i++) {
            try {
              listenersCopy[i]();
            } catch (error) {
              console.error("dsh-plugin-wallet: store listener failed", error);
            }
          }
        },
      };
    }

    var walletUi = createStore({ open: false });
    var balanceStore = createStore({ status: "idle", data: null, lastFetchedAt: 0, refreshing: false });
    var sessionCostsStore = createStore({ status: "idle", data: null, lastFetchedAt: 0 });
    var balanceInflight = null;
    var sessionCostsInflight = null;
    var pollTimer = null;
    var pollUsers = 0;

    function refreshBalance(force) {
      if (balanceInflight !== null) return balanceInflight;
      var snapshot = balanceStore.getSnapshot();
      if (!force && snapshot.data !== null && Date.now() - snapshot.data.fetchedAt < 60 * 1000) {
        return Promise.resolve(snapshot.data);
      }
      balanceStore.set(function (s) {
        return { ...s, refreshing: true };
      });
      balanceInflight = fetch("/dsh-plugin-wallet/balance" + (force ? "?refresh=1" : ""), {
        headers: { accept: "application/json" },
      })
        .then(function (response) {
          if (!response.ok) throw new Error("http-" + response.status);
          return response.json();
        })
        .then(function (json) {
          if (!json.ok || typeof json.data !== "object" || json.data === null) {
            throw new Error("bad-response");
          }
          balanceStore.set(function () {
            return { status: json.data.status, data: json.data, lastFetchedAt: Date.now(), refreshing: false };
          });
          return json.data;
        })
        .catch(function (error) {
          var current = balanceStore.getSnapshot();
          balanceStore.set(function () {
            return { status: "error", data: current.data, lastFetchedAt: current.lastFetchedAt, refreshing: false, transportError: String(error) };
          });
          return null;
        })
        .finally(function () {
          balanceInflight = null;
        });
      return balanceInflight;
    }

    function refreshSessionCosts(force) {
      if (sessionCostsInflight !== null) return sessionCostsInflight;
      var snapshot = sessionCostsStore.getSnapshot();
      if (!force && snapshot.data !== null && Date.now() - snapshot.lastFetchedAt < 60 * 1000) {
        return Promise.resolve(snapshot.data);
      }
      sessionCostsStore.set(function (s) {
        return { ...s, status: "loading" };
      });
      sessionCostsInflight = fetch("/dsh-plugin-wallet/session-costs", {
        headers: { accept: "application/json" },
      })
        .then(function (response) {
          if (!response.ok) throw new Error("http-" + response.status);
          return response.json();
        })
        .then(function (json) {
          if (!json.ok || !json.data || !Array.isArray(json.data.rows)) {
            throw new Error("bad-response");
          }
          sessionCostsStore.set(function () {
            return { status: "ready", data: json.data, lastFetchedAt: Date.now() };
          });
          return json.data;
        })
        .catch(function (error) {
          sessionCostsStore.set(function (s) {
            return { status: "error", data: s.data, lastFetchedAt: s.lastFetchedAt, transportError: String(error) };
          });
          return null;
        })
        .finally(function () {
          sessionCostsInflight = null;
        });
      return sessionCostsInflight;
    }

    function ensureBalancePolling(intervalMs) {
      pollUsers += 1;
      if (pollTimer !== null) return;
      refreshBalance(false);
      pollTimer = setInterval(function () {
        refreshBalance(false);
      }, typeof intervalMs === "number" && intervalMs >= 30 * 1000 ? intervalMs : DEFAULT_POLL_MS);
    }

    function releaseBalancePolling() {
      pollUsers = Math.max(0, pollUsers - 1);
      if (pollUsers === 0 && pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    // ── formatting ─────────────────────────────────────────────────────────

    function formatCost(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "—";
      return "¥" + value.toFixed(value < 0.01 ? 4 : 2);
    }

    function formatAmount(value, currency) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "—";
      var symbol = currency === "USD" ? "$" : currency === "CNY" ? "¥" : typeof currency === "string" && currency !== "" ? currency + " " : "¥";
      return symbol + value.toFixed(2);
    }

    function formatTokens(n) {
      if (typeof n !== "number" || !Number.isFinite(n)) return "—";
      if (n < 1000) return String(n);
      if (n < 1e6) {
        var k = n / 1000;
        var roundedK = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
        if (roundedK < 1000) return String(roundedK) + "K";
      }
      return (n >= 1e8 ? String(Math.round(n / 1e6)) : String(Math.round(n / 1e5) / 10)) + "M";
    }

    function formatClock(ms, t) {
      if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
      var d = new Date(ms);
      var pad = function (n) {
        return (n < 10 ? "0" : "") + n;
      };
      return t("timeHm", { h: pad(d.getHours()), m: pad(d.getMinutes()) });
    }

    function totalTokens(tokens) {
      if (typeof tokens !== "object" || tokens === null) return 0;
      return (tokens.uncachedInputTokens ?? 0) + (tokens.cacheReadTokens ?? 0) + (tokens.cacheWriteTokens ?? 0) + (tokens.outputTokens ?? 0);
    }

    function cnyInfo(data) {
      var infos = data && data.balance ? data.balance.infos : null;
      if (!Array.isArray(infos) || infos.length === 0) return null;
      var cny = null;
      for (var i = 0; i < infos.length; i++) {
        if (infos[i] && infos[i].currency === "CNY") cny = infos[i];
      }
      return cny ?? infos[0];
    }

    function balanceBadge(data) {
      if (data === null) return "neutral";
      if (data.status === "ok") {
        if (data.balance === null || data.balance.isAvailable === false) return "warn";
        var info = cnyInfo(data);
        if (info === null || info.currency !== "CNY") return "neutral";
        return info.totalBalance < data.threshold ? "error" : "ok";
      }
      if (data.status === "missing-key") return "neutral";
      if (data.status === "error" && data.balance !== null && data.balance.isAvailable === true) {
        var stale = cnyInfo(data);
        if (stale !== null && stale.currency === "CNY" && stale.totalBalance < data.threshold) return "error";
        return "warn";
      }
      return "warn";
    }

    function balanceText(data) {
      if (data === null) return "—";
      var info = cnyInfo(data);
      return info === null ? "—" : formatAmount(info.totalBalance, info.currency);
    }

    function periodLabel(period, t) {
      if (period === "legacy") return t("costPeriodLegacy");
      if (period === "peak") return t("costPeriodPeak");
      return t("costPeriodOffpeak");
    }

    // ── stats-line helpers (mirror the built-in StatsLine fallback) ────────

    function usageOutputTokens(usage) {
      if (typeof usage !== "object" || usage === null) return null;
      var value = usage.outputTokens;
      return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    }

    function assistantStepReading(node) {
      var timing = node.timing;
      return {
        ttftMs: timing !== void 0 && timing.stepStartTime !== null && timing.firstTokenTime !== null ? Math.max(0, timing.firstTokenTime - timing.stepStartTime) : null,
        decodeMs: timing !== void 0 && timing.firstTokenTime !== null ? Math.max(0, timing.completedTime - timing.firstTokenTime) : null,
        outputTokens: usageOutputTokens(node.usage),
      };
    }

    function deriveStats(nodes) {
      var turns = new Set();
      var steps = 0;
      var llmMs = 0;
      var toolMs = 0;
      var ttftMs = 0;
      var ttftSteps = 0;
      var decodeMs = 0;
      var decodeTokens = 0;
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.kind === "tool-result") {
          if (node.callTime !== null) toolMs += Math.max(0, node.time - node.callTime);
          continue;
        }
        if (node.kind !== "assistant") continue;
        turns.add(node.turn);
        steps += 1;
        if (node.timing !== void 0 && node.timing.stepStartTime !== null) {
          llmMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime);
        }
        var reading = assistantStepReading(node);
        if (reading.ttftMs !== null) {
          ttftMs += reading.ttftMs;
          ttftSteps += 1;
        }
        if (reading.decodeMs !== null && reading.outputTokens !== null) {
          decodeMs += reading.decodeMs;
          decodeTokens += reading.outputTokens;
        }
      }
      return {
        turns: turns.size,
        steps: steps,
        llmMs: llmMs,
        toolMs: toolMs,
        ttftMs: ttftMs,
        ttftSteps: ttftSteps,
        decodeMs: decodeMs,
        decodeTokens: decodeTokens,
      };
    }

    function billedInputTokens(usage) {
      return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    }

    function cacheHitPercent(usage) {
      var denominator = billedInputTokens(usage);
      return denominator === 0 ? null : Math.round(usage.cacheReadTokens / denominator * 100);
    }

    function formatDuration(ms) {
      var s = ms / 1e3;
      if (s < 60) return String(Math.round(s * 10) / 10) + "s";
      var whole = Math.round(s);
      return Math.floor(whole / 60) + "m" + (whole % 60) + "s";
    }

    function formatTokensPerSecond(tps) {
      var clamped = Math.max(0, tps);
      return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10);
    }

    function PresetIcon(component, props, fallbackText) {
      if (component !== null && typeof component === "function") {
        return React.createElement(component, props);
      }
      return React.createElement(
        "span",
        { className: "dsh-wallet-icon-fallback", "aria-hidden": true },
        fallbackText,
      );
    }

    // No wallet-specific glyph ships in the rc.6 primitive set; the outline
    // data glyph is the closest stock icon for balance/token usage.
    function WalletGlyph(props) {
      return PresetIcon(uiPrimitives !== null ? uiPrimitives.IconDataOutline16 : null, props, "¥");
    }

    function RefreshGlyph(props) {
      return PresetIcon(uiPrimitives !== null ? uiPrimitives.IconRefreshOutline14 : null, props, "↻");
    }

    function CloseGlyph(props) {
      return PresetIcon(uiPrimitives !== null ? uiPrimitives.IconCloseOutline16 : null, props, "×");
    }

    function HelpGlyph(props) {
      return PresetIcon(uiPrimitives !== null ? uiPrimitives.IconQuestionOutline14 : null, props, "?");
    }

    function WalletTooltip(props) {
      if (uiPrimitives !== null && typeof uiPrimitives.Tooltip === "function") {
        var rest = {};
        for (var key in props) {
          if (key !== "children") rest[key] = props[key];
        }
        return React.createElement(uiPrimitives.Tooltip, rest, props.children);
      }
      return props.children;
    }

    // ── components ─────────────────────────────────────────────────────────

    function WalletButton(props) {
      var t = props.t;
      var wide = props.wide === true;
      var ui = React.useSyncExternalStore(walletUi.subscribe, walletUi.getSnapshot);
      var bal = React.useSyncExternalStore(balanceStore.subscribe, balanceStore.getSnapshot);
      React.useEffect(function () {
        ensureBalancePolling(bal.data !== null ? bal.data.refreshIntervalMs : undefined);
        return releaseBalancePolling;
      }, []);
      var badge = balanceBadge(bal.data);
      var title = t("navTooltip");
      if (bal.data !== null && bal.data.status === "ok" && badge === "error") title = title + " · " + t("lowBalance", { amount: bal.data.threshold });
      if (bal.data !== null && bal.data.status !== "ok" && bal.data.status !== "missing-key") title = title + " · " + t("balanceErrorGeneric");

      var button = React.createElement(
        "button",
        {
          type: "button",
          className: "dsh-wallet-sidebar " + (wide ? "dsh-wallet-wide" : "dsh-wallet-rail"),
          title: title,
          "aria-label": t("open"),
          "aria-haspopup": "dialog",
          onClick: function () {
            walletUi.set(function (s) {
              return { ...s, open: true };
            });
          },
        },
        React.createElement(WalletGlyph, { size: wide ? 16 : 18, className: "dsh-wallet-glyph" }),
        wide
          ? React.createElement("span", { className: "dsh-wallet-label" }, t("nav"))
          : null,
        wide
          ? React.createElement("span", { className: "dsh-wallet-amount" }, balanceText(bal.data))
          : null,
        wide
          ? React.createElement("span", { className: "dsh-wallet-badge dsh-wallet-badge-" + badge, "aria-hidden": true })
          : null,
        !wide
          ? React.createElement("span", { className: "dsh-wallet-rail-dot dsh-wallet-badge-" + badge, "aria-hidden": true })
          : null,
      );

      if (!wide) {
        return React.createElement(
          "div",
          { className: "dsh-wallet-region dsh-wallet-region-rail" },
          button,
          React.createElement(
            "div",
            { className: "dsh-wallet-popup" },
            React.createElement("span", { className: "dsh-wallet-popup-dot dsh-wallet-badge-" + badge, "aria-hidden": true }),
            React.createElement("span", { className: "dsh-wallet-popup-main" }, t("nav")),
            React.createElement("span", { className: "dsh-wallet-popup-sub" }, balanceText(bal.data)),
          ),
        );
      }
      return button;
    }

    function BalanceSection(props) {
      var t = props.t;
      var data = props.data;
      if (data === null) {
        return React.createElement(
          "div",
          { className: "dsh-wallet-card" },
          React.createElement(
            "div",
            { className: "dsh-wallet-card-head" },
            React.createElement("span", { className: "dsh-wallet-card-title" }, t("balanceTitle")),
            React.createElement("span", { className: "dsh-wallet-updated dsh-wallet-muted" }, t("refreshing")),
          ),
        );
      }
      var info = cnyInfo(data);
      var statusText = t("balanceErrorGeneric");
      if (data.status === "ok") statusText = data.balance.isAvailable ? t("balanceAvailable") : t("balanceUnavailable");
      else if (data.status === "missing-key") statusText = t("balanceMissingKey");
      else if (data.status === "unsupported-base-url") statusText = t("balanceUnsupportedBaseUrl");
      else if (data.error !== null && typeof data.error.code === "string") statusText = t("balanceError" + data.error.code[0].toUpperCase() + data.error.code.slice(1).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })) ?? t("balanceErrorGeneric");

      var updated = t("balanceUpdatedAt", { time: formatClock(data.fetchedAt, t) }) + (data.stale ? " · " + t("balanceStale") : "");

      return React.createElement(
        "div",
        { className: "dsh-wallet-card" },
        React.createElement(
          "div",
          { className: "dsh-wallet-card-head" },
          React.createElement(
            "div",
            { className: "dsh-wallet-card-head-main" },
            React.createElement("span", { className: "dsh-wallet-card-title" }, t("balanceTitle")),
            React.createElement("span", { className: "dsh-wallet-status dsh-wallet-status-" + data.status }, statusText),
          ),
          React.createElement("span", { className: "dsh-wallet-updated" }, updated),
        ),
        React.createElement(
          "div",
          { className: "dsh-wallet-balance-row" },
          React.createElement("span", { className: "dsh-wallet-balance-main" }, info === null ? "—" : formatAmount(info.totalBalance, info.currency)),
          info !== null && info.currency !== "CNY"
            ? React.createElement("span", { className: "dsh-wallet-muted" }, info.currency)
            : null,
          data.status === "ok" && info !== null && info.totalBalance < data.threshold
            ? React.createElement("span", { className: "dsh-wallet-low" }, t("lowBalance", { amount: data.threshold }))
            : null,
          React.createElement(
            "a",
            {
              className: "dsh-wallet-recharge",
              href: "https://platform.deepseek.com/top_up",
              target: "_blank",
              rel: "noreferrer",
            },
            t("recharge"),
          ),
        ),
      );
    }

    function CostOverview(props) {
      var t = props.t;
      var rows = props.rows;
      var helpButton = React.createElement(
        "button",
        {
          type: "button",
          className: "dsh-wallet-help",
          "aria-label": t("costDisclaimer"),
          title: uiPrimitives !== null && typeof uiPrimitives.Tooltip === "function" ? undefined : t("costDisclaimer"),
        },
        React.createElement(HelpGlyph, { size: 14 }),
      );
      var head = React.createElement(
        "div",
        { className: "dsh-wallet-card-head" },
        React.createElement(
          "div",
          { className: "dsh-wallet-card-title-wrap" },
          React.createElement("span", { className: "dsh-wallet-card-title" }, t("costTitle")),
          React.createElement(
            WalletTooltip,
            { label: t("costDisclaimer"), side: "top", maxWidth: 320 },
            helpButton,
          ),
        ),
      );
      if (rows.length === 0) {
        return React.createElement(
          "div",
          { className: "dsh-wallet-card" },
          head,
          React.createElement("div", { className: "dsh-wallet-muted" }, t("costEmpty")),
        );
      }
      var total = 0;
      var cacheSaved = 0;
      var inputTotal = 0;
      var outputTotal = 0;
      var cacheReadTotal = 0;
      var minCacheHit = null;
      var maxCacheHit = null;
      var unknown = false;
      var unsupported = false;
      for (var i = 0; i < rows.length; i++) {
        var cost = rows[i].cost;
        var tokens = cost.totalTokens || {};
        var hit = cost.cacheHitPercent;
        total += cost.totalCostYuan;
        cacheSaved += cost.cacheSavedYuan ?? 0;
        inputTotal += (tokens.uncachedInputTokens ?? 0) + (tokens.cacheReadTokens ?? 0) + (tokens.cacheWriteTokens ?? 0);
        outputTotal += tokens.outputTokens ?? 0;
        cacheReadTotal += tokens.cacheReadTokens ?? 0;
        if (typeof hit === "number" && Number.isFinite(hit)) {
          if (minCacheHit === null || hit < minCacheHit) minCacheHit = hit;
          if (maxCacheHit === null || hit > maxCacheHit) maxCacheHit = hit;
        }
        unknown = unknown || cost.hasUnknownModel === true;
        unsupported = unsupported || cost.hasUnsupportedProvider === true;
      }
      var cacheHitAverage = inputTotal === 0 ? null : Math.round(cacheReadTotal / inputTotal * 100);
      var avgInput = rows.length > 0 ? inputTotal / rows.length : 0;
      var avgOutput = rows.length > 0 ? outputTotal / rows.length : 0;
      var costCard = React.createElement(
        "div",
        { className: "dsh-wallet-card dsh-wallet-cost-card" },
        head,
        React.createElement("div", { className: "dsh-wallet-balance-main" }, formatCost(total)),
        React.createElement(
          "div",
          { className: "dsh-wallet-meta-line" },
          t("costCacheSaved") + " " + formatCost(cacheSaved),
        ),
        unknown
          ? React.createElement("div", { className: "dsh-wallet-warn" }, t("costUnknownBadge"))
          : null,
        unsupported
          ? React.createElement("div", { className: "dsh-wallet-warn" }, t("costUnsupportedBadge"))
          : null,
      );
      var inputCard = React.createElement(
        "div",
        { className: "dsh-wallet-card dsh-wallet-metric-card" },
        React.createElement("span", { className: "dsh-wallet-card-title" }, t("costInputTotal")),
        React.createElement("span", { className: "dsh-wallet-balance-main dsh-wallet-metric-value" }, formatTokens(inputTotal)),
        React.createElement(
          "div",
          { className: "dsh-wallet-metric-sub" },
          React.createElement("span", { className: "dsh-wallet-metric-sub-label" }, t("costAverageTokens")),
          React.createElement("span", { className: "dsh-wallet-metric-sub-value" }, formatTokens(Math.round(avgInput))),
        ),
      );
      var outputCard = React.createElement(
        "div",
        { className: "dsh-wallet-card dsh-wallet-metric-card" },
        React.createElement("span", { className: "dsh-wallet-card-title" }, t("costOutputTotal")),
        React.createElement("span", { className: "dsh-wallet-balance-main dsh-wallet-metric-value" }, formatTokens(outputTotal)),
        React.createElement(
          "div",
          { className: "dsh-wallet-metric-sub" },
          React.createElement("span", { className: "dsh-wallet-metric-sub-label" }, t("costAverageTokens")),
          React.createElement("span", { className: "dsh-wallet-metric-sub-value" }, formatTokens(Math.round(avgOutput))),
        ),
      );
      var cacheCard = React.createElement(
        "div",
        { className: "dsh-wallet-card dsh-wallet-metric-card" },
        React.createElement("span", { className: "dsh-wallet-card-title" }, t("costCacheHitAverage")),
        React.createElement("span", { className: "dsh-wallet-balance-main dsh-wallet-metric-value" }, cacheHitAverage === null ? "—" : cacheHitAverage + "%"),
        React.createElement(
          "div",
          { className: "dsh-wallet-metric-sub" },
          React.createElement("span", { className: "dsh-wallet-metric-sub-label" }, t("costMinValue")),
          React.createElement("span", { className: "dsh-wallet-metric-sub-value" }, minCacheHit === null ? "—" : minCacheHit + "%"),
          React.createElement("span", { className: "dsh-wallet-metric-sub-sep" }, "·"),
          React.createElement("span", { className: "dsh-wallet-metric-sub-label" }, t("costMaxValue")),
          React.createElement("span", { className: "dsh-wallet-metric-sub-value" }, maxCacheHit === null ? "—" : maxCacheHit + "%"),
        ),
      );
      return React.createElement(
        "div",
        { className: "dsh-wallet-cost-grid" },
        costCard,
        inputCard,
        outputCard,
        cacheCard,
      );
    }

    function CostTable(props) {
      var t = props.t;
      var rows = props.rows;
      if (rows.length === 0) {
        return React.createElement(
          "div",
          { className: "dsh-wallet-card" },
          React.createElement("div", { className: "dsh-wallet-card-title" }, t("costSessions")),
          React.createElement("div", { className: "dsh-wallet-muted dsh-wallet-empty" }, t("costEmpty")),
        );
      }
      return React.createElement(
        "div",
        { className: "dsh-wallet-card dsh-wallet-table-card" },
        React.createElement("div", { className: "dsh-wallet-card-title" }, t("costSessions")),
        React.createElement(
          "div",
          { className: "dsh-wallet-table-scroll" },
          React.createElement(
            "table",
            { className: "dsh-wallet-table" },
            React.createElement(
              "thead",
              null,
              React.createElement(
                "tr",
                null,
                React.createElement("th", null, t("costSession")),
                React.createElement("th", null, t("costModel")),
                React.createElement("th", { className: "dsh-wallet-num" }, t("costInput")),
                React.createElement("th", { className: "dsh-wallet-num" }, t("costOutput")),
                React.createElement("th", { className: "dsh-wallet-num" }, t("costCacheHit")),
                React.createElement("th", { className: "dsh-wallet-num" }, t("costAmount")),
              ),
            ),
            React.createElement(
              "tbody",
              null,
              rows.map(function (row) {
                var models = row.cost.byModel ?? [];
                var modelText = models.slice(0, 2).map(function (entry) { return entry.model; }).join(" · ");
                if (models.length > 2) modelText += t("moreModels", { n: models.length - 2 });
                return React.createElement(
                  "tr",
                  { key: row.id },
                  React.createElement("td", { className: "dsh-wallet-session-cell" }, row.item.displayTitle),
                  React.createElement("td", { className: "dsh-wallet-muted dsh-wallet-model-cell" }, modelText || "—"),
                  React.createElement("td", { className: "dsh-wallet-num" }, formatTokens(row.cost.totalTokens.uncachedInputTokens + row.cost.totalTokens.cacheReadTokens + row.cost.totalTokens.cacheWriteTokens)),
                  React.createElement("td", { className: "dsh-wallet-num" }, formatTokens(row.cost.totalTokens.outputTokens)),
                  React.createElement("td", { className: "dsh-wallet-num" }, row.cost.cacheHitPercent === null ? "—" : row.cost.cacheHitPercent + "%"),
                  React.createElement("td", { className: "dsh-wallet-num dsh-wallet-cost-cell" }, formatCost(row.cost.totalCostYuan)),
                );
              }),
            ),
          ),
        ),
      );
    }

    function WalletPanel(props) {
      var t = props.t;
      var useSessions = props.useSessions;
      var ui = React.useSyncExternalStore(walletUi.subscribe, walletUi.getSnapshot);
      var bal = React.useSyncExternalStore(balanceStore.subscribe, balanceStore.getSnapshot);
      var costFeed = React.useSyncExternalStore(sessionCostsStore.subscribe, sessionCostsStore.getSnapshot);
      var sessions = useSessions ? useSessions(function (s) { return s; }) : null;

      React.useEffect(function () {
        if (!ui.open) return;
        ensureBalancePolling(bal.data !== null ? bal.data.refreshIntervalMs : undefined);
        refreshBalance(false);
        refreshSessionCosts(false);
        return releaseBalancePolling;
      }, [ui.open]);

      var close = function () {
        walletUi.set(function (s) {
          return { ...s, open: false };
        });
      };

      React.useEffect(function () {
        if (!ui.open) return;
        var onKeyDown = function (event) {
          if (event.key === "Escape") close();
        };
        document.addEventListener("keydown", onKeyDown);
        return function () {
          document.removeEventListener("keydown", onKeyDown);
        };
      }, [ui.open]);

      var rows = React.useMemo(
        function () {
          var localById = {};
          if (sessions && sessions.ids) {
            for (var i = 0; i < sessions.ids.length; i++) {
              localById[sessions.ids[i]] = sessions.byId[sessions.ids[i]];
            }
          }
          var out = [];
          for (var id in localById) {
            var item = localById[id];
            var cost = item && item.projectionValues ? item.projectionValues[PROJECTION_KEY] : undefined;
            if (cost !== undefined && totalTokens(cost.totalTokens) > 0) out.push({ id: id, item: item, cost: cost });
          }
          var feedRows = costFeed && costFeed.data && costFeed.data.rows ? costFeed.data.rows : [];
          for (var j = 0; j < feedRows.length; j++) {
            var row = feedRows[j];
            if (!row || !row.id || !row.cost) continue;
            var existing = null;
            for (var k = 0; k < out.length; k++) {
              if (out[k].id === row.id) {
                existing = out[k];
                break;
              }
            }
            var remoteItem = localById[row.id] || { id: row.id, displayTitle: row.displayTitle || row.id };
            if (existing !== null) {
              existing.item = remoteItem;
              existing.cost = row.cost;
            } else if (totalTokens(row.cost.totalTokens) > 0) {
              out.push({ id: row.id, item: remoteItem, cost: row.cost });
            }
          }
          out.sort(function (a, b) { return b.cost.totalCostYuan - a.cost.totalCostYuan; });
          return out;
        },
        [sessions, costFeed],
      );

      if (!ui.open) return null;

      return React.createElement(
        "div",
        { className: "dsh-wallet-overlay", role: "presentation" },
        React.createElement("div", { className: "dsh-wallet-mask", "aria-hidden": true, onClick: close }),
        React.createElement(
          "div",
          { className: "dsh-wallet-panel", role: "dialog", "aria-modal": true, "aria-label": t("nav") },
          React.createElement(
            "div",
            { className: "dsh-wallet-header" },
            React.createElement("span", { className: "dsh-wallet-title" }, t("nav")),
            React.createElement(
              "button",
              { type: "button", className: "dsh-wallet-iconbtn", title: t("refresh"), "aria-label": t("refresh"), onClick: function () { refreshBalance(true); refreshSessionCosts(true); } },
              React.createElement(RefreshGlyph, { size: 14 }),
            ),
            React.createElement(
              "button",
              { type: "button", className: "dsh-wallet-iconbtn", title: t("close"), "aria-label": t("close"), onClick: close },
              React.createElement(CloseGlyph, { size: 14 }),
            ),
          ),
          React.createElement(
            "div",
            { className: "dsh-wallet-body" },
            React.createElement(BalanceSection, { data: bal.data, t: t }),
            React.createElement(CostOverview, { rows: rows, t: t }),
            React.createElement(CostTable, { rows: rows, t: t }),
          ),
        ),
      );
    }

    function StatsLineWithCost(props) {
      var t = props.t;
      var useSession = props.useSession;
      var useProjection = props.useProjection;
      var settledNodes = useSession(function (s) { return s && s.chat && s.chat.legacy ? s.chat.legacy.nodes : []; });
      var usage = useProjection("tokenUsage");
      var projected = useProjection("sessionStats");
      var stats = projected ?? deriveStats(settledNodes);
      var groups = [];
      if (stats.steps > 0) {
        groups.push(t("stats.counts", { turns: stats.turns, steps: stats.steps }));
        var durations = [];
        if (stats.llmMs > 0) durations.push(t("stats.llm", { duration: formatDuration(stats.llmMs) }));
        if (stats.toolMs > 0) durations.push(t("stats.toolCall", { duration: formatDuration(stats.toolMs) }));
        if (durations.length > 0) groups.push(durations.join(" · "));
        var speeds = [];
        if (stats.ttftSteps > 0) speeds.push(t("stats.ttftAverage", { duration: formatDuration(stats.ttftMs / stats.ttftSteps) }));
        if (stats.decodeMs > 0) speeds.push(t("stats.tokensPerSecond", { throughput: formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1e3)) }));
        if (speeds.length > 0) groups.push(speeds.join(" · "));
      }
      if (usage !== undefined && usage !== null && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
        var cacheHit = cacheHitPercent(usage);
        if (cacheHit !== null) groups.push(t("stats.cacheHit", { percent: cacheHit }));
        groups.push(t("stats.tokens", { input: formatTokens(billedInputTokens(usage)), output: formatTokens(usage.outputTokens) }));
      }
      var cost = useProjection(PROJECTION_KEY);
      if (cost !== undefined && cost !== null && totalTokens(cost.totalTokens) > 0) {
        groups.unshift(t("costAmountInline", { amount: formatCost(cost.totalCostYuan) }));
      }
      if (groups.length === 0) return null;
      var line = groups.join(" | ");
      var rootRef = React.useRef(null);
      var truncatedState = React.useState(false);
      var truncated = truncatedState[0];
      var setTruncated = truncatedState[1];
      React.useLayoutEffect(function () {
        var el = rootRef.current;
        if (el === null) return;
        var measure = function () {
          setTruncated(el.scrollWidth > el.clientWidth);
        };
        measure();
        if (typeof ResizeObserver === "undefined") return;
        var observer = new ResizeObserver(measure);
        observer.observe(el);
        return function () {
          observer.disconnect();
        };
      }, [line]);
      var hasTooltipPrimitive = uiPrimitives !== null && typeof uiPrimitives.Tooltip === "function";
      var lineProps = { className: "dsh-wallet-statsline", ref: rootRef, "data-dsh-wallet-stats-tooltip": "" };
      if (!hasTooltipPrimitive && truncated) lineProps.title = line;
      var lineNode = React.createElement(
        "div",
        lineProps,
        groups.map(function (group, index) {
          return React.createElement("span", { key: group }, (index > 0 ? " | " : "") + group);
        }),
      );
      if (hasTooltipPrimitive) {
        return React.createElement(
          WalletTooltip,
          { label: line, side: "top", delayMs: 500, disabled: !truncated },
          lineNode,
        );
      }
      return lineNode;
    }

    // ── styles ─────────────────────────────────────────────────────────────

    var css = [
      "/* 钱包按钮与设置按钮同槽：让脚部操作条纵向排布，钱包行自然位于设置按钮上方 */",
      ".hHd-Xa_footArea:has(.dsh-wallet-sidebar) .hHd-Xa_footerActions{flex-direction:column;}",
      ".hHd-Xa_collapsed .hHd-Xa_footArea:has(.dsh-wallet-sidebar) .hHd-Xa_footerActions{align-items:center;}",
      "/* 宽栏按钮完整复用设置触发的几何：同样 34px、14px 字号、负外边距与圆角 */",
      ".dsh-wallet-sidebar{box-sizing:border-box;font-family:inherit;color:var(--dsw-alias-label-primary);background:transparent;border:none;cursor:pointer;display:flex;align-items:center;}",
      ".dsh-wallet-wide{flex:none;width:calc(100% + 8px);height:34px;border-radius:12px;gap:8px;margin:4px -4px;padding:6px 10px;font-size:14px;line-height:22px;justify-content:flex-start;overflow:hidden;}",
      ".dsh-wallet-wide:hover{background:var(--dsw-alias-interactive-bg-hover);}",
      ".dsh-wallet-rail{position:relative;width:36px;height:36px;border-radius:50%;justify-content:center;gap:0;margin:8px 0 10px;padding:0;}",
      ".dsh-wallet-rail:hover{background:var(--dsw-alias-interactive-bg-hover);}",
      ".dsh-wallet-glyph{flex:none;color:inherit;}",
      ".dsh-wallet-icon-fallback{font-size:12px;line-height:1;}",
      ".dsh-wallet-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".dsh-wallet-amount{min-width:0;margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;}",
      ".dsh-wallet-badge{width:7px;height:7px;border-radius:50%;flex:none;margin-left:2px;}",
      ".dsh-wallet-rail-dot{position:absolute;top:3px;right:3px;width:9px;height:9px;border-radius:50%;border:2px solid var(--dsw-specific-sidebar-fill);}",
      ".dsh-wallet-badge-ok{background:var(--dsw-alias-state-success-primary);}",
      ".dsh-wallet-badge-warn{background:var(--dsw-alias-state-warn-primary);}",
      ".dsh-wallet-badge-error{background:var(--dsw-alias-state-error-primary);}",
      ".dsh-wallet-badge-neutral{background:var(--dsw-alias-label-dimmed);}",
      "/* 收起状态：与峰谷徽章同款磨砂浮窗，hover 显示；坐标按底部脚部布局锚定 */",
      ".dsh-wallet-region{display:flex;align-items:center;justify-content:center;}",
      ".dsh-wallet-region-rail{position:relative;}",
      ".dsh-wallet-popup{position:fixed;left:64px;bottom:70px;z-index:40;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-overlay);background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 88%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv2);font-size:12px;line-height:18px;white-space:nowrap;visibility:hidden;opacity:0;transition:opacity 0.12s ease,visibility 0.12s;}",
      ".dsh-wallet-region-rail:hover .dsh-wallet-popup,.dsh-wallet-popup:hover{visibility:visible;opacity:1;}",
      "/* 峰谷徽章会为脚部预留底部空间，钱包行随之上移，浮窗同步补偿 */",
      ".hHd-Xa_footArea:has(.dsh-peak-region) .dsh-wallet-popup{bottom:107px;}",
      ".hHd-Xa_collapsed .hHd-Xa_footArea:has(.dsh-peak-region) .dsh-wallet-popup{bottom:111px;}",
      ".dsh-wallet-popup-dot{width:8px;height:8px;border-radius:50%;flex:none;}",
      ".dsh-wallet-popup-main{color:var(--dsw-alias-label-primary);font-weight:500;}",
      ".dsh-wallet-popup-sub{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}",
      "/* 弹窗：对齐设置弹窗的全屏遮罩 + 居中面板 + 24px 圆角 */",
      ".dsh-wallet-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;}",
      ".dsh-wallet-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);}",
      ".dsh-wallet-panel{position:relative;z-index:1;box-sizing:border-box;display:flex;flex-direction:column;width:min(800px,calc(100vw - 48px));max-height:calc(100vh - 48px);background:var(--dsw-alias-bg-layer-2);border-radius:24px;box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);overflow:hidden;}",
      ".dsh-wallet-header{flex:none;box-sizing:border-box;display:flex;align-items:center;gap:8px;height:54px;padding:16px 24px 14px;}",
      ".dsh-wallet-title{flex:1;min-width:0;font-size:16px;font-weight:500;line-height:24px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".dsh-wallet-iconbtn{box-sizing:border-box;width:28px;height:28px;color:var(--dsw-alias-label-secondary);background:transparent;border:none;border-radius:28px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;}",
      ".dsh-wallet-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}",
      ".dsh-wallet-body{flex:1 1 auto;min-height:0;overflow:hidden;padding:0 24px 24px;display:flex;flex-direction:column;gap:12px;}",
      ".dsh-wallet-body > .dsh-wallet-card:not(.dsh-wallet-table-card){flex:none;}",
      ".dsh-wallet-body > .dsh-wallet-cost-grid{flex:none;}",
      ".dsh-wallet-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:14px 16px;background:transparent;}",
      ".dsh-wallet-card + .dsh-wallet-card{margin-top:0;}",
      ".dsh-wallet-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}",
      ".dsh-wallet-card-head-main{display:flex;align-items:center;gap:8px;min-width:0;}",
      ".dsh-wallet-card-title-wrap{display:inline-flex;align-items:center;gap:4px;}",
      ".dsh-wallet-card-title{font-size:14px;font-weight:600;line-height:22px;}",
      ".dsh-wallet-help{box-sizing:border-box;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);background:transparent;border:none;border-radius:50%;cursor:help;display:inline-flex;align-items:center;justify-content:center;padding:0;}",
      ".dsh-wallet-help:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);}",
      ".dsh-wallet-updated{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;}",
      ".dsh-wallet-balance-row{display:flex;align-items:center;gap:8px;}",
      ".dsh-wallet-recharge{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;text-decoration:none;cursor:pointer;margin-left:auto;}",
      ".dsh-wallet-recharge:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}",
      ".dsh-wallet-balance-main{font-size:24px;line-height:30px;font-weight:650;font-variant-numeric:tabular-nums;}",
      ".dsh-wallet-low{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);}",
      ".dsh-wallet-meta-line{margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;}",
      ".dsh-wallet-cost-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;}",
      ".dsh-wallet-cost-card{min-width:0;}",
      ".dsh-wallet-metric-card{box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start;gap:8px;min-width:0;}",
      ".dsh-wallet-metric-card .dsh-wallet-card-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".dsh-wallet-metric-value{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".dsh-wallet-metric-sub{display:flex;align-items:baseline;gap:4px;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".dsh-wallet-metric-sub-label{flex:none;color:var(--dsw-alias-label-tertiary);}",
      ".dsh-wallet-metric-sub-value{flex:none;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}",
      ".dsh-wallet-metric-sub-sep{flex:none;color:var(--dsw-alias-label-tertiary);}",
      ".dsh-wallet-muted{color:var(--dsw-alias-label-tertiary);}",
      ".dsh-wallet-warn{margin-top:8px;color:var(--dsw-alias-state-warn-label);font-size:12px;line-height:18px;}",
      ".dsh-wallet-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);}",
      ".dsh-wallet-status-ok{color:var(--dsw-alias-state-success-primary);}",
      ".dsh-wallet-status-error,.dsh-wallet-status-unsupported-base-url{color:var(--dsw-alias-state-warn-label);}",
      ".dsh-wallet-status-missing-key{color:var(--dsw-alias-label-tertiary);}",
      ".dsh-wallet-empty{padding:12px 0;}",
      ".dsh-wallet-table-card{flex:1 1 auto;min-height:120px;display:flex;flex-direction:column;overflow:hidden;padding-bottom:4px;}",
      ".dsh-wallet-table-card .dsh-wallet-card-title{flex:none;}",
      ".dsh-wallet-table-scroll{min-height:0;flex:1;overflow-y:auto;margin-right:-16px;padding-right:16px;}",
      ".dsh-wallet-table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px;line-height:18px;}",
      ".dsh-wallet-table th,.dsh-wallet-table td{box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;}",
      ".dsh-wallet-table th{color:var(--dsw-alias-label-tertiary);font-weight:500;text-align:left;padding:6px 8px 6px 0;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap;}",
      ".dsh-wallet-table thead th{position:sticky;top:0;background:var(--dsw-alias-bg-layer-2);z-index:1;}",
      ".dsh-wallet-table th.dsh-wallet-num{text-align:right;}",
      ".dsh-wallet-table td{padding:7px 8px 7px 0;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:top;}",
      ".dsh-wallet-table tbody tr:last-child td{border-bottom:none;}",
      ".dsh-wallet-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}",
      ".dsh-wallet-table th:first-child,.dsh-wallet-table td:first-child{width:30%;}",
      ".dsh-wallet-table th:nth-child(2),.dsh-wallet-table td:nth-child(2){width:20%;}",
      ".dsh-wallet-table th.dsh-wallet-num,.dsh-wallet-table td.dsh-wallet-num{width:12.5%;min-width:0;padding-left:8px;}",
      ".dsh-wallet-session-cell{max-width:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".dsh-wallet-model-cell{max-width:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".dsh-wallet-cost-cell{font-weight:600;}",
      ".dsh-wallet-statsline{box-sizing:border-box;display:block;text-align:center;width:100%;max-width:var(--dsh-chat-content-width,748px);margin:0 auto;padding:4px calc(var(--dsh-composer-side-clearance,16px) + 16px) 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;}",
      ".dsh-wallet-statsline[data-dsh-wallet-stats-tooltip] ~ span[role=\"tooltip\"]{white-space:nowrap;max-width:none;}",
      "@media (prefers-reduced-motion:reduce){.dsh-wallet-popup{transition:none;}}",
    ].join("\n");

    var cssTagId = "dsh-plugin-wallet/styles";
    if (
      typeof document !== "undefined" &&
      document.querySelector("style[data-plugin-css=" + JSON.stringify(cssTagId) + "]") === null
    ) {
      var styleTag = document.createElement("style");
      styleTag.dataset.plugin = "dsh-plugin-wallet";
      styleTag.dataset.pluginCss = cssTagId;
      styleTag.textContent = css;
      document.head.appendChild(styleTag);
    }

    // ── plugin body ────────────────────────────────────────────────────────

    var inject = ["slots", "locale", "sessions"];

    function apply(ctx) {
      var locale = ctx.get("locale");
      var t = locale !== undefined && typeof locale.bind === "function" ? locale.bind(NS) : fallbackT;
      if (locale !== undefined && typeof locale.register === "function") {
        ctx.effect(function () {
          return locale.register(NS, { zh: DICT.zh, en: DICT.en });
        }, NS + ": dictionaries");
      }

      var slots = ctx.get("slots");
      if (slots === undefined) return;

      slots.inject("sidebar.footer.action", function () {
        return slots.register(
          {
            name: "sidebar.footer.action",
            id: "dsh-plugin-wallet",
            order: 20,
            locale: NS,
          },
          WalletButton,
        );
      });

      slots.inject("shell.overlay", function () {
        return slots.register(
          {
            name: "shell.overlay",
            id: "dsh-plugin-wallet",
            order: 1200,
            locale: NS,
          },
          WalletPanel,
        );
      });

      slots.inject("conversation.composer.dock", function () {
        return slots.register(
          {
            name: "conversation.composer.dock",
            id: "stats",
            order: 0,
            priority: -1,
            locale: NS,
          },
          StatsLineWithCost,
        );
      });
    }

    exports.apply = apply;
    exports.name = "dsh-plugin-wallet";
    exports.inject = inject;
    exports.DICT = DICT;
    return module.exports;
  },
});
