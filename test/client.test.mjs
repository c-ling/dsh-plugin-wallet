import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");

function loadBundle() {
  let loaded = null;
  const context = {
    console,
    Set,
    Array,
    Object,
    Symbol,
    JSON,
    String,
    Date,
    Promise,
    Math,
    Error,
    fetch: async () => {
      throw new Error("fetch should not run at bundle load");
    },
    setInterval,
    clearInterval,
    document: undefined,
    window: {
      __ModuleLoader__: {
        load(entry) {
          loaded = entry;
        },
      },
    },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "client.js" });
  if (loaded === null) throw new Error("client bundle did not call window.__ModuleLoader__.load");
  const react = {
    useSyncExternalStore(subscribe, getSnapshot) {
      return getSnapshot();
    },
    useEffect() {},
    useLayoutEffect() {},
    useMemo(factory) {
      return factory();
    },
    useRef() {
      return { current: null };
    },
    useState(initial) {
      return [initial, function () {}];
    },
    createElement(type, props, ...children) {
      return { type, props, children };
    },
  };
  const exports = loaded.factory((specifier) => {
    if (specifier === "react") return react;
    throw new Error(`unexpected require ${specifier}`);
  });
  return { id: loaded.id, exports };
}

test("client bundle id and plugin identity match the package name", () => {
  const { id, exports } = loadBundle();
  assert.equal(id, "dsh-plugin-wallet");
  assert.equal(exports.name, "dsh-plugin-wallet");
  assert.deepEqual(Array.from(exports.inject), ["slots", "locale", "sessions"]);
});

test("client zh/en dictionaries have identical key sets", () => {
  const { exports } = loadBundle();
  assert.deepEqual(Object.keys(exports.DICT.zh).sort(), Object.keys(exports.DICT.en).sort());
});

test("client apply registers the three slot contributions with locale namespaces", () => {
  const { exports } = loadBundle();
  const registrations = [];
  const injects = [];
  const ctx = {
    get(name) {
      if (name === "locale") {
        return {
          bind() {
            return (key) => key;
          },
          register() {
            return () => {};
          },
        };
      }
      if (name === "slots") {
        return {
          inject(key, factory) {
            injects.push({ key, factory });
          },
          register(options, component) {
            registrations.push({ options, component });
            return () => {};
          },
        };
      }
      return undefined;
    },
    effect(fn) {
      fn();
      return () => {};
    },
  };
  exports.apply(ctx);

  assert.equal(injects.length, 3);
  for (const { factory } of injects) factory();
  assert.deepEqual(
    registrations.map(({ options }) => options.name),
    ["sidebar.footer.action", "shell.overlay", "conversation.composer.dock"],
  );
  assert.deepEqual(
    registrations.map(({ options }) => options.id),
    ["dsh-plugin-wallet", "dsh-plugin-wallet", "stats"],
  );
  assert.equal(registrations[2].options.priority, -1);
  for (const { options } of registrations) assert.equal(options.locale, "dsh-plugin-wallet");
});

test("client bundle contains DSW theme tokens and no hard-coded panel hex colors", () => {
  assert.match(source, /--dsw-alias-bg-layer-2/);
  assert.match(source, /--dsw-alias-state-error-primary/);
  assert.doesNotMatch(source, /#151517|#2c2c2e|#fff\b/);
});

test("client sidebar row matches the settings trigger geometry and uses preset icons", () => {
  assert.match(source, /\.dsh-wallet-wide\{[^}]*width:calc\(100% \+ 8px\)/);
  assert.match(source, /\.dsh-wallet-wide\{[^}]*font-size:14px;line-height:22px/);
  assert.match(source, /\.dsh-wallet-rail\{[^}]*margin:8px 0 10px/);
  assert.match(source, /IconDataOutline16/);
  assert.match(source, /IconRefreshOutline14/);
  assert.doesNotMatch(source, /background:linear-gradient\(135deg,var\(--dsw-alias-state-business-primary\)/);
});

test("client token formatting no longer appends K to the raw token count", () => {
  assert.match(source, /var k = n \/ 1000/);
  assert.match(source, /String\(roundedK\) \+ "K"/);
  assert.doesNotMatch(source, /String\(Math\.round\(n\)\)\) \+ "K"/);
});

test("client stats line keeps React hook order stable when there are no groups", () => {
  const statsStart = source.indexOf("function StatsLineWithCost");
  assert.ok(statsStart !== -1);
  const statsBody = source.slice(statsStart);
  const earlyReturn = statsBody.indexOf("if (groups.length === 0) return null;");
  const layoutEffect = statsBody.indexOf("React.useLayoutEffect");
  assert.ok(earlyReturn !== -1);
  assert.ok(layoutEffect !== -1);
  assert.ok(earlyReturn > layoutEffect, "early return must come after all hooks in StatsLineWithCost");
});

test("client wallet modal has a mask and cost disclaimer moved into a help tooltip", () => {
  assert.match(source, /\.dsh-wallet-overlay\{[^}]*position:fixed;inset:0/);
  assert.match(source, /\.dsh-wallet-mask\{[^}]*background:var\(--dsw-alias-bg-mask-1\)/);
  assert.match(source, /WalletTooltip/);
  assert.match(source, /IconQuestionOutline14/);
  assert.doesNotMatch(source, /costPriceVersion/);
  assert.doesNotMatch(source, /balanceGranted|balanceToppedUp|balanceKey/);
  assert.match(source, /\.dsh-wallet-table th\.dsh-wallet-num\{text-align:right;\}/);
});
