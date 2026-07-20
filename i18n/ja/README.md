<div align="center">

# 🧩 Claude Code Plugins

### Claude Code のための汎用プラグインマーケットプレイス

*使いやすい skills、agents、hooks、MCP 設定、互換コマンドを、インストール可能で検証可能な Claude Code 機能として配布します*

[简体中文](../../README.md) · [English](../en/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](README.md) · [한국어](../ko/README.md)

[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin_marketplace-D97757?style=flat-square&logo=anthropic&logoColor=white)](https://code.claude.com/docs/en/plugins)
[![Marketplace](https://img.shields.io/badge/marketplace-zaunekko-6f42c1?style=flat-square)](../../.claude-plugin/marketplace.json)
[![License](https://img.shields.io/badge/license-MIT%20%2B%20Apache--2.0-blue?style=flat-square)](#-ライセンス)
[![Status](https://img.shields.io/badge/status-public--release--ready-blue?style=flat-square)](#-このリポジトリについて)

</div>

## ✨ このリポジトリについて

ZaunEkko が管理する Claude Code プラグインマーケットプレイスです。マーケットプレイスカタログ、インストール可能なプラグイン、利用ドキュメント、検証手順、コミュニティファイルをまとめています。Claude Code は [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json) を読み込みます。

このリポジトリは、公開リリースとコミュニティ協働に向けて準備されています。プラグインは、公開配布、透明なレビュー、安全なコントリビューションを前提として実装・検証・文書化されます。リリース準備が完了するまでは、リポジトリの公開範囲が制限されたままの場合があります。マーケットプレイス名は `zaunekko`、GitHub ソースは `ZaunEkko/claude-plugins` です。

## 🧰 対象コンポーネント

- `skills/<skill-name>/SKILL.md`：新しいユーザー機能やオンデマンド知識。
- `agents/*.md`：再利用可能な専門サブエージェント。
- `hooks/hooks.json`：ライフサイクルおよびツールイベントの自動化。
- `.mcp.json`：プラグイン MCP servers。
- `scripts/`：他コンポーネントから呼ばれるテスト可能な実装。
- `commands/*.md`：既存アップストリームインターフェースの互換性維持専用。

オリジナルプラグインは原則 `ekko-<specific-purpose>` を使用します。同名例外は、許諾されたアップストリームのインストール名と実行時名前空間を維持する必要がある場合に限ります。

## 📦 現在の内容

| プラグイン | 状態 | 説明 | ドキュメント |
|---|---|---|---|
| `commit-commands` | 利用可能・互換配布 | 公式の 3 コマンド名を維持し、現在のセッションモデルと任意の effort を Git commit attribution に書き込み、Claude Code 内の直接 commit による wrapper の迂回を防ぎます。 | [利用ガイド](docs/commit-commands/README.md) · [実装とアップストリーム情報](../../plugins/commit-commands/README.md) |
| `ekko-image-gen` | 利用可能・オリジナル | localhost または外部 HTTPS の OpenAI-compatible Images API を 1 つのコマンドで呼び出し、文生図、貼り付けた参照画像の編集、プロジェクト文脈に沿った保存、制限付きリーフ worker、画像レビュー、クリック可能なローカル出力を提供します。 | [利用ガイド](../../docs/ekko-image-gen/README.md) · [実装](../../plugins/ekko-image-gen/README.md) |

`commit-commands` は公式配布と同じ名前空間を使用します。同一 scope では一方だけを有効にしてください。

## 🚀 クイックスタート

### Claude Code を開いている場合

```text
/plugin marketplace add ZaunEkko/claude-plugins
/plugin install commit-commands@zaunekko
/plugin install ekko-image-gen@zaunekko
/reload-plugins
```

### Agent にインストールを依頼する

次の指示を Claude Code Agent に渡してください：

```text
この Claude Code plugin marketplace の全プラグインをインストールしてください：
https://github.com/ZaunEkko/claude-plugins

user、project、local のどの scope を使うか確認し、選択した scope だけを変更してください。zaunekko marketplace を追加・更新して現在の一覧を読み、全プラグインをインストールして有効化してください。同じ scope で公式 commit-commands が有効なら名前空間競合を説明し、アンインストールせず無効化してください。ekko-image-gen については `~/.claude/ekko-image-gen.local.json` がなければ `baseUrl` とプレースホルダーの `apiKey` だけを含むテンプレートを作成し、実際のキーは会話に貼らずローカルファイルを直接編集するよう案内してください。完了後に /reload-plugins を実行し、実際のコマンド、結果、未入力の設定を報告してください。権限、認証、セキュリティ確認が必要な場合は停止して私に判断を求めてください。
```

### CLI でインストール

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
claude plugin install commit-commands@zaunekko --scope user
claude plugin install ekko-image-gen@zaunekko --scope user
```

同じ scope で公式版が有効な場合：

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

実行中のセッションでインストール、有効化、無効化、更新を行った後：

```text
/reload-plugins
```

マーケットプレイス更新とインストール済みプラグイン更新は別操作です：

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
claude plugin update ekko-image-gen@zaunekko --scope user
```

### `ekko-image-gen` の設定

`~/.claude/ekko-image-gen.local.json`（Windows は `%USERPROFILE%\.claude\ekko-image-gen.local.json`）を作成します：

```json
{
  "baseUrl": "https://your-openai-compatible-service.example/v1",
  "apiKey": "replace-with-local-key"
}
```

endpoint は localhost または外部 HTTPS サービスを使用できます。実際のキーを Git や Agent の会話に貼らないでください。既定モデルと複数画像の短い応答はプラグインが処理します。

| Scope | 用途 | 設定ファイル |
|---|---|---|
| `user` | 現在のユーザーの既定インストール | `~/.claude/settings.json` |
| `project` | リポジトリ共同作業者と共有 | `.claude/settings.json` |
| `local` | 現在のリポジトリだけでローカル検証 | `.claude/settings.local.json` |

互換配布のローカルテストには `--scope local` を使用し、ユーザー設定を自動変更しないでください。

## 🎯 コマンド

| コマンド | 用途 |
|---|---|
| `/commit-commands:commit` | 変更を確認し、関連ファイルを stage して 1 つの commit を作成します。 |
| `/commit-commands:commit-push-pr` | commit、push、Pull Request 作成を順番に実行します。 |
| `/commit-commands:clean_gone` | 決定的なクリーンアップ計画を作成して明示的な確認を求めた後、正確な `refs/remotes/...` upstream が存在しない安全なブランチと条件を満たす clean な worktree だけを削除します。 |
| `/ekko-image-gen:generate` | 設定済みの OpenAI-compatible Images API で画像を生成・編集し、プロジェクト文脈に沿ってローカル出力を保存、確認、報告します。 |

Attribution の例：

```text
Generated with [Claude Code](https://claude.ai/code)

Model: gpt-5.6-sol xhigh

Co-Authored-By: Claude <noreply@anthropic.com>
```

信頼できるモデルが解決できない場合、古い値や `unknown` を残さず `Model:` 行を削除します。

## 📚 ドキュメント

- [ドキュメントセンター](../../docs/README.md)
- [インストールと更新](../../docs/getting-started.md)
- [プラグイン開発ガイド](../../docs/plugin-authoring.md)
- [プラグイン構成](../../docs/plugin-layout.md)
- [トラブルシューティング](../../docs/troubleshooting.md)
- [`commit-commands` 利用ガイド](docs/commit-commands/README.md)
- [コントリビューションガイド](CONTRIBUTING.md)
- [サポート](SUPPORT.md)

## 🏗️ リポジトリ構成

```text
.
├── .claude-plugin/marketplace.json
├── .github/
├── docs/
├── i18n/
└── plugins/
    └── commit-commands/
```

各インストール可能プラグインは、自身のディレクトリ内に `.claude-plugin/plugin.json` とすべてのコンポーネントを保持します。

## 🧭 Roadmap

- `commit-commands` のクロスプラットフォームおよびセッション解析を継続検証します。
- 文書化された提案、コミュニティレビュー、検証を通じて用途の明確なプラグインを追加します。
- 新規プラグインに多言語入口、権限説明、動作テストを追加します。
- 公開リリースとコミュニティからのコントリビューションに対応するバージョン、更新、ロールバック、安全レビューの手順を継続的に整備します。

## 🧪 検証

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

## ⚠️ 信頼と安全

Claude Code のプラグインとマーケットプレイスは高い信頼を必要とします。hooks、scripts、MCP servers は現在のユーザー権限でコードを実行できます。

インストール前に `plugin.json`、`hooks/hooks.json`、`.mcp.json`、scripts を確認し、`/hooks` で有効な hook と出所を確認してください。まず `local` scope または隔離環境でテストし、Issue やログに token、key、完全な transcript、非公開リポジトリ内容、機密パスを投稿しないでください。

脆弱性は [SECURITY.md](SECURITY.md) に従って非公開で報告してください。

## 📄 ライセンス

- オリジナル内容はルートの [MIT License](../../LICENSE) です。
- [`plugins/commit-commands/`](../../plugins/commit-commands/) 全体は同ディレクトリの [Apache License 2.0](../../plugins/commit-commands/LICENSE) です。
- アップストリームの出所、ハッシュ、変更、同期手順は [`UPSTREAM.md`](../../plugins/commit-commands/UPSTREAM.md) に記録されています。

## 🤝 コミュニティ

- [Issue テンプレート](https://github.com/ZaunEkko/claude-plugins/issues/new/choose)
- [コントリビューションガイド](CONTRIBUTING.md)
- [サポート](SUPPORT.md)
- [セキュリティポリシー](SECURITY.md)
- [行動規範](CODE_OF_CONDUCT.md)
