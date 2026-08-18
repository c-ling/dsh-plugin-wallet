import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";


import {
  DEFAULT_CONFIG,
  PROJECTION_KEY,
  PRICE_EFFECTIVE_AT_MS,
  apply,
  applyWalletProjectionEvent,
  classifyPricePeriod,
  collectRouteFacts,
  collectSessionCostRows,
  costForUsage,
  sessionCostSnapshot,
  isOfficialBaseURL,
  maskApiKey,
  normalizeBalancePayload,
  normalizeConfig,
  priceFor,
  usageBuckets,
  viewWalletProjection,
  walletProjectionDefinition,
  zeroBuckets,
} from "../lib/index.js";

// ── config ─────────────────────────────────────────────────────────────────

test("normalizeConfig applies defaults and clamps", () => {
  assert.deepEqual(normalizeConfig(undefined), { ...DEFAULT_CONFIG });
  assert.deepEqual(normalizeConfig({ threshold: -5, refreshIntervalMs: 1, balanceTimeoutMs: 9e9 }), {
    threshold: 0,
    refreshIntervalMs: 30_000,
    balanceTimeoutMs: 120_000,
    balanceEndpoint: DEFAULT_CONFIG.balanceEndpoint,
  });
});

// ── pricing periods ───────────────────────────────────────────────────────

test("classifyPricePeriod: legacy before 2026-08-17 00:00 Beijing", () => {
  assert.equal(classifyPricePeriod(PRICE_EFFECTIVE_AT_MS - 1), "legacy");
  assert.equal(classifyPricePeriod(0), "legacy");
  assert.equal(classifyPricePeriod("bad"), "legacy");
});

test("classifyPricePeriod: offpeak/peak boundaries in Beijing time", () => {
  const bj = (h, m = 0) => PRICE_EFFECTIVE_AT_MS + (h * 60 + m) * 60_000;
  assert.equal(classifyPricePeriod(bj(0)), "offpeak");
  assert.equal(classifyPricePeriod(bj(8, 59)), "offpeak");
  assert.equal(classifyPricePeriod(bj(9)), "peak");
  assert.equal(classifyPricePeriod(bj(11, 59)), "peak");
  assert.equal(classifyPricePeriod(bj(12)), "offpeak");
  assert.equal(classifyPricePeriod(bj(13, 59)), "offpeak");
  assert.equal(classifyPricePeriod(bj(14)), "peak");
  assert.equal(classifyPricePeriod(bj(17, 59)), "peak");
  assert.equal(classifyPricePeriod(bj(18)), "offpeak");
  assert.equal(classifyPricePeriod(bj(23, 59)), "offpeak");
});

test("costForUsage uses cache-write as cache-miss price", () => {
  const price = priceFor("deepseek-v4-flash", "legacy");
  const bucket = {
    uncachedInputTokens: 1_000_000,
    cacheReadTokens: 2_000_000,
    cacheWriteTokens: 500_000,
    outputTokens: 1_000_000,
  };
  const result = costForUsage(bucket, price);
  assert.equal(result.costYuan, (1_500_000 * 1.0 + 2_000_000 * 0.02 + 1_000_000 * 2.0) / 1_000_000);
  assert.equal(result.cacheSavedYuan, (2_000_000 * (1.0 - 0.02)) / 1_000_000);
});

test("usageBuckets defaults absent cache fields to zero", () => {
  assert.deepEqual(usageBuckets({ inputTokens: 3, outputTokens: 4 }), {
    uncachedInputTokens: 3,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 4,
  });
  assert.equal(usageBuckets(null), null);
});

// ── session projection ────────────────────────────────────────────────────

function headerEvent(provider, model) {
  return { type: "request/header", seq: 1, time: PRICE_EFFECTIVE_AT_MS - 10_000, data: { header: { config: { provider, model } } } };
}

function usageEvent(turn, step, time, usage) {
  return { type: "assistant/message", seq: step * 10, time, data: { turn, step, usage } };
}

test("wallet projection prices known usage by current header model", () => {
  let state = walletProjectionDefinition.init();
  state = applyWalletProjectionEvent(state, headerEvent("deepseek-official", "deepseek-v4-flash"));
  state = applyWalletProjectionEvent(state, usageEvent(1, 1, PRICE_EFFECTIVE_AT_MS - 1, {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 2_000_000,
  }));
  const view = viewWalletProjection(state);
  assert.equal(view.totalCostYuan, 3.04);
  assert.equal(view.totalTokens.outputTokens, 1_000_000);
  assert.equal(view.cacheHitPercent, 67);
  assert.equal(view.byPeriod[0].period, "legacy");
  assert.equal(view.hasUnknownModel, false);
});

