# 支援與協助

[简体中文](../../SUPPORT.md) · [English](../en/SUPPORT.md) · [繁體中文](SUPPORT.md) · [日本語](../ja/SUPPORT.md) · [한국어](../ko/SUPPORT.md)

## 先查看文件

- [安裝與更新](../../docs/getting-started.md)
- [故障排除](../../docs/troubleshooting.md)
- [`commit-commands` 使用指南](docs/commit-commands/README.md)
- [Claude Code 外掛文件](https://code.claude.com/docs/en/plugins)

## 提交 Issue

請使用最接近的 [Issue 模板](https://github.com/ZaunEkko/claude-plugins/issues/new/choose)，並提供外掛與版本、來源與 scope、相關 Claude Code/OS/Git/Node.js/`gh` 版本、最小重現、預期與實際行為、已執行檢查及脫敏錯誤。

不要提交 token、API key、完整 transcript、私人儲存庫內容、使用者設定、敏感路徑或個人資料。

## 快速診斷

```bash
claude plugin marketplace list --json
claude plugin list --json
claude plugin details commit-commands@zaunekko
claude plugin validate .
```

在執行中的工作階段安裝或更新後執行 `/reload-plugins`。若官方同名分發也已啟用，請在同一 scope 停用其中一個。

可利用漏洞依 [SECURITY.md](SECURITY.md) 私密回報。維護者可協助本儲存庫外掛與 Claude Code 整合，但無法保證第三方 MCP、GitHub、Git、`gh`、帳號、計費或無關 Claude API 行為。
