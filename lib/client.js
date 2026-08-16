/**
 * dsh-plugin-wallet client half: hand-written factory-CJS browser bundle.
 *
 * Three slot contributions:
 *   - sidebar.footer.action: wallet button above the settings row (wide card
 *     or collapsed rail icon) with a low-balance status dot.
 *   - shell.overlay: non-fullscreen wallet panel (balance cards + all-session
 *     cost ranking) toggled by the button.
 *   - conversation.composer.dock: one extra cost line directly below the
 *     built-in stats line, fed by the host `walletSessionCost` projection.
 *
 * The balance key never reaches this bundle; all balance facts come from the
 * host route `/dsh-plugin-wallet/balance` (masked key, amounts, status codes).
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-wallet",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

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
        balanceTotal: "总余额",
        balanceGranted: "赠送",
        balanceToppedUp: "充值",
        balanceAvailable: "可用",
        balanceUnavailable: "不可用",
        balanceUpdatedAt: "更新于 {time}",
        balanceStale: "显示上次成功值",
        balanceKey: "Key",
        balanceSourceEnv: "环境变量",
        balanceSourceFile: "凭据文件",
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
        costLine: "≈ {amount} · 缓存命中 {percent}% · 本会话估算",
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
        costPriceVersion: "价格版本 {version}",
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
        balanceTotal: "Total balance",
        balanceGranted: "Granted",
        balanceToppedUp: "Top-up",
        balanceAvailable: "Available",
        balanceUnavailable: "Unavailable",
        balanceUpdatedAt: "Updated {time}",
        balanceStale: "Showing last good value",
        balanceKey: "Key",
        balanceSourceEnv: "Environment",
        balanceSourceFile: "Credential file",
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
        costLine: "≈ {amount} · cache hit {percent}% · this session",
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
        costPriceVersion: "Price version {version}",
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
    var balanceInflight = null;
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
      if (n < 1e6) return (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10)) + "K";
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

      return React.createElement(
        "button",
        {
          type: "button",
          className: "dsh-wallet-sidebar " + (wide ? "dsh-wallet-wide" : "dsh-wallet-rail"),
          title: title,
          "aria-label": t("open"),
          onClick: function () {
            walletUi.set(function (s) {
              return { ...s, open: true };
            });
          },
        },
        React.createElement("span", { className: "dsh-wallet-glyph", "aria-hidden": true }),
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
    }

    function BalanceSection(props) {
      var t = props.t;
      var data = props.data;
      if (data === null) {
        return React.createElement(
          "div",
          { className: "dsh-wallet-card" },
          React.createElement("div", { className: "dsh-wallet-muted" }, t("costComputing")),
        );
      }
      var info = cnyInfo(data);
      var statusText = t("balanceErrorGeneric");
      if (data.status === "ok") statusText = data.balance.isAvailable ? t("balanceAvailable") : t("balanceUnavailable");
      else if (data.status === "missing-key") statusText = t("balanceMissingKey");
      else if (data.status === "unsupported-base-url") statusText = t("balanceUnsupportedBaseUrl");
      else if (data.error !== null && typeof data.error.code === "string") statusText = t("balanceError" + data.error.code[0].toUpperCase() + data.error.code.slice(1).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })) ?? t("balanceErrorGeneric");

      return React.createElement(
        "div",
        { className: "dsh-wallet-card" },
        React.createElement(
          "div",
          { className: "dsh-wallet-card-head" },
          React.createElement("span", { className: "dsh-wallet-card-title" }, t("balanceTitle")),
          React.createElement("span", { className: "dsh-wallet-status dsh-wallet-status-" + data.status }, statusText),
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
        ),
        info !== null
          ? React.createElement(
              "div",
              { className: "dsh-wallet-balance-meta" },
              React.createElement("span", null, t("balanceGranted") + " " + formatAmount(info.grantedBalance, info.currency)),
              React.createElement("span", null, t("balanceToppedUp") + " " + formatAmount(info.toppedUpBalance, info.currency)),
            )
          : null,
        data.key !== null && data.key.configured === true
          ? React.createElement(
              "div",
              { className: "dsh-wallet-key" },
              t("balanceKey") + " " + data.key.masked + (data.key.source === "env" ? " · " + t("balanceSourceEnv") : data.key.source === "file" ? " · " + t("balanceSourceFile") : ""),
            )
          : null,
        React.createElement(
          "div",
          { className: "dsh-wallet-meta-line" },
          t("balanceUpdatedAt", { time: formatClock(data.fetchedAt, t) }) + (data.stale ? " · " + t("balanceStale") : ""),
        ),
      );
    }

    function CostOverview(props) {
      var t = props.t;
      var rows = props.rows;
      if (rows.length === 0) {
        return React.createElement(
          "div",
          { className: "dsh-wallet-card" },
          React.createElement(
            "div",
            { className: "dsh-wallet-card-head" },
            React.createElement("span", { className: "dsh-wallet-card-title" }, t("costTitle")),
            React.createElement("span", { className: "dsh-wallet-muted" }, t("costPriceVersion", { version: 1 })),
          ),
          React.createElement("div", { className: "dsh-wallet-muted" }, t("costEmpty")),
        );
      }
      var total = 0;
      var cacheSaved = 0;
      var unknown = false;
      var unsupported = false;
      for (var i = 0; i < rows.length; i++) {
        var cost = rows[i].cost;
        total += cost.totalCostYuan;
        cacheSaved += cost.cacheSavedYuan ?? 0;
        unknown = unknown || cost.hasUnknownModel === true;
        unsupported = unsupported || cost.hasUnsupportedProvider === true;
      }
      return React.createElement(
        "div",
        { className: "dsh-wallet-card" },
        React.createElement(
          "div",
          { className: "dsh-wallet-card-head" },
          React.createElement("span", { className: "dsh-wallet-card-title" }, t("costTitle")),
          React.createElement("span", { className: "dsh-wallet-muted" }, t("costPriceVersion", { version: 1 })),
        ),
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
        React.createElement("div", { className: "dsh-wallet-muted dsh-wallet-disclaimer" }, t("costDisclaimer")),
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
                React.createElement("td", { className: "dsh-wallet-muted" }, modelText || "—"),
                React.createElement("td", { className: "dsh-wallet-num" }, formatTokens(row.cost.totalTokens.uncachedInputTokens + row.cost.totalTokens.cacheReadTokens + row.cost.totalTokens.cacheWriteTokens)),
                React.createElement("td", { className: "dsh-wallet-num" }, formatTokens(row.cost.totalTokens.outputTokens)),
                React.createElement("td", { className: "dsh-wallet-num" }, row.cost.cacheHitPercent === null ? "—" : row.cost.cacheHitPercent + "%"),
                React.createElement("td", { className: "dsh-wallet-num dsh-wallet-cost-cell" }, formatCost(row.cost.totalCostYuan)),
              );
            }),
          ),
        ),
      );
    }

    function WalletPanel(props) {
      var t = props.t;
      var useSessions = props.useSessions;
      var ui = React.useSyncExternalStore(walletUi.subscribe, walletUi.getSnapshot);
      var bal = React.useSyncExternalStore(balanceStore.subscribe, balanceStore.getSnapshot);
      var sessions = useSessions ? useSessions(function (s) { return s; }) : null;

      React.useEffect(function () {
        if (!ui.open) return;
        ensureBalancePolling(bal.data !== null ? bal.data.refreshIntervalMs : undefined);
        refreshBalance(false);
        return releaseBalancePolling;
      }, [ui.open]);

      var rows = React.useMemo(
        function () {
          if (!sessions || !sessions.ids) return [];
          var out = [];
          for (var i = 0; i < sessions.ids.length; i++) {
            var id = sessions.ids[i];
            var item = sessions.byId[id];
            var cost = item && item.projectionValues ? item.projectionValues[PROJECTION_KEY] : undefined;
            if (cost !== undefined && totalTokens(cost.totalTokens) > 0) out.push({ id: id, item: item, cost: cost });
          }
          out.sort(function (a, b) { return b.cost.totalCostYuan - a.cost.totalCostYuan; });
          return out;
        },
        [sessions],
      );

      if (!ui.open) return null;

      return React.createElement(
        "div",
        { className: "dsh-wallet-root", role: "dialog", "aria-label": t("nav") },
        React.createElement(
          "div",
          { className: "dsh-wallet-header" },
          React.createElement("span", { className: "dsh-wallet-title" }, t("nav")),
          React.createElement(
            "button",
            { type: "button", className: "dsh-wallet-iconbtn", title: t("refresh"), "aria-label": t("refresh"), onClick: function () { refreshBalance(true); } },
            React.createElement("span", { className: "dsh-wallet-refresh", "aria-hidden": true }),
          ),
          React.createElement(
            "button",
            { type: "button", className: "dsh-wallet-iconbtn", title: t("close"), "aria-label": t("close"), onClick: function () { walletUi.set(function (s) { return { ...s, open: false }; }); } },
            React.createElement("span", { className: "dsh-wallet-close", "aria-hidden": true }),
          ),
        ),
        React.createElement(
          "div",
          { className: "dsh-wallet-body" },
          React.createElement(BalanceSection, { data: bal.data, t: t }),
          React.createElement(CostOverview, { rows: rows, t: t }),
          React.createElement(CostTable, { rows: rows, t: t }),
        ),
      );
    }

    function CostLine(props) {
      var t = props.t;
      var cost = props.useProjection(PROJECTION_KEY);
      if (cost === undefined || cost === null) return null;
      if (totalTokens(cost.totalTokens) === 0) return null;
      var parts = [t("costTooltipTotal", { amount: formatCost(cost.totalCostYuan) })];
      for (var i = 0; i < (cost.byPeriod ?? []).length; i++) {
        var period = cost.byPeriod[i];
        if (totalTokens(period.tokens) > 0) parts.push(t("costTooltipPeriod", { label: periodLabel(period.period, t), amount: formatCost(period.costYuan) }));
      }
      for (var j = 0; j < (cost.byModel ?? []).length; j++) {
        var entry = cost.byModel[j];
        parts.push(t("costTooltipModel", { model: entry.model, amount: formatCost(entry.costYuan) }));
      }
      if (cost.hasUnknownModel === true) parts.push(t("costTooltipUnknown", { tokens: formatTokens(totalTokens(cost.unknownModelTokens)) }));
      if (cost.hasUnsupportedProvider === true) parts.push(t("costTooltipUnsupported", { tokens: formatTokens(totalTokens(cost.unsupportedTokens)) }));
      var line = cost.hasUnknownModel === true
        ? t("costUnknownLine", { amount: formatCost(cost.totalCostYuan) })
        : t("costLine", { amount: formatCost(cost.totalCostYuan), percent: cost.cacheHitPercent === null ? "—" : cost.cacheHitPercent });
      return React.createElement(
        "div",
        { className: "dsh-wallet-costline", title: parts.join("\n") },
        React.createElement("span", null, line),
      );
    }

    // ── styles ─────────────────────────────────────────────────────────────

    var css = [
      "/* 钱包按钮与 Cordis 面板同槽：让脚部操作条纵向排布，钱包行自然位于设置按钮上方 */",
      ".hHd-Xa_footArea:has(.dsh-wallet-sidebar) .hHd-Xa_footerActions{flex-direction:column;}",
      ".hHd-Xa_collapsed .hHd-Xa_footArea:has(.dsh-wallet-sidebar) .hHd-Xa_footerActions{align-items:center;}",
      ".dsh-wallet-sidebar{box-sizing:border-box;font:inherit;color:var(--dsw-alias-label-primary);background:transparent;border:none;cursor:pointer;display:flex;align-items:center;}",
      ".dsh-wallet-wide{width:100%;gap:6px;height:32px;padding:6px 8px;border-radius:8px;font-size:12px;line-height:18px;justify-content:flex-start;}",
      ".dsh-wallet-wide:hover{background:var(--dsw-alias-interactive-bg-hover);}",
      ".dsh-wallet-rail{position:relative;width:36px;height:36px;border-radius:50%;justify-content:center;padding:0;}",
      ".dsh-wallet-rail:hover{background:var(--dsw-alias-interactive-bg-hover);}",
      ".dsh-wallet-glyph{flex:none;width:16px;height:16px;border-radius:5px;background:linear-gradient(135deg,var(--dsw-alias-state-business-primary),color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,var(--dsw-alias-label-secondary)));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent);}",
      ".dsh-wallet-label{min-width:0;font-weight:500;}",
      ".dsh-wallet-amount{min-width:0;margin-left:auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;}",
      ".dsh-wallet-badge{width:7px;height:7px;border-radius:50%;flex:none;margin-left:2px;}",
      ".dsh-wallet-rail-dot{position:absolute;top:3px;right:3px;width:9px;height:9px;border-radius:50%;border:2px solid var(--dsw-specific-sidebar-fill);}",
      ".dsh-wallet-badge-ok{background:var(--dsw-alias-state-success-primary);}",
      ".dsh-wallet-badge-warn{background:var(--dsw-alias-state-warn-primary);}",
      ".dsh-wallet-badge-error{background:var(--dsw-alias-state-error-primary);}",
      ".dsh-wallet-badge-neutral{background:var(--dsw-alias-label-dimmed);}",
      ".dsh-wallet-root{position:absolute;top:20px;left:50%;transform:translateX(-50%);z-index:40;box-sizing:border-box;width:min(760px,calc(100vw - 48px));max-height:calc(100vh - 40px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);overflow:hidden;}",
      ".dsh-wallet-header{flex:none;display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);}",
      ".dsh-wallet-title{flex:1;font-size:15px;font-weight:600;line-height:22px;}",
      ".dsh-wallet-iconbtn{box-sizing:border-box;width:28px;height:28px;color:var(--dsw-alias-label-secondary);background:transparent;border:none;border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;}",
      ".dsh-wallet-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}",
      ".dsh-wallet-refresh{width:13px;height:13px;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;}",
      ".dsh-wallet-close{position:relative;width:14px;height:14px;}",
      ".dsh-wallet-close:before,.dsh-wallet-close:after{content:\"\";position:absolute;left:6px;top:1px;width:2px;height:12px;background:currentColor;border-radius:1px;}",
      ".dsh-wallet-close:before{transform:rotate(45deg);}",
      ".dsh-wallet-close:after{transform:rotate(-45deg);}",
      ".dsh-wallet-body{min-height:0;overflow:auto;padding:14px 16px 16px;display:flex;flex-direction:column;gap:12px;}",
      ".dsh-wallet-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px;background:transparent;}",
      ".dsh-wallet-card + .dsh-wallet-card{margin-top:0;}",
      ".dsh-wallet-card-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}",
      ".dsh-wallet-card-title{flex:1;font-size:13px;font-weight:600;line-height:20px;}",
      ".dsh-wallet-balance-row{display:flex;align-items:baseline;gap:8px;}",
      ".dsh-wallet-balance-main{font-size:22px;line-height:30px;font-weight:650;font-variant-numeric:tabular-nums;}",
      ".dsh-wallet-balance-meta{display:flex;gap:16px;margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;}",
      ".dsh-wallet-low{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);}",
      ".dsh-wallet-key{font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);}",
      ".dsh-wallet-meta-line{margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;}",
      ".dsh-wallet-muted{color:var(--dsw-alias-label-tertiary);}",
      ".dsh-wallet-warn{margin-top:8px;color:var(--dsw-alias-state-warn-label);font-size:12px;line-height:18px;}",
      ".dsh-wallet-disclaimer{margin-top:8px;}",
      ".dsh-wallet-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);}",
      ".dsh-wallet-status-ok{color:var(--dsw-alias-state-success-primary);}",
      ".dsh-wallet-status-error,.dsh-wallet-status-unsupported-base-url{color:var(--dsw-alias-state-warn-label);}",
      ".dsh-wallet-status-missing-key{color:var(--dsw-alias-label-tertiary);}",
      ".dsh-wallet-empty{padding:12px 0;}",
      ".dsh-wallet-table-card{padding-bottom:4px;}",
      ".dsh-wallet-table{width:100%;border-collapse:collapse;font-size:12px;line-height:18px;}",
      ".dsh-wallet-table th{color:var(--dsw-alias-label-tertiary);font-weight:500;text-align:left;padding:6px 8px 6px 0;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap;}",
      ".dsh-wallet-table td{padding:7px 8px 7px 0;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:top;}",
      ".dsh-wallet-table tbody tr:last-child td{border-bottom:none;}",
      ".dsh-wallet-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}",
      ".dsh-wallet-session-cell{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".dsh-wallet-cost-cell{font-weight:600;}",
      ".dsh-wallet-costline{box-sizing:border-box;display:block;text-align:center;width:100%;max-width:var(--dsh-chat-content-width,748px);margin:0 auto;padding:2px calc(var(--dsh-composer-side-clearance,16px) + 16px) 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;}",
      "@media (prefers-reduced-motion:reduce){.dsh-wallet-refresh{transition:none;}}",
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
            id: "dsh-plugin-wallet-cost",
            order: 1,
            locale: NS,
          },
          CostLine,
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