test("wallet projection replaces an earlier sample for the same turn/step", () => {
  let state = walletProjectionDefinition.init();
  state = applyWalletProjectionEvent(state, headerEvent("deepseek-official", "deepseek-v4-pro"));
  state = applyWalletProjectionEvent(state, usageEvent(1, 1, PRICE_EFFECTIVE_AT_MS - 1, {
    inputTokens: 100,
    outputTokens: 10,
  }));
  const replaced = applyWalletProjectionEvent(state, usageEvent(1, 1, PRICE_EFFECTIVE_AT_MS - 1, {
    inputTokens: 500,
    outputTokens: 50,
  }));
  const view = viewWalletProjection(replaced);
  assert.equal(view.totalTokens.uncachedInputTokens, 500);
  assert.equal(view.totalTokens.outputTokens, 50);
});

test("wallet projection ignores an identical usage chunk/message pair", () => {
  let state = walletProjectionDefinition.init();
  state = applyWalletProjectionEvent(state, headerEvent("deepseek-official", "deepseek-v4-flash"));
  const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30 };
  state = applyWalletProjectionEvent(state, { type: "assistant/chunk", time: PRICE_EFFECTIVE_AT_MS - 1, data: { turn: 1, step: 1, chunk: { type: "usage", usage } } });
  const next = applyWalletProjectionEvent(state, usageEvent(1, 1, PRICE_EFFECTIVE_AT_MS - 1, usage));
  assert.equal(next, state);
});

test("wallet projection splits peak and offpeak after the price change", () => {
  let state = walletProjectionDefinition.init();
  state = applyWalletProjectionEvent(state, headerEvent("deepseek-official", "deepseek-v4-flash"));
  const offpeak = PRICE_EFFECTIVE_AT_MS + (2 * 60 + 30) * 60_000; // 02:30 Beijing
  const peak = PRICE_EFFECTIVE_AT_MS + (10 * 60) * 60_000; // 10:00 Beijing
  state = applyWalletProjectionEvent(state, usageEvent(1, 1, offpeak, { inputTokens: 1_000_000, outputTokens: 0 }));
  state = applyWalletProjectionEvent(state, usageEvent(1, 2, peak, { inputTokens: 1_000_000, outputTokens: 0 }));
  const view = viewWalletProjection(state);
  assert.equal(view.totalCostYuan, 1.5 + 3.0);
  const periods = view.byPeriod.map((entry) => entry.period);
  assert.deepEqual(periods, ["offpeak", "peak"]);
});

test("wallet projection counts unknown models and unsupported providers without pricing them", () => {
  let state = walletProjectionDefinition.init();
  state = applyWalletProjectionEvent(state, headerEvent("deepseek-official", "deepseek-v9-mystery"));
  state = applyWalletProjectionEvent(state, usageEvent(1, 1, PRICE_EFFECTIVE_AT_MS - 1, { inputTokens: 100, outputTokens: 10 }));
  state = applyWalletProjectionEvent(state, headerEvent("anthropic", "claude-future"));
  state = applyWalletProjectionEvent(state, usageEvent(1, 2, PRICE_EFFECTIVE_AT_MS - 1, { inputTokens: 200, outputTokens: 20 }));
  const view = viewWalletProjection(state);
  assert.equal(view.totalCostYuan, 0);
  assert.equal(view.hasUnknownModel, true);
  assert.equal(view.unknownModelTokens.uncachedInputTokens, 100);
  assert.equal(view.hasUnsupportedProvider, true);
  assert.equal(view.unsupportedTokens.uncachedInputTokens, 200);
  assert.equal(view.totalTokens.uncachedInputTokens, 300);
});

test("wallet projection view passes its hand-rolled schema", () => {
  const view = viewWalletProjection(walletProjectionDefinition.init());
  assert.equal(walletProjectionDefinition.schema.parse(view), view);
  assert.throws(() => walletProjectionDefinition.schema.parse(null));
});

// ── balance normalization ─────────────────────────────────────────────────

test("normalizeBalancePayload parses string amounts and currencies", () => {
  assert.deepEqual(normalizeBalancePayload({
    is_available: true,
    balance_infos: [
      { currency: "CNY", total_balance: "3.87", granted_balance: "0.00", topped_up_balance: "3.87" },
      { currency: "USD", total_balance: "0.10", granted_balance: 0, topped_up_balance: "0.10" },
    ],
  }), {
    isAvailable: true,
    infos: [
      { currency: "CNY", totalBalance: 3.87, grantedBalance: 0, toppedUpBalance: 3.87 },
      { currency: "USD", totalBalance: 0.1, grantedBalance: 0, toppedUpBalance: 0.1 },
    ],
  });
});

