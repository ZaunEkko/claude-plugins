# `commit-commands` 利用ガイド

[简体中文](../../../../docs/commit-commands/README.md) · [English](../../../en/docs/commit-commands/README.md) · [繁體中文](../../../zh-TW/docs/commit-commands/README.md) · [日本語](README.md) · [한국어](../../../ko/docs/commit-commands/README.md)

`commit-commands@zaunekko` は Anthropic 公式同名プラグインから派生した第三者互換配布です。インストール名、コマンド名前空間、Git ワークフローを維持し、commit attribution の `Model:` を現在の Claude Code セッションモデルと任意の effort に更新するとともに、Claude Code Bash と既知の Playwright unsafe ローカルプロセス経路が attribution wrapper を迂回することを防ぎます。

ZaunEkko が管理する配布であり、Anthropic 公式リリースではありません。

## インストール

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
claude plugin install commit-commands@zaunekko --scope user
```

同一 scope では一方だけを有効にします：

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

現在のセッションで `/reload-plugins` を実行してください。ローカル検証には `local` scope を使用します。

## コマンド

| コマンド | 用途 |
|---|---|
| `/commit-commands:commit` | 変更確認、関連ファイルの stage、1 commit の作成。 |
| `/commit-commands:commit-push-pr` | commit、push、PR 作成を、前段成功時のみ順番に実行。 |
| `/commit-commands:clean_gone` | plan と明示的な確認の後、正確な `refs/remotes/...` upstream が存在せず、commit が他の ref で保持されているローカルブランチと clean な worktree を安全に削除。 |

Claude Code はカスタム commands を skills として扱いますが、公式インターフェース維持のため `commands/` レイアウトを保持します。

## wrapper を迂回する直接 commit の防止

決定的な `PreToolUse` guard は、Bash 内の直接的な `git commit`、`git.exe commit`、および `git -C <パス> commit` など一般的な Git グローバルオプション形式を拒否します。既知の Playwright `browser_run_code_unsafe` ツール名については、静的に観測可能なローカルプロセス呼び出しを検査し、直接 commit、明示的な no-commit モードのない commit 生成 Git porcelain、attribution wrapper の実行を拒否します。代わりに `/commit-commands:commit`、`/commit-commands:commit-push-pr`、または Claude Code Bash 経由の wrapper を使用してください。

通常のブラウザ自動化、読み取り専用 Git コマンド、明示的な `--no-commit`/`-n`/`--ff-only` の準備処理は引き続き利用できます。この guard は Git hooks をインストールせず、ターミナル、IDE、Git GUI、CI に影響しません。完全な shell、JavaScript、任意の第三者 MCP sandbox ではなく、ワークフロー用の guard rail です。

## gone ブランチの安全なクリーンアップ

`/commit-commands:clean_gone` は `git branch -v` の `[gone]` テキストを解析せず、worktree を強制削除しません。次の手順を使用します：

1. 構造化された Git 出力から完全かつ決定的な plan を生成し、正確な `refs/remotes/...` upstream ref が設定され、その ref が存在しないローカルブランチだけを対象にします。
2. すべての `DELETE`/`SKIP` 項目と `Plan digest: sha256:...` を表示します。
3. ユーザーがその正確な plan を明示的に確認した場合にのみ apply へ進みます。
4. Apply ではすべての状態を再計算します。ref、OID、正確な upstream、worktree の関連付け、current/main worktree の判定、dirty/untracked/locked/prunable 状態、または保持用 ref のいずれかが変化していれば digest が一致せず、何も削除せずに停止します。
5. clean、unlocked、non-prunable で、current でも main でもない worktree だけを `--force` なしで削除します。worktree の削除に成功した後でのみブランチを削除します。

次の場合は常にスキップします：

- current または main worktree；
- tracked または untracked の変更がある worktree；
- locked または prunable な worktree；
- deletion candidate set 外の別のローカルブランチ、既存の remote-tracking ref、または tag によって commit が保持されていないブランチ。候補ブランチ同士は保持元として扱いません。

このコマンドは fetch、prune、ネットワークアクセスを一切行わず、強制 override モードもありません。最初の失敗で停止します。部分的に失敗した後は手動で削除を完了せず、報告された部分完了状態を確認して `plan` を再実行してください。

## Attribution

```text
Generated with [Claude Code](https://claude.ai/code)

Model: <model> [effort]

Co-Authored-By: Claude <noreply@anthropic.com>
```

最後の Claude Code marker 後の attribution を更新し、空行を重複させず 1 行確保します。古い独立 `Effort:` を削除し、LF/CRLF と非対象 byte を保持します。Claude が別の attribution marker を生成した場合、wrapper は render 前に設定済みの `Generated with [Claude Code](https://claude.ai/code)` へ戻します。`Model:` がなければ動的な解決結果を挿入し、marker 自体がなければ完全な標準 attribution block を追加します。信頼できるモデルがない場合、静的な値を捏造しません。

モデルは現在 transcript の最新有効 assistant `message.model`、SessionStart model、現在のプロセスの `ANTHROPIC_MODEL`、設定済み既定 `model` の順で解決し、最後に省略します。通常の Bash 呼び出しは export された pointer または `CLAUDE_CODE_SESSION_ID` で現在の state を特定します。意図的にセッション環境から切り離された呼び出し元は、Git 引数の前に `--claude-state-file <正確なパス>` を渡せます。Wrapper はその private state file だけを使用し、無効なら Git 実行前に失敗し、最新 state を選んで並行セッションを推測しません。Effort は `CLAUDE_EFFORT`、設定の `effort`/`effortLevel` の順です。値は単一行データとして検証され、shell code として実行されません。

## Fail-closed 動作

Wrapper は private temporary message を作成し、attribution を atomic に更新し、render 成功後のみ `git commit -F` を実行します。Git hook failure をそのまま返し、成功・失敗・中断後に一時ファイルを削除します。commit 失敗後の push、push 失敗後の PR 作成は行いません。

自動 `PreToolUse`、SessionStart、SessionEnd hooks と shell wrapper を含みます。インストール前に [`hooks/hooks.json`](../../../../plugins/commit-commands/hooks/hooks.json) と [`scripts/`](../../../../plugins/commit-commands/scripts/) を確認してください。

## 要件と更新

Claude Code plugin/hook、Node.js、Git、Bash が必要です。`/commit-push-pr` には `gh` も必要です。Windows では Claude Code の Git Bash を使用します。

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
```

更新後に `/reload-plugins` を実行します。

## 詳細

- [トラブルシューティング](../../../../docs/troubleshooting.md)
- [実装とテスト](../../../../plugins/commit-commands/README.md)
- [アップストリーム情報](../../../../plugins/commit-commands/UPSTREAM.md)
- [Apache License 2.0](../../../../plugins/commit-commands/LICENSE)
