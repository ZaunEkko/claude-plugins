# コントリビューションガイド

[简体中文](../../CONTRIBUTING.md) · [English](../en/CONTRIBUTING.md) · [繁體中文](../zh-TW/CONTRIBUTING.md) · [日本語](CONTRIBUTING.md) · [한국어](../ko/CONTRIBUTING.md)

`zaunekko` Claude Code プラグインマーケットプレイスへの貢献を歓迎します。バグ修正、テスト、文書、翻訳、コミュニティテンプレート、命名と安全要件を満たす新規プラグインが対象です。

## 開始前

- [README](README.md)、[`CLAUDE.md`](../../CLAUDE.md)、対象プラグインの文書を読みます。
- [行動規範](CODE_OF_CONDUCT.md) に従います。
- セキュリティ問題は [SECURITY.md](SECURITY.md) に従い非公開で報告します。
- API key、token、完全な transcript、ユーザー設定、非公開パス、認証情報を commit しないでください。

## Git Flow

- `main`：安定版またはリリース準備済み。
- `develop`：日常の統合ブランチ。
- `feature/<purpose>`：`develop` から作成し `develop` へマージ。
- `release/<version-or-purpose>`：`develop` から `main` へのリリース準備。
- `hotfix/<purpose>`：`main` ベースの緊急修正専用。

## プラグインへの貢献

オリジナルプラグインは `ekko-<specific-purpose>` を使用します。新機能は `skills/<name>/SKILL.md` を優先し、`commands/` は既存アップストリーム互換インターフェースに限定します。agents、hooks、`.mcp.json`、scripts、テスト、文書は対象プラグイン内に置いてください。

同名互換配布はディレクトリライセンスを保持し、source commit、hash、コピー/変更ファイル、同期手順、名前空間競合、ローカル追加を記録する必要があります。現在の例外は `plugins/commit-commands/` のみです。

## 文書と翻訳

ユーザー向け変更ではルート README、利用ガイド、`CHANGELOG.md`、対象翻訳を更新します。コマンド、パス、プラグイン名、バージョン、安全要件は全言語で一致させ、コード識別子は翻訳しません。

## 検証

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
claude plugin validate .
```

`commit-commands` を変更した場合：

```bash
python -m json.tool plugins/commit-commands/.claude-plugin/plugin.json >/dev/null
python -m json.tool plugins/commit-commands/hooks/hooks.json >/dev/null
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
node --test plugins/commit-commands/tests/*.mjs
claude plugin validate plugins/commit-commands --strict
```

ローカルインストールは `--scope local`、実行中セッションでは `/reload-plugins` を使用します。自動検証で user scope を変更しないでください。

## Pull Request

ユーザーへの影響、対象プラグイン/コンポーネント、実行した検証と結果、権限や信頼境界の変更、文書/翻訳状況、アップストリームやライセンス変更を記載してください。未実施または失敗した確認も明記します。

## ライセンス

オリジナル内容はルート MIT License、`plugins/commit-commands/` 内の貢献は同ディレクトリの Apache-2.0 License で提供されます。
