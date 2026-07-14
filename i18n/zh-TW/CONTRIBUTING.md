# 貢獻指南

[简体中文](../../CONTRIBUTING.md) · [English](../en/CONTRIBUTING.md) · [繁體中文](CONTRIBUTING.md) · [日本語](../ja/CONTRIBUTING.md) · [한국어](../ko/CONTRIBUTING.md)

感謝你改進 `zaunekko` Claude Code 外掛市集。貢獻可以是缺陷修正、測試、文件、翻譯、社群模板，或符合命名與安全要求的新外掛。

## 開始之前

- 閱讀 [README](README.md)、[`CLAUDE.md`](../../CLAUDE.md) 與目標外掛文件。
- 遵守 [社群行為規範](CODE_OF_CONDUCT.md)。
- 安全問題請依 [SECURITY.md](SECURITY.md) 私密回報。
- 不要提交 API key、token、完整 transcript、使用者設定、私人路徑或憑證檔案。

## Git Flow

- `main`：穩定或準備發布。
- `develop`：日常整合。
- `feature/<purpose>`：從 `develop` 建立並合併回 `develop`。
- `release/<version-or-purpose>`：從 `develop` 準備發布到 `main`。
- `hotfix/<purpose>`：只用於基於 `main` 的緊急修正。

## 外掛貢獻

原創外掛使用 `ekko-<specific-purpose>`。新能力優先放在 `skills/<name>/SKILL.md`；`commands/` 僅保留已存在的上游相容介面。所有 agents、hooks、`.mcp.json`、scripts、測試與文件都應放在目標外掛目錄。

同名相容分發必須保留目錄授權，並記錄來源 commit、雜湊、複製與修改檔案、同步程序、命名空間衝突及本地新增內容。`plugins/commit-commands/` 是目前唯一例外。

## 文件與翻譯

使用者可見變更應更新根 README、外掛/使用指南、`CHANGELOG.md` 與受影響翻譯。命令、路徑、外掛名稱、版本與安全要求在各語言中必須一致，不要翻譯程式識別字。

## 驗證

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
claude plugin validate .
```

修改 `commit-commands` 時還要執行：

```bash
python -m json.tool plugins/commit-commands/.claude-plugin/plugin.json >/dev/null
python -m json.tool plugins/commit-commands/hooks/hooks.json >/dev/null
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
node --test plugins/commit-commands/tests/*.mjs
claude plugin validate plugins/commit-commands --strict
```

本機安裝使用明確的 `--scope local`；執行中的工作階段使用 `/reload-plugins`。自動驗證不得修改使用者 scope。

## Pull Request

請說明使用者可見結果、受影響外掛與元件、實際驗證結果、權限或信任邊界變更、文件/翻譯狀態，以及上游或授權變更。未執行或失敗的檢查也要明確列出。

## 授權

原創內容依根目錄 MIT License 提供；`plugins/commit-commands/` 內的貢獻依該目錄 Apache-2.0 License 提供。