test("normalizeBalancePayload rejects malformed payloads", () => {
  assert.equal(normalizeBalancePayload(null), null);
  assert.equal(normalizeBalancePayload({ is_available: true, balance_infos: [] }), null);
  assert.equal(normalizeBalancePayload({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: "x" }] }), null);
});

test("maskApiKey keeps only the prefix and final four characters", () => {
  assert.equal(maskApiKey("sk-1234567890abcd"), "sk-****abcd");
  assert.equal(maskApiKey("abc"), "****");
  assert.equal(maskApiKey(""), "");
});

test("isOfficialBaseURL checks origin only", () => {
  assert.equal(isOfficialBaseURL("https://api.deepseek.com"), true);
  assert.equal(isOfficialBaseURL("https://api.deepseek.com/v1"), true);
  assert.equal(isOfficialBaseURL("https://gateway.example.com"), false);
  assert.equal(isOfficialBaseURL("not a url"), false);
});

// ── route facts ───────────────────────────────────────────────────────────

function fakeCtx(overrides = {}) {
  return {
    llm: {
      listConfigurableProviders: () => [
        { provider: "deepseek-official", displayName: "DeepSeek", settingsNs: "llm-deepseek", settingsPath: [] },
      ],
      listProviders: () => [{ id: "deepseek-official", name: "DeepSeek" }],
      ...overrides.llm,
    },
    settings: {
      describe: () => [{
        ns: "llm-deepseek",
        value: { apiKeyEnv: "DEEPSEEK_API_KEY", baseURL: null },
      }],
      ...overrides.settings,
    },
    credentials: {
      resolve: async () => ({ value: "sk-1234567890abcd", source: "file" }),
      describe: async () => ({ configured: true, source: "file", writable: true }),
      ...overrides.credentials,
    },
  };
}

test("collectRouteFacts resolves official route and masks key", async () => {
  const facts = await collectRouteFacts(fakeCtx());
  assert.equal(facts.kind, "ok");
  assert.equal(facts.route.provider, "deepseek-official");
  assert.equal(facts.route.apiKeyEnv, "DEEPSEEK_API_KEY");
  assert.equal(facts.key.masked, "sk-****abcd");
  assert.equal(facts.apiKey, "sk-1234567890abcd");
});

test("collectRouteFacts reports missing key", async () => {
  const facts = await collectRouteFacts(fakeCtx({ credentials: { resolve: async () => undefined, describe: async () => ({ configured: false, writable: true }) } }));
  assert.equal(facts.kind, "missing-key");
  assert.equal(facts.key.configured, false);
});

test("collectRouteFacts rejects a non-official baseURL before resolving the key", async () => {
  const facts = await collectRouteFacts(fakeCtx({
    settings: { describe: () => [{ ns: "llm-deepseek", value: { apiKeyEnv: "DEEPSEEK_API_KEY", baseURL: "https://internal.example.com/v1" } }] },
  }));
  assert.equal(facts.kind, "unsupported-base-url");
  assert.equal(facts.key, undefined);
});

test("collectRouteFacts reports route unavailable", async () => {
  const facts = await collectRouteFacts(fakeCtx({ llm: { listConfigurableProviders: () => [], listProviders: () => [] } }));
  assert.equal(facts.kind, "error");
  assert.equal(facts.code, "route-unavailable");
});

// ── apply / route wiring ──────────────────────────────────────────────────

function routeCaptor(ctx) {
  const routes = [];
  const projections = [];
  ctx.effect = (fn) => {
    fn();
    return () => {};
  };
  ctx.webServer = {
    register: (route) => {
      routes.push(route);
      return () => {};
    },
  };
  ctx.sessionProjections = {
    register: (definition) => {
      projections.push(definition);
      return () => {};
    },
  };
  ctx.logger = { warn() {}, error() {} };
  return { routes, projections };
}

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    writableEnded: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(payload) {
      this.writableEnded = true;
      this.body = payload;
    },
  };
  return res;
}

