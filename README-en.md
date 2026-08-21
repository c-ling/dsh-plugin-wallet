# dsh-plugin-wallet

A DeepSeek Harness wallet plugin (dual-face DSH plugin): official DeepSeek API balance cards and per-session token cost estimates.

[中文](README.md)

[![dsh-plugin topic](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## Overview

- **Sidebar wallet button**: sits in the action strip above the settings button and matches the
  settings row width, height (42px) and font size. Expanded mode shows "Wallet + balance"; collapsed mode shows
  a round icon with a low-balance status dot and a frosted hover popup with the balance.
- **Wallet modal**: opens from the wallet button as a centered modal with a mask (styled like the
  settings modal), containing:
  - official DeepSeek balance and its "Updated" time (multi-currency);
  - a cost estimate with a `?` tooltip explaining the estimation basis;
  - an all-session cost ranking (session, model, input/output tokens, cache hit, amount).
- **Amount inside the session stats line**: the amount is prepended to the built-in
  stats line as `Amount ≈ ¥3.87 | 1 turn · 68 steps | …` instead of occupying a
  separate bottom row.
- **Settings page (1.0.7)**: when Harness 1.0.7 is running with a settings service mounted, `Settings → Wallet` can configure the low-balance threshold, refresh interval, timeout, and balance endpoint; without a settings service the plugin keeps using the `cordis.patch.yml` entry config.
- Balance is fetched host-side every 5 minutes; the API key never enters the browser bundle.

## Price table

Unit: yuan per million tokens, Beijing time (UTC+8).

| Period | Model | Input (cache hit) | Input (cache miss) | Output |
| --- | --- | ---: | ---: | ---: |
| Before 2026-08-17 00:00 | deepseek-v4-flash | 0.02 | 1.0 | 2.0 |
| Before 2026-08-17 00:00 | deepseek-v4-pro | 0.025 | 3.0 | 6.0 |
| Off-peak | deepseek-v4-flash | 0.05 | 1.5 | 4.5 |
| Peak | deepseek-v4-flash | 0.10 | 3.0 | 9.0 |
| Off-peak | deepseek-v4-pro | 0.15 | 4.5 | 13.5 |
| Peak | deepseek-v4-pro | 0.30 | 9.0 | 27.0 |

Peak hours: 09:00–12:00 and 14:00–18:00; everything else is off-peak.

Formula: `(uncached input + cache write) × miss + cache read × hit + output × out`.

> Amounts are **estimates** replayed from session logs with the built-in price table,
> not an official bill. Forked sessions and subagent sessions are counted independently.

## Install

Install into the web profile from GitHub (requires `pnpm` on `PATH`; otherwise use the
corepack fallback below):

```sh
npx @deepseek-ai/dsh plugin --profile web add "github:c-ling/dsh-plugin-wallet#v1.3.1"
```

Or with an existing `dsh` binary:

```sh
dsh plugin --profile web add "github:c-ling/dsh-plugin-wallet#v1.3.1"
```

When `pnpm` is not on `PATH`:

```sh
cd ~/.dsh/profiles/web
corepack pnpm add "github:c-ling/dsh-plugin-wallet#v1.3.1"
```

> `dsh plugin` forwards its arguments to pnpm and fetches the package from this repo
> (pnpm 9+, `git` required). The warning
> `declares no dsh.bundle — installed as a plain dependency` is expected: this plugin is
> not a profile bundle layer; it is activated by the loader row below.

Then add a loader row to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-plugin-wallet
      name: 'dsh-plugin-wallet'
      config: { threshold: 10, refreshIntervalMs: 300000 }
```

`threshold` is the low-balance threshold in yuan (default 10); `refreshIntervalMs` is the
sidebar badge refresh interval (default 5 minutes).
On Harness 1.0.7 with a settings service mounted, you can also edit these values in
`Settings → Wallet` without touching `cordis.patch.yml`.
If you are developing with a local `link:` install and have not installed
`@deepseek-ai/dsh-settings`, the settings page automatically falls back to
`$DSH_HOME/storages/dsh-plugin-wallet/config.json`.

Restart `dsh web` (client-modules caches package verdicts per process; new packages require a
host restart), then hard-refresh the page. The wallet button appears above the settings button
and the amount appears at the start of the session stats line.

## Verify

```sh
curl -s http://127.0.0.1:3080/plugins/dsh-plugin-wallet/client.js | head -c 60
curl -s http://127.0.0.1:3080/dsh-plugin-wallet/balance
```

The first should print a factory bundle starting with `window.__ModuleLoader__.load({`;
the second should print redacted balance data (never the full API key).

## Update

```sh
dsh plugin --profile web add "github:c-ling/dsh-plugin-wallet#v1.3.1"
# or: npx @deepseek-ai/dsh plugin --profile web add "github:c-ling/dsh-plugin-wallet#v1.3.1"
# or: cd ~/.dsh/profiles/web && corepack pnpm add "github:c-ling/dsh-plugin-wallet#v1.3.1"
```

Re-running the install command with the new version pin upgrades the dependency;
the loader row in `cordis.patch.yml` stays unchanged. Restart `dsh web`, then hard-refresh.

## Uninstall

```sh
cd ~/.dsh/profiles/web
corepack pnpm remove dsh-plugin-wallet   # or: dsh plugin --profile web remove dsh-plugin-wallet
```

Also remove the matching `insert` row from `cordis.patch.yml`, then restart `dsh web`.
This plugin keeps only in-memory state; uninstalling fully restores the UI.

## Development

```sh
node --check lib/index.js lib/client.js
node --test
python3 -m json.tool package.json
```

- `lib/index.js`: the host half. Node builtins only; registers
  `GET /dsh-plugin-wallet/balance` and registers the `walletSessionCost` session projection
  through `ctx.sessionProjections` (token buckets in state, money computed on every read).
- `lib/client.js`: a hand-written factory-CJS bundle with no build step; registers UI through
  `sidebar.footer.action`, `shell.overlay`, and `conversation.composer.dock`, with
  `inject: ["slots", "locale", "sessions"]` so apply waits for the slot runtime.
- All copy goes through the locale dictionaries; dark mode consumes only `--dsw-alias-*` tokens.

## Known limitations

- Balance only supports `deepseek-official` with base URL `https://api.deepseek.com`;
  custom gateways are not queried.
- The price table is built into the host code and is not editable in Settings; price changes
  require a release.
- Unknown DeepSeek models are shown as "unpriced models" and excluded from the amount
  (never silently priced as zero).
- Costs are log-replay estimates; fork/subagent/retry effects will not exactly match the bill.
- The wallet button shares `sidebar.footer.action` with the Cordis panel; a `:has()` rule stacks the
  footer actions vertically. If DSH renames `hHd-Xa_footArea` / `hHd-Xa_footerActions`, the button
  degrades to a normal flex row (function remains intact).
- The session hover card exposes no public slot today, so this plugin does not inject an amount
  there; waiting for an upstream slot is recommended.
