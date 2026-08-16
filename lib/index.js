/**
 * dsh-plugin-wallet host half.
 *
 * Plain Cordis plugin (node builtins only — out-of-tree plugin files resolve
 * their own imports from their real path, not the profile node_modules):
 *
 *   1. Balance route  GET /dsh-plugin-wallet/balance
 *      Resolves the active `deepseek-official` route from the llm directory,
 *      reads its `apiKeyEnv`/`baseURL` out of the `llm-deepseek` settings
 *      namespace, resolves the actual key through `ctx.credentials` (the key
 *      never leaves the host), and fetches `https://api.deepseek.com/user/balance`.
 *      Responses carry only redacted facts. Cached for 60s with single-flight
 *      dedupe; `?refresh=1` bypasses the cache. The client polls every
 *      `refreshIntervalMs` (default 5 minutes) for the sidebar badge.
 *
 *   2. `walletSessionCost` session projection
 *      Folds every committed session event into token buckets by billing
 *      period (legacy / off-peak / peak) and model, then computes an estimate
 *      in yuan on every read. Tokens are stored, money is computed at read
 *      time, so the same log can be re-priced without refolding. Replacement
 *      semantics mirror the built-in `tokenUsage` projection: a newer usage
 *      sample for the same turn/step replaces the previous one.
 *
 * Price table (元 / million tokens, Beijing time):
 *   - before 2026-08-17T00:00+08:00 (legacy):
 *       deepseek-v4-flash  hit 0.02  miss 1.0  out 2.0
 *       deepseek-v4-pro    hit 0.025 miss 3.0  out 6.0
 *   - from 2026-08-17T00:00+08:00:
 *       peak 09:00-12:00, 14:00-18:00; off-peak otherwise.
 *       flash off 0.05/1.5/4.5, peak 0.10/3.0/9.0
 *       pro   off 0.15/4.5/13.5, peak 0.30/9.0/27.0
 *
 * Cost formula: (uncachedInput + cacheWrite) * miss + cacheRead * hit
 * + output * out. `cacheWriteTokens` is absent in older provider usage and
 * then contributes zero. Unknown DeepSeek models are counted but not priced;
 * non-DeepSeek provider usage is counted separately and never priced.
 */

// ── constants ──────────────────────────────────────────────────────────────

export const name = "dsh-plugin-wallet";
export const inject = ["webServer", "credentials", "settings", "llm", "sessionProjections"];

export const PROVIDER = "deepseek-official";
export const SETTINGS_NS = "llm-deepseek";
export const DEFAULT_API_KEY_ENV = "DEEPSEEK_API_KEY";
export const OFFICIAL_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_BALANCE_ENDPOINT = `${OFFICIAL_BASE_URL}/user/balance`;

export const PROJECTION_KEY = "walletSessionCost";

const BALANCE_CACHE_MS = 60_000;
const MAX_BALANCE_BYTES = 64 * 1024;

/** 2026-08-17T00:00:00+08:00, epoch milliseconds. */
export const PRICE_EFFECTIVE_AT_MS = 1_786_896_000_000;

export const PRICE_TABLE = Object.freeze({
  legacy: Object.freeze({
    "deepseek-v4-flash": Object.freeze({ hit: 0.02, miss: 1.0, out: 2.0 }),
    "deepseek-v4-pro": Object.freeze({ hit: 0.025, miss: 3.0, out: 6.0 }),
  }),
  offpeak: Object.freeze({
    "deepseek-v4-flash": Object.freeze({ hit: 0.05, miss: 1.5, out: 4.5 }),
    "deepseek-v4-pro": Object.freeze({ hit: 0.15, miss: 4.5, out: 13.5 }),
  }),
  peak: Object.freeze({
    "deepseek-v4-flash": Object.freeze({ hit: 0.1, miss: 3.0, out: 9.0 }),
    "deepseek-v4-pro": Object.freeze({ hit: 0.3, miss: 9.0, out: 27.0 }),
  }),
});

export const DEFAULT_CONFIG = Object.freeze({
  threshold: 10,
  refreshIntervalMs: 300_000,
  balanceTimeoutMs: 10_000,
  balanceEndpoint: DEFAULT_BALANCE_ENDPOINT,
});

