# dsh-plugin-wallet

DeepSeek Harness 钱包插件（DSH 双面插件）：查看 DeepSeek 官方 API 余额，并在会话维度估算 token 消费金额。

[English](README-en.md)

[![dsh-plugin topic](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 简介

- **侧边栏钱包按钮**：位于设置按钮上方的操作条；展开态显示「钱包 + 余额」，收起态显示圆形图标。
  余额低于阈值时显示红色状态点。
- **钱包浮窗**：点击钱包按钮弹出非全屏浮窗，包含：
  - DeepSeek 官方 API 余额（总余额 / 赠送 / 充值，支持多币种展示）；
  - API Key 脱敏尾号与来源（环境变量 / 凭据文件）；
  - 全部会话的成本估算排行（会话、模型、输入 / 输出 token、缓存命中、金额）。
- **会话底部成本行**：紧贴内置 stats 行下方显示
  `≈ ¥3.87 · 缓存命中 89% · 本会话估算`，悬停查看旧价 / 空闲 / 高峰与按模型拆分。
- 余额由宿主（host）每 5 分钟拉取一次；API Key 只在 host 侧使用，不会进入浏览器 bundle。

## 价格表

单位：元 / 百万 tokens，北京时间（UTC+8）。

| 时段 | 模型 | 输入（缓存命中） | 输入（缓存未命中） | 输出 |
| --- | --- | ---: | ---: | ---: |
| 2026-08-17 00:00 前 | deepseek-v4-flash | 0.02 | 1.0 | 2.0 |
| 2026-08-17 00:00 前 | deepseek-v4-pro | 0.025 | 3.0 | 6.0 |
| 空闲时段 | deepseek-v4-flash | 0.05 | 1.5 | 4.5 |
| 高峰时段 | deepseek-v4-flash | 0.10 | 3.0 | 9.0 |
| 空闲时段 | deepseek-v4-pro | 0.15 | 4.5 | 13.5 |
| 高峰时段 | deepseek-v4-pro | 0.30 | 9.0 | 27.0 |

高峰时段：09:00–12:00、14:00–18:00；其余为空闲。

计费公式：`(输入未命中 + 缓存写入) × 未命中价 + 缓存读取 × 命中价 + 输出 × 输出价`。

> 金额按会话日志与内置价格表**估算**，不是官方账单；fork 会话与 subagent 会话各自独立统计。

## 安装

从 GitHub 安装到 web profile（需要 `pnpm` 在 `PATH` 上；没有则用下面的 corepack 方式）：

```sh
npx @deepseek-ai/dsh plugin --profile web add "github:c-ling/dsh-plugin-wallet#v1.0.0"
```

或使用已有的 `dsh` 命令：

```sh
dsh plugin --profile web add "github:c-ling/dsh-plugin-wallet#v1.0.0"
```

pnpm 不在 `PATH` 上时：

```sh
cd ~/.dsh/profiles/web
corepack pnpm add "github:c-ling/dsh-plugin-wallet#v1.0.0"
```

> `dsh plugin` 把参数原样转发给 pnpm，直接从本仓库拉取包（pnpm 9+，本机需装有 `git`）。
> 安装时若看到 `declares no dsh.bundle — installed as a plain dependency` 的提示属正常现象：
> 本插件不是 profile bundle 层，而是通过下面的 loader 行激活。

然后在 `~/.dsh/profiles/web/cordis.patch.yml` 增加一行插入：

```yaml
- insert:
    - id: dsh-plugin-wallet
      name: 'dsh-plugin-wallet'
      config: { threshold: 10, refreshIntervalMs: 300000 }
```

`threshold` 为低余额阈值（人民币，默认 10）；`refreshIntervalMs` 为侧边栏角标的余额刷新周期（默认 5 分钟）。

重启 `dsh web`（client-modules 按进程缓存包裁决，新包必须重启宿主），然后硬刷新页面，
侧边栏设置按钮上方即出现钱包按钮，会话底部 stats 行下方出现成本行。

## 验证

```sh
curl -s http://127.0.0.1:3080/plugins/dsh-plugin-wallet/client.js | head -c 60
curl -s http://127.0.0.1:3080/dsh-plugin-wallet/balance
```

第一条应输出 `window.__ModuleLoader__.load({` 开头的 factory bundle；
第二条应输出脱敏后的余额数据（不包含完整 API Key）。

## 更新

```sh
dsh plugin --profile web add "github:c-ling/dsh-plugin-wallet#v1.0.0"
# 或：npx @deepseek-ai/dsh plugin --profile web add "github:c-ling/dsh-plugin-wallet#v1.0.0"
# 或：cd ~/.dsh/profiles/web && corepack pnpm add "github:c-ling/dsh-plugin-wallet#v1.0.0"
```

用新的版本号重新执行安装命令即可升级依赖；`cordis.patch.yml` 中的 loader 行保持不变。
重启 `dsh web`，然后硬刷新页面。

## 卸载

```sh
cd ~/.dsh/profiles/web
corepack pnpm remove dsh-plugin-wallet   # 或 dsh plugin --profile web remove dsh-plugin-wallet
```

同时删除 `cordis.patch.yml` 中对应的 insert 行，然后重启 `dsh web`。
本插件只使用内存缓存，无持久化数据，卸载后界面完全还原。

## 开发

```sh
node --check lib/index.js lib/client.js
node --test
python3 -m json.tool package.json
```

- `lib/index.js`：host half。仅使用 Node 内置模块；注册
  `GET /dsh-plugin-wallet/balance` 路由，并通过 `ctx.sessionProjections` 注册
  `walletSessionCost` 投影（token 分桶存 state，读取时按价格表计费）。
- `lib/client.js`：手写 factory-CJS bundle，无构建步骤；通过
  `sidebar.footer.action`、`shell.overlay`、`conversation.composer.dock` 三个插槽注册 UI，
  `inject: ["slots", "locale", "sessions"]` 保证 fiber 在插槽就绪后 apply。
- 中英文文案均接入 locale 字典；深色模式只使用 `--dsw-alias-*` 主题变量。

## 已知限制

- 余额仅支持 `deepseek-official` 且 `baseURL` 为 `https://api.deepseek.com`；自定义网关余额不查询。
- 价格表内置于 host 代码，不在设置页编辑；价格调整需要发版。
- 未知 DeepSeek 模型会显示「含无价格模型」，其 token 不计入金额（不会按 0 元假装已计费）。
- 成本是日志重放估算：fork / subagent / retry 导致的差异不会与官方账单完全一致。
- 钱包按钮与 Cordis 面板同属 `sidebar.footer.action`，插件通过一条 `:has()` 规则让脚部操作条纵向排布；
  DSH 升级若调整 `hHd-Xa_footArea` / `hHd-Xa_footerActions` 类名，按钮会退回普通 flex 行内（不影响功能）。
- 会话 hover 浮窗当前没有公开插槽，本插件不注入金额；建议等待上游扩展。
