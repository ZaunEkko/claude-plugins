# 安全政策

[简体中文](../../SECURITY.md) · [English](../en/SECURITY.md) · [繁體中文](SECURITY.md) · [日本語](../ja/SECURITY.md) · [한국어](../ko/SECURITY.md)

## 支援版本

預設開發線與最新發布版本是目前的支援範圍；發布準備期間的最新公開發布準備版也同樣受支援。安全修正優先套用到這些版本；是否回補舊版本取決於影響與可重現性。

## 私密回報漏洞

請使用 GitHub 私密漏洞回報：

https://github.com/ZaunEkko/claude-plugins/security/advisories/new

不要在公開 Issue、Pull Request、討論或 commit message 中揭露可利用細節。

請提供受影響外掛、版本、檔案與 scope，相關 Claude Code、OS、Git、Node.js 版本，最小重現、影響與前提、已脫敏日誌及已知緩解方式。不要附上真實 token、API key、完整 transcript、私人儲存庫內容或第三方個人資料。

## 外掛威脅模型

Claude Code 外掛與市集是高信任元件，可能包含自動 hooks、以使用者權限執行的 scripts、MCP servers、外部網路存取與修改 Git/檔案的 skills。

我們重點處理命令注入、路徑穿越、不安全暫存檔、fail-open commit/push/release、未宣告 hook 副作用、憑證或 transcript 洩漏、marketplace source 逃逸、供應鏈替換、上游來源/授權破壞，以及同名分發同時啟用造成的危險歧義。

## 協調揭露

維護者會盡力確認、評估、修正並協調揭露。請在公開利用細節前保留合理修正時間。

本政策不授權測試不屬於你的系統、帳號或儲存庫，也不允許拒絕服務、資料破壞、持久化、憑證收集、社交工程或保留超過最小重現所需的資料。

## 安裝者建議

只加入可信 marketplace；檢查 `plugin.json`、`hooks/hooks.json`、`.mcp.json` 與 scripts；使用 `/hooks` 查看來源；先在 `--scope local` 與隔離儲存庫測試；同一 scope 只啟用一個同名分發；marketplace 更新後明確更新已安裝外掛並執行 `/reload-plugins`。