function num(value, fallback, min, max) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function str(value) {
  return typeof value === "string" ? value.slice(0, 1024) : "";
}

/** Merge arbitrary loader config over the defaults. */
export function normalizeConfig(value) {
  const source = typeof value === "object" && value !== null ? value : {};
  return {
    threshold: num(source.threshold, DEFAULT_CONFIG.threshold, 0, 1_000_000),
    refreshIntervalMs: num(source.refreshIntervalMs, DEFAULT_CONFIG.refreshIntervalMs, 30_000, 3_600_000),
    balanceTimeoutMs: num(source.balanceTimeoutMs, DEFAULT_CONFIG.balanceTimeoutMs, 1_000, 120_000),
    balanceEndpoint: str(source.balanceEndpoint) || DEFAULT_CONFIG.balanceEndpoint,
  };
}

// ── pricing / projection math ──────────────────────────────────────────────

/** Classify one usage timestamp into `legacy` | `offpeak` | `peak` (Beijing time). */
export function classifyPricePeriod(timeMs) {
  if (typeof timeMs !== "number" || !Number.isFinite(timeMs) || timeMs < PRICE_EFFECTIVE_AT_MS) return "legacy";
  const beijing = new Date(timeMs + 8 * 60 * 60 * 1000);
  const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes();
  return (minutes >= 540 && minutes < 720) || (minutes >= 840 && minutes < 1080) ? "peak" : "offpeak";
}

export function priceFor(modelId, period) {
  return PRICE_TABLE[period]?.[modelId] ?? null;
}

export function isPricedModel(modelId) {
  return Object.values(PRICE_TABLE).some((period) => Object.hasOwn(period, modelId));
}

