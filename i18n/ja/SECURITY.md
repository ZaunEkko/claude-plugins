# セキュリティポリシー

[简体中文](../../SECURITY.md) · [English](../en/SECURITY.md) · [繁體中文](../zh-TW/SECURITY.md) · [日本語](SECURITY.md) · [한국어](../ko/SECURITY.md)

## サポート対象

既定の開発ラインと最新リリースをサポートします。リリース準備中は、最新の公開リリース準備版もサポート対象です。セキュリティ修正はこれらのバージョンを優先し、旧版へのバックポートは影響と再現性に基づいて判断します。

## 脆弱性の非公開報告

GitHub の private vulnerability reporting を使用してください：

https://github.com/ZaunEkko/claude-plugins/security/advisories/new

公開 Issue、Pull Request、Discussion、commit message に悪用可能な詳細を書かないでください。

対象プラグイン、バージョン、ファイル、scope、Claude Code/OS/Git/Node.js のバージョン、最小再現手順、影響と前提、機密情報を除いたログ、緩和策を含めてください。実際の token、API key、完全な transcript、非公開リポジトリ内容、第三者の個人情報は送信しないでください。

## プラグインの脅威モデル

Claude Code のプラグインとマーケットプレイスは高信頼コンポーネントです。自動 hook、ユーザー権限で実行される script、MCP server、外部ネットワークアクセス、Git やファイルを変更する skill を含む場合があります。

特に、command injection、path traversal、安全でない一時ファイル、fail-open の commit/push/release、未宣言の hook 副作用、認証情報や transcript の漏えい、marketplace source の逸脱、supply-chain の置換、アップストリーム provenance/ライセンスの破損、同名配布の同時有効化による危険な曖昧性を重視します。

## 協調開示

メンテナーは合理的な範囲で受領、評価、修正、開示調整を行います。悪用情報の公開前に合理的な修正期間を設けてください。

本ポリシーは、所有していないシステム・アカウント・リポジトリへのテスト、DoS、データ破壊、永続化、認証情報収集、ソーシャルエンジニアリング、最小再現を超えるデータ保持を許可しません。

## インストール時の注意

信頼できる marketplace のみ追加し、`plugin.json`、`hooks/hooks.json`、`.mcp.json`、scripts を確認してください。`/hooks` で出所を確認し、まず `--scope local` と隔離リポジトリでテストします。同一 scope では同名配布を一つだけ有効にし、更新後はインストール済みプラグインを明示的に更新して `/reload-plugins` を実行してください。
