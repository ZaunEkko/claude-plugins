# サポート

[简体中文](../../SUPPORT.md) · [English](../en/SUPPORT.md) · [繁體中文](../zh-TW/SUPPORT.md) · [日本語](SUPPORT.md) · [한국어](../ko/SUPPORT.md)

## 最初に文書を確認

- [インストールと更新](../../docs/getting-started.md)
- [トラブルシューティング](../../docs/troubleshooting.md)
- [`commit-commands` 利用ガイド](docs/commit-commands/README.md)
- [Claude Code プラグイン文書](https://code.claude.com/docs/en/plugins)

## Issue の作成

最も近い [Issue テンプレート](https://github.com/ZaunEkko/claude-plugins/issues/new/choose)を使用し、プラグインとバージョン、インストール元と scope、関連する Claude Code/OS/Git/Node.js/`gh` バージョン、最小再現、期待結果と実際結果、実行済み確認、機密情報を除いたエラーを記載してください。

Token、API key、完全な transcript、非公開リポジトリ内容、ユーザー設定、機密パス、個人情報は送信しないでください。

## クイック診断

```bash
claude plugin marketplace list --json
claude plugin list --json
claude plugin details commit-commands@zaunekko
claude plugin validate .
```

実行中セッションでインストールまたは更新した後は `/reload-plugins` を実行します。公式同名配布も有効な場合、同じ scope で一方を無効にしてください。

悪用可能な脆弱性は [SECURITY.md](SECURITY.md) に従い非公開で報告してください。本リポジトリのプラグインと Claude Code 連携は支援できますが、第三者 MCP、GitHub、Git、`gh`、アカウント、課金、無関係な Claude API 動作は保証できません。