export function zeroBuckets() {
  return { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
}

export function usageBuckets(usage) {
  if (typeof usage !== "object" || usage === null) return null;
  const read = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  return {
    uncachedInputTokens: read(usage.inputTokens),
    cacheReadTokens: read(usage.cacheReadTokens),
    cacheWriteTokens: read(usage.cacheWriteTokens),
    outputTokens: read(usage.outputTokens),
  };
}

export function usageFromEvent(event) {
  if (event?.type === "assistant/chunk" && event.data?.chunk?.type === "usage") return event.data.chunk.usage;
  if (event?.type === "assistant/message" && event.data?.usage !== undefined) return event.data.usage;
  return undefined;
}

export function headerModel(event) {
  const config = event?.data?.header?.config;
  const provider = typeof config?.provider === "string" ? config.provider : "";
  const model = typeof config?.model === "string" ? config.model : "";
  return provider === "" || model === "" ? null : { provider, model };
}

export function totalOfBucket(bucket) {
  return bucket.uncachedInputTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens + bucket.outputTokens;
}

export function bucketsEqual(left, right) {
  return left.uncachedInputTokens === right.uncachedInputTokens
    && left.cacheReadTokens === right.cacheReadTokens
    && left.cacheWriteTokens === right.cacheWriteTokens
    && left.outputTokens === right.outputTokens;
}

export function billedInputTokens(bucket) {
  return bucket.uncachedInputTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens;
}

export function costForUsage(bucket, price) {
  const missTokens = bucket.uncachedInputTokens + bucket.cacheWriteTokens;
  const costYuan = (missTokens * price.miss + bucket.cacheReadTokens * price.hit + bucket.outputTokens * price.out) / 1_000_000;
  const cacheSavedYuan = bucket.cacheReadTokens * Math.max(0, price.miss - price.hit) / 1_000_000;
  return { costYuan, cacheSavedYuan };
}

function roundMoney(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function modelPrice(modelId) {
  for (const period of ["legacy", "offpeak", "peak"]) {
    const price = priceFor(modelId, period);
    if (price !== null) return price;
  }
  return null;
}

/** Projection definition for `walletSessionCost`. */
export const walletProjectionDefinition = Object.freeze({
  key: PROJECTION_KEY,
  stateVersion: 1,
  schema: Object.freeze({
    parse(value) {
      if (value === null || typeof value !== "object" || typeof value.totalCostYuan !== "number") {
        throw new Error(`walletSessionCost: invalid projection view (${typeof value})`);
      }
      return value;
    },
  }),
  init: () => ({
    currentModel: null,
    buckets: { legacy: {}, offpeak: {}, peak: {} },
    unknown: zeroBuckets(),
    unsupported: zeroBuckets(),
    last: null,
  }),
  apply: applyWalletProjectionEvent,
  view: viewWalletProjection,
});

function addToBucket(target, bucket) {
  return {
    uncachedInputTokens: target.uncachedInputTokens + bucket.uncachedInputTokens,
    cacheReadTokens: target.cacheReadTokens + bucket.cacheReadTokens,
    cacheWriteTokens: target.cacheWriteTokens + bucket.cacheWriteTokens,
    outputTokens: target.outputTokens + bucket.outputTokens,
  };
}

function subtractBucket(target, bucket) {
  return {
    uncachedInputTokens: Math.max(0, target.uncachedInputTokens - bucket.uncachedInputTokens),
    cacheReadTokens: Math.max(0, target.cacheReadTokens - bucket.cacheReadTokens),
    cacheWriteTokens: Math.max(0, target.cacheWriteTokens - bucket.cacheWriteTokens),
    outputTokens: Math.max(0, target.outputTokens - bucket.outputTokens),
  };
}

function categoryFor(state, eventTime) {
  if (state.currentModel === null) return { category: "unknown", modelKey: "", period: classifyPricePeriod(eventTime) };
  if (state.currentModel.provider !== PROVIDER) return { category: "unsupported", modelKey: "", period: classifyPricePeriod(eventTime) };
  if (!isPricedModel(state.currentModel.model)) return { category: "unknown", modelKey: "", period: classifyPricePeriod(eventTime) };
  return {
    category: "known",
    modelKey: `${state.currentModel.provider}/${state.currentModel.model}`,
    period: classifyPricePeriod(eventTime),
  };
}

/** Apply one committed session event. Exported for deterministic tests. */
export function applyWalletProjectionEvent(state, event) {
  const header = headerModel(event);
  if (header !== null) {
    return state.currentModel?.provider === header.provider && state.currentModel?.model === header.model
      ? state
      : { ...state, currentModel: header };
  }

  const usage = usageFromEvent(event);
  const bucket = usageBuckets(usage);
  if (bucket === null) return state;

  const turn = typeof event?.data?.turn === "number" ? event.data.turn : null;
  const step = typeof event?.data?.step === "number" ? event.data.step : null;
  const placement = categoryFor(state, event?.time);

  if (state.last !== null && turn !== null && state.last.turn === turn && state.last.step === step) {
    if (bucketsEqual(state.last.bucket, bucket)) return state;
    const without = removeLastPlacement(state, state.last);
    return addLastPlacement(without, {
      turn,
      step,
      bucket,
      category: placement.category,
      modelKey: placement.modelKey,
      period: placement.period,
    });
  }

  return addLastPlacement(state, {
    turn,
    step,
    bucket,
    category: placement.category,
    modelKey: placement.modelKey,
    period: placement.period,
  });
}

function removeLastPlacement(state, last) {
  if (last.category === "known") {
    const periodBuckets = state.buckets[last.period];
    const previous = periodBuckets[last.modelKey] ?? zeroBuckets();
    const next = subtractBucket(previous, last.bucket);
    const nextPeriod = { ...periodBuckets };
    if (totalOfBucket(next) === 0) delete nextPeriod[last.modelKey];
    else nextPeriod[last.modelKey] = next;
    return {
      ...state,
      buckets: { ...state.buckets, [last.period]: nextPeriod },
    };
  }
  const targetKey = last.category === "unknown" ? "unknown" : "unsupported";
  return {
    ...state,
    [targetKey]: subtractBucket(state[targetKey], last.bucket),
  };
}

function addLastPlacement(state, last) {
  const next = { ...state, last };
  if (last.category === "known") {
    const periodBuckets = state.buckets[last.period];
    const previous = periodBuckets[last.modelKey] ?? zeroBuckets();
    return {
      ...next,
      buckets: {
        ...state.buckets,
        [last.period]: { ...periodBuckets, [last.modelKey]: addToBucket(previous, last.bucket) },
      },
    };
  }
  const targetKey = last.category === "unknown" ? "unknown" : "unsupported";
  return { ...next, [targetKey]: addToBucket(state[targetKey], last.bucket) };
}

/** Compute the read-time projection view. */
export function viewWalletProjection(state) {
  let total = zeroBuckets();
  const byModel = new Map();
  const byPeriod = [];
  let totalCostYuan = 0;
  let cacheSavedYuan = 0;

  for (const period of ["legacy", "offpeak", "peak"]) {
    const entries = Object.entries(state.buckets[period] ?? {});
    let periodCostYuan = 0;
    let periodTokens = zeroBuckets();
    for (const [modelKey, bucket] of entries) {
      const slash = modelKey.indexOf("/");
      const model = slash === -1 ? modelKey : modelKey.slice(slash + 1);
      const price = priceFor(model, period);
      if (price === null) continue;
      const priced = costForUsage(bucket, price);
      periodCostYuan += priced.costYuan;
      cacheSavedYuan += priced.cacheSavedYuan;
      periodTokens = addToBucket(periodTokens, bucket);
      const existing = byModel.get(modelKey) ?? {
        provider: slash === -1 ? "" : modelKey.slice(0, slash),
        model,
        tokens: zeroBuckets(),
        costYuan: 0,
      };
      existing.tokens = addToBucket(existing.tokens, bucket);
      existing.costYuan += priced.costYuan;
      byModel.set(modelKey, existing);
    }
    if (totalOfBucket(periodTokens) > 0) byPeriod.push({
      period,
      costYuan: roundMoney(periodCostYuan),
      tokens: periodTokens,
    });
    total = addToBucket(total, periodTokens);
    totalCostYuan += periodCostYuan;
  }

  const unknownModelTokens = state.unknown;
  const unsupportedTokens = state.unsupported;
  const allTokens = addToBucket(addToBucket(total, unknownModelTokens), unsupportedTokens);
  const billedInput = billedInputTokens(allTokens);
  const cacheHitPercent = billedInput === 0 ? null : Math.round(allTokens.cacheReadTokens / billedInput * 100);

  return {
    priceVersion: 1,
    priceEffectiveAt: PRICE_EFFECTIVE_AT_MS,
    totalCostYuan: roundMoney(totalCostYuan),
    totalTokens: allTokens,
    cacheHitPercent,
    cacheSavedYuan: roundMoney(cacheSavedYuan),
    byPeriod,
    byModel: [...byModel.values()].sort((a, b) => b.costYuan - a.costYuan).map((entry) => ({
      ...entry,
      costYuan: roundMoney(entry.costYuan),
    })),
    hasUnknownModel: totalOfBucket(unknownModelTokens) > 0,
    unknownModelTokens,
    hasUnsupportedProvider: totalOfBucket(unsupportedTokens) > 0,
    unsupportedTokens,
  };
}

// ── balance route helpers ──────────────────────────────────────────────────

class WalletBalanceError extends Error {
  constructor(code) {
    super(code);
    this.name = "WalletBalanceError";
    this.code = code;
  }
}

export function maskApiKey(value) {
  if (typeof value !== "string" || value.length === 0) return "";
  const tail = value.length <= 4 ? "" : value.slice(-4);
  const head = value.startsWith("sk-") ? "sk-" : "";
  return `${head}****${tail}`;
}

/** Normalize the official `/user/balance` payload; returns null when invalid. */
export function normalizeBalancePayload(payload) {
  if (typeof payload !== "object" || payload === null || typeof payload.is_available !== "boolean") return null;
  if (!Array.isArray(payload.balance_infos) || payload.balance_infos.length === 0) return null;
  const infos = [];
  for (const entry of payload.balance_infos) {
    if (typeof entry !== "object" || entry === null) return null;
    const currency = typeof entry.currency === "string" ? entry.currency.trim().toUpperCase() : "";
    if (currency === "") return null;
    const amount = (field) => {
      const value = entry[field];
      const parsed = typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };
    const totalBalance = amount("total_balance");
    const grantedBalance = amount("granted_balance");
    const toppedUpBalance = amount("topped_up_balance");
    if (totalBalance === null || grantedBalance === null || toppedUpBalance === null) return null;
    infos.push({ currency, totalBalance, grantedBalance, toppedUpBalance });
  }
  return { isAvailable: payload.is_available, infos };
}

export function isOfficialBaseURL(value) {
  try {
    return new URL(value).origin === new URL(OFFICIAL_BASE_URL).origin;
  } catch {
    return false;
  }
}

function balanceErrorCode(error) {
  if (typeof error?.code === "string" && /^[a-z][a-z0-9-]*$/.test(error.code)) return error.code;
  if (error?.name === "AbortError") return "timeout";
  return "network";
}

/**
 * Collect DeepSeek official route facts from live services.
 * `kind === "ok"` carries `apiKey` for host use only — never serialize it.
 */
export async function collectRouteFacts(ctx, config) {
  const llm = ctx?.llm ?? ctx?.get?.("llm");
  const settings = ctx?.settings ?? ctx?.get?.("settings");
  const credentials = ctx?.credentials ?? ctx?.get?.("credentials");
  if (llm === undefined || typeof llm.listProviders !== "function") {
    return { kind: "error", code: "route-unavailable" };
  }

  const directory = typeof llm.listConfigurableProviders === "function" ? llm.listConfigurableProviders() : [];
  const registered = llm.listProviders();
  const directoryEntry = directory.find((entry) => entry.provider === PROVIDER && (entry.settingsNs === SETTINGS_NS || entry.settingsNs === ""));
  const registeredEntry = registered.find((entry) => entry.id === PROVIDER);
  if (directoryEntry === undefined && registeredEntry === undefined) {
    return { kind: "error", code: "route-unavailable" };
  }

  const settingsNs = directoryEntry?.settingsNs || SETTINGS_NS;
  let descriptor;
  try {
    descriptor = settings?.describe?.({ redactSecrets: true }).find((entry) => entry.ns === settingsNs);
  } catch {
    descriptor = undefined;
  }
  const section = typeof descriptor?.value === "object" && descriptor.value !== null ? descriptor.value : {};
  const apiKeyEnv = typeof section.apiKeyEnv === "string" && section.apiKeyEnv !== "" ? section.apiKeyEnv : DEFAULT_API_KEY_ENV;
  const baseURL = typeof section.baseURL === "string" && section.baseURL !== ""
    ? section.baseURL
    : (typeof process.env.DEEPSEEK_BASE_URL === "string" && process.env.DEEPSEEK_BASE_URL !== "" ? process.env.DEEPSEEK_BASE_URL : OFFICIAL_BASE_URL);

  const route = {
    provider: PROVIDER,
    displayName: registeredEntry?.name ?? directoryEntry?.displayName ?? "DeepSeek",
    baseURL,
    apiKeyEnv,
    active: registered.some((entry) => entry.id === PROVIDER),
  };

  if (!isOfficialBaseURL(baseURL)) {
    return { kind: "unsupported-base-url", route };
  }

  let credential;
  let description;
  try {
    credential = credentials === undefined ? undefined : await credentials.resolve(apiKeyEnv);
    description = credentials === undefined ? undefined : await credentials.describe(apiKeyEnv);
  } catch {
    credential = undefined;
    description = undefined;
  }
  const configured = credential !== undefined && typeof credential.value === "string" && credential.value.length > 0;
  if (!configured) {
    return {
      kind: "missing-key",
      route,
      key: {
        configured: false,
        source: description?.source,
        writable: description?.writable ?? true,
        masked: "",
      },
    };
  }

  return {
    kind: "ok",
    route,
    key: {
      configured: true,
      source: description?.source,
      writable: description?.writable ?? true,
      masked: maskApiKey(credential.value),
    },
    apiKey: credential.value,
  };
}

async function requestBalance(endpoint, apiKey, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(endpoint, {
        headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
    } catch (error) {
      throw new WalletBalanceError(balanceErrorCode(error));
    }
    if (response.status === 401) throw new WalletBalanceError("unauthorized");
    if (response.status === 429) throw new WalletBalanceError("rate-limited");
    if (!response.ok) throw new WalletBalanceError("upstream");
    const text = await response.text();
    if (text.length > MAX_BALANCE_BYTES) throw new WalletBalanceError("bad-response");
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new WalletBalanceError("bad-response");
    }
    const normalized = normalizeBalancePayload(payload);
    if (normalized === null) throw new WalletBalanceError("bad-response");
    return normalized;
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res, status, payload) {
  if (res.writableEnded) return;
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

/**
 * Host plugin body.
 * @param ctx - Cordis context carrying webServer/credentials/settings/llm/sessionProjections.
 * @param config - raw loader config, normalized over DEFAULT_CONFIG.
 */
export function apply(ctx, config = {}) {
  const options = normalizeConfig(config);

  if (ctx.sessionProjections?.register !== undefined) {
    ctx.sessionProjections.register(walletProjectionDefinition);
  }

  let cache = null;
  let inflight = null;

  const load = async (force) => {
    if (!force && cache !== null && Date.now() - cache.fetchedAt < BALANCE_CACHE_MS) return cache.data;
    if (inflight !== null) return inflight;
    inflight = (async () => {
      const startedAt = Date.now();
      try {
        const facts = await collectRouteFacts(ctx, options);
        if (facts.kind === "error") throw new WalletBalanceError(facts.code);
        if (facts.kind === "missing-key") {
          return {
            status: "missing-key",
            fetchedAt: startedAt,
            stale: false,
            threshold: options.threshold,
            refreshIntervalMs: options.refreshIntervalMs,
            route: facts.route,
            key: facts.key,
            balance: null,
            error: null,
          };
        }
        if (facts.kind === "unsupported-base-url") {
          return {
            status: "unsupported-base-url",
            fetchedAt: startedAt,
            stale: false,
            threshold: options.threshold,
            refreshIntervalMs: options.refreshIntervalMs,
            route: facts.route,
            key: null,
            balance: null,
            error: null,
          };
        }
        const balance = await requestBalance(options.balanceEndpoint, facts.apiKey, options.balanceTimeoutMs);
        return {
          status: "ok",
          fetchedAt: startedAt,
          stale: false,
          threshold: options.threshold,
          refreshIntervalMs: options.refreshIntervalMs,
          route: facts.route,
          key: facts.key,
          balance,
          error: null,
        };
      } catch (error) {
        ctx.logger?.warn?.(`dsh-plugin-wallet: balance refresh failed: ${String(error?.code ?? error?.message ?? error)}`);
        return {
          status: "error",
          fetchedAt: startedAt,
          stale: cache?.data?.balance != null,
          threshold: options.threshold,
          refreshIntervalMs: options.refreshIntervalMs,
          route: cache?.data?.route ?? null,
          key: cache?.data?.key ?? null,
          balance: cache?.data?.balance ?? null,
          error: { code: typeof error?.code === "string" ? error.code : "internal" },
        };
      }
    })().finally(() => {
      inflight = null;
    });
    cache = { data: await inflight, fetchedAt: Date.now() };
    return cache.data;
  };

  const webServer = ctx.webServer;
  ctx.effect(() => webServer.register({
    kind: "exact",
    path: "/dsh-plugin-wallet/balance",
    handler: async (req, res) => {
      try {
        if (req.method !== "GET") {
          sendJson(res, 405, { ok: false, error: { code: "method-not-allowed" } });
          return;
        }
        const url = new URL(req.url ?? "/", "http://localhost");
        const data = await load(url.searchParams.get("refresh") === "1");
        sendJson(res, 200, { ok: true, data });
      } catch (error) {
        ctx.logger?.error?.(`dsh-plugin-wallet: balance route failed: ${String(error?.message ?? error)}`);
        sendJson(res, 500, { ok: false, error: { code: "internal" } });
      }
    },
  }), "dsh-plugin-wallet: balance route");
}