test("apply registers projection and balance route; route redacts apiKey", async () => {
  const oldHome = process.env.DSH_HOME;
  const testHome = mkdtempSync(join(tmpdir(), "dsh-wallet-test-"));
  process.env.DSH_HOME = testHome;
  try {
    const ctx = fakeCtx({ credentials: { resolve: async () => undefined, describe: async () => ({ configured: false, writable: true }) } });
    const captor = routeCaptor(ctx);
    apply(ctx);
    assert.equal(captor.projections.length, 1);
    assert.equal(captor.projections[0].key, PROJECTION_KEY);
    assert.equal(captor.routes.length, 3);
    assert.equal(captor.routes[0].path, "/dsh-plugin-wallet/config");
    assert.equal(captor.routes[1].path, "/dsh-plugin-wallet/balance");
    assert.equal(captor.routes[2].path, "/dsh-plugin-wallet/session-costs");

    const configRes = fakeRes();
    await captor.routes[0].handler({ method: "GET", url: "/dsh-plugin-wallet/config" }, configRes);
    assert.equal(configRes.statusCode, 200);
    const configPayload = JSON.parse(configRes.body);
    assert.equal(configPayload.ok, true);
    assert.equal(configPayload.data.threshold, 10);

    const configPost = fakeRes();
    const configReq = {
      method: "POST",
      url: "/dsh-plugin-wallet/config",
      [Symbol.asyncIterator]: async function* () {
        yield JSON.stringify({ threshold: 12 });
      },
    };
    await captor.routes[0].handler(configReq, configPost);
    assert.equal(configPost.statusCode, 200);
    const configSaved = JSON.parse(configPost.body);
    assert.equal(configSaved.data.threshold, 12);

    const res = fakeRes();
    await captor.routes[1].handler({ method: "GET", url: "/dsh-plugin-wallet/balance" }, res);
    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.status, "missing-key");
    assert.equal(payload.data.key.masked, "");
    assert.equal(JSON.stringify(payload).includes("sk-"), false);

    const post = fakeRes();
    await captor.routes[1].handler({ method: "POST", url: "/dsh-plugin-wallet/balance" }, post);
    assert.equal(post.statusCode, 405);

    const costs = fakeRes();
    await captor.routes[2].handler({ method: "GET", url: "/dsh-plugin-wallet/session-costs" }, costs);
    assert.equal(costs.statusCode, 200);
    const costPayload = JSON.parse(costs.body);
    assert.equal(costPayload.ok, true);
    assert.deepEqual(costPayload.data.rows, []);

    const costPost = fakeRes();
    await captor.routes[2].handler({ method: "POST", url: "/dsh-plugin-wallet/session-costs" }, costPost);
    assert.equal(costPost.statusCode, 405);
  } finally {
    process.env.DSH_HOME = oldHome;
    rmSync(testHome, { recursive: true, force: true });
  }
});

test("collectSessionCostRows includes persisted sessions through the cold cache", async () => {
  let state = walletProjectionDefinition.init();
  state = applyWalletProjectionEvent(state, headerEvent("deepseek-official", "deepseek-v4-flash"));
  state = applyWalletProjectionEvent(state, usageEvent(1, 1, PRICE_EFFECTIVE_AT_MS - 1, { inputTokens: 1_000_000, outputTokens: 0 }));
  const view = viewWalletProjection(state);
  const ctx = {
    sessionQuery: {
      listSessions: async () => [{ header: { id: "s1" } }],
    },
    sessionProjectionCache: {
      coldSnapshot: async (id) => {
        assert.equal(id, "s1");
        return { values: { [PROJECTION_KEY]: view } };
      },
    },
    logger: { warn() {} },
  };
  const rows = await collectSessionCostRows(ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "s1");
  assert.equal(rows[0].cost.totalCostYuan, view.totalCostYuan);
});

test("sessionCostSnapshot falls back to log replay when the cold cache throws", async () => {
  let state = walletProjectionDefinition.init();
  state = applyWalletProjectionEvent(state, headerEvent("deepseek-official", "deepseek-v4-flash"));
  state = applyWalletProjectionEvent(state, usageEvent(1, 1, PRICE_EFFECTIVE_AT_MS - 1, { inputTokens: 1_000_000, outputTokens: 0 }));
  const view = viewWalletProjection(state);
  const ctx = {
    sessions: { get: () => undefined },
    sessionProjectionCache: {
      coldSnapshot: async () => {
        throw new Error("cache unavailable");
      },
    },
    sessionQuery: {
      readSession: async () => ({
        events: [
          headerEvent("deepseek-official", "deepseek-v4-flash"),
          usageEvent(1, 1, PRICE_EFFECTIVE_AT_MS - 1, { inputTokens: 1_000_000, outputTokens: 0 }),
        ],
      }),
    },
    logger: { warn() {} },
  };
  const snapshot = await sessionCostSnapshot(ctx, "s1");
  assert.equal(snapshot.values[PROJECTION_KEY].totalCostYuan, view.totalCostYuan);
});



test("projection state shape stays JSON-serializable", () => {
  let state = walletProjectionDefinition.init();
  state = applyWalletProjectionEvent(state, headerEvent("deepseek-official", "deepseek-v4-pro"));
  state = applyWalletProjectionEvent(state, usageEvent(1, 1, PRICE_EFFECTIVE_AT_MS, { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2 }));
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(state)));
  assert.equal(viewWalletProjection(state).totalCostYuan > 0, true);
});
