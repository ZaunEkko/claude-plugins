<div align="center">

# 🧩 Claude Code Plugins

### 個人化 Claude Code 外掛市集

*把順手的 skills、agents、hooks、MCP 設定與相容命令，封裝成可安裝、可驗證、可協作維護的 Claude Code 能力*

[简体中文](../../README.md) · [English](../en/README.md) · [繁體中文](README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md)

[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin_marketplace-D97757?style=flat-square&logo=anthropic&logoColor=white)](https://code.claude.com/docs/en/plugins)
[![Marketplace](https://img.shields.io/badge/marketplace-zaunekko-6f42c1?style=flat-square)](../../.claude-plugin/marketplace.json)
[![License](https://img.shields.io/badge/license-MIT%20%2B%20Apache--2.0-blue?style=flat-square)](#-授權)
[![Status](https://img.shields.io/badge/status-public--release--ready-blue?style=flat-square)](#-這個儲存庫是什麼)

</div>

## ✨ 這個儲存庫是什麼

這是 ZaunEkko 的 Claude Code 外掛市集容器，負責維護市集目錄、可安裝外掛、使用文件、驗證流程與社群協作檔案。Claude Code 會從 [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json) 讀取目錄。

本儲存庫正為公開發布與社群協作做準備。外掛會依公開分發、透明審查與安全貢獻的標準完成實作、驗證與文件化；在發布準備完成前，儲存庫的可見性仍可能受限。市集名稱為 `zaunekko`，GitHub 來源為 `ZaunEkko/claude-plugins`。

## 🧰 收錄範圍

- `skills/<skill-name>/SKILL.md`：新的使用者能力或按需知識。
- `agents/*.md`：可重用的專用子代理。
- `hooks/hooks.json`：生命週期與工具事件自動化。
- `.mcp.json`：外掛 MCP servers。
- `scripts/`：由其他元件呼叫且可測試的實作。
- `commands/*.md`：只用於保留既有上游介面。

原創外掛通常採用 `ekko-<specific-purpose>`。同名例外只用於必須保留上游安裝名與執行時命名空間、且授權允許的相容分發。

## 📦 目前內容

| 外掛 | 狀態 | 說明 | 文件 |
|---|---|---|---|
| `commit-commands` | 可用 · 相容分發 | 保留三個官方命令名稱，並將目前工作階段模型與可用 effort 寫入 Git commit attribution。 | [使用指南](docs/commit-commands/README.md) · [實作與上游說明](../../plugins/commit-commands/README.md) |

`commit-commands` 與官方分發使用相同命名空間；同一 scope 只能啟用其中一個。

## 🚀 快速開始

### 已經開啟 Claude Code

```text
/plugin marketplace add ZaunEkko/claude-plugins
/plugin install commit-commands@zaunekko
/reload-plugins
```

### 讓 Agent 幫你安裝

把以下指令交給 Claude Code Agent：

```text
請幫我安裝這個 Claude Code plugin marketplace：
https://github.com/ZaunEkko/claude-plugins

目標外掛：commit-commands@zaunekko
請先確認 user、project 或 local scope，只修改我選擇的 scope。若同一 scope 已啟用官方 commit-commands，請先說明命名空間衝突，再停用官方版本但不要解除安裝。完成後執行 /reload-plugins，回報實際命令與結果；遇到權限、認證或安全確認時先讓我決定。
```

### CLI 安裝

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
claude plugin install commit-commands@zaunekko --scope user
```

若同一 scope 已啟用官方版本：

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

在執行中的工作階段安裝、啟用、停用或更新後：

```text
/reload-plugins
```

市集更新與已安裝外掛更新是不同操作：

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
```

| Scope | 用途 | 設定檔 |
|---|---|---|
| `user` | 目前使用者的預設安裝 | `~/.claude/settings.json` |
| `project` | 與儲存庫協作者共用 | `.claude/settings.json` |
| `local` | 只在目前儲存庫本機測試 | `.claude/settings.local.json` |

相容分發的本機測試請使用 `--scope local`，避免改動使用者層級設定。

## 🎯 命令

| 命令 | 用途 |
|---|---|
| `/commit-commands:commit` | 檢查變更、暫存相關檔案並建立一個 commit。 |
| `/commit-commands:commit-push-pr` | 依序 commit、push 並建立 Pull Request。 |
| `/commit-commands:clean_gone` | 先產生確定性清理計畫並要求明確確認，再只移除精確 `refs/remotes/...` 上游已不存在的安全分支與符合條件的乾淨 worktree。 |

Attribution 範例：

```text
Generated with [Claude Code](https://claude.ai/code)

Model: gpt-5.6-sol xhigh

Co-Authored-By: Claude <noreply@anthropic.com>
```

無法可靠解析模型時，會移除 `Model:` 行，而不會保留舊值或寫入 `unknown`。

## 📚 文件

- [文件中心](../../docs/README.md)
- [安裝與更新](../../docs/getting-started.md)
- [外掛開發指南](../../docs/plugin-authoring.md)
- [外掛目錄結構](../../docs/plugin-layout.md)
- [故障排除](../../docs/troubleshooting.md)
- [`commit-commands` 使用指南](docs/commit-commands/README.md)
- [貢獻指南](CONTRIBUTING.md)
- [支援與協助](SUPPORT.md)

## 🏗️ 儲存庫結構

```text
.
├── .claude-plugin/marketplace.json
├── .github/
├── docs/
├── i18n/
└── plugins/
    └── commit-commands/
```

每個可安裝外掛都必須在自己的目錄內包含 `.claude-plugin/plugin.json` 與所有元件。

## 🧭 Roadmap

- 持續驗證 `commit-commands` 的跨平台與工作階段解析行為。
- 透過文件化提案、社群審查與驗證流程新增用途明確的外掛。
- 為新外掛補齊多語入口、權限說明與行為測試。
- 持續維護適合公開發布與社群貢獻的版本、更新、回復與安全審查流程。

## 🧪 驗證

```bash
python -m pip install PyYAML==6.0.3
python .github/validate-repository.py
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
node --test plugins/commit-commands/tests/*.mjs
claude plugin validate .
claude plugin validate . --strict
claude plugin validate plugins/commit-commands
claude plugin validate plugins/commit-commands --strict
```

## ⚠️ 信任與安全

Claude Code 外掛與市集是高信任元件，可透過 hooks、scripts 或 MCP servers 以目前使用者權限執行程式碼。

安裝前請檢查 `plugin.json`、`hooks/hooks.json`、`.mcp.json` 與 scripts，使用 `/hooks` 確認目前生效的 hook，並先在 `local` scope 或隔離環境測試。不要在 Issue 或日誌中貼出 token、金鑰、完整 transcript、私人儲存庫內容或敏感路徑。

安全問題請依 [SECURITY.md](SECURITY.md) 私密回報。

## 📄 授權

- 原創內容使用根目錄 [MIT License](../../LICENSE)。
- 整個 [`plugins/commit-commands/`](../../plugins/commit-commands/) 目錄另依其內含的 [Apache License 2.0](../../plugins/commit-commands/LICENSE) 授權。
- 上游來源、雜湊、修改與同步步驟記錄在 [`UPSTREAM.md`](../../plugins/commit-commands/UPSTREAM.md)。

## 🤝 社群

- [Issue 模板](https://github.com/ZaunEkko/claude-plugins/issues/new/choose)
- [貢獻指南](CONTRIBUTING.md)
- [支援與協助](SUPPORT.md)
- [安全政策](SECURITY.md)
- [社群行為規範](CODE_OF_CONDUCT.md)
