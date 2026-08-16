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
    useMemo(factory) {
      return factory();
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
    ["dsh-plugin-wallet", "dsh-plugin-wallet", "dsh-plugin-wallet-cost"],
  );
  for (const { options } of registrations) assert.equal(options.locale, "dsh-plugin-wallet");
});

test("client bundle contains DSW theme tokens and no hard-coded panel hex colors", () => {
  assert.match(source, /--dsw-alias-bg-layer-2/);
  assert.match(source, /--dsw-alias-state-error-primary/);
  assert.doesNotMatch(source, /#151517|#2c2c2e|#fff\b/);
});
