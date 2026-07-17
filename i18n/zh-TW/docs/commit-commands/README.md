# `commit-commands` 使用指南

[简体中文](../../../../docs/commit-commands/README.md) · [English](../../../en/docs/commit-commands/README.md) · [繁體中文](README.md) · [日本語](../../../ja/docs/commit-commands/README.md) · [한국어](../../../ko/docs/commit-commands/README.md)

`commit-commands@zaunekko` 是 Anthropic 官方同名外掛的第三方相容分發。它保留安裝名稱、命令命名空間與 Git 工作流程，把 commit attribution 的 `Model:` 更新為目前 Claude Code 工作階段模型與可用 effort，並阻止 Claude Code 直接執行原生 `git commit` 來繞過 attribution wrapper。

本分發由 ZaunEkko 維護，並非 Anthropic 官方發布。

## 安裝

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
claude plugin install commit-commands@zaunekko --scope user
```

同一 scope 只啟用一個分發：

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

然後在目前工作階段執行 `/reload-plugins`。本機測試請使用 `local` scope。

## 命令

| 命令 | 用途 |
|---|---|
| `/commit-commands:commit` | 檢查變更、暫存相關檔案並建立一個 commit。 |
| `/commit-commands:commit-push-pr` | 前一步成功後才依序 commit、push 與建立 PR。 |
| `/commit-commands:clean_gone` | 在規劃並明確確認後，安全清理精確 `refs/remotes/...` 上游已不存在，且 commit 仍由其他 ref 保留的本機分支與乾淨 worktree。 |

Claude Code 已將自訂 commands 統一為 skills 語意；本外掛保留 `commands/` 只是為了相容官方介面。

## 防止直接 commit 繞過 wrapper

`PreToolUse` Bash guard 會在 Claude Code 執行前拒絕直接的 `git commit`、`git.exe commit`，以及 `git -C <路徑> commit` 等常見 Git 全域參數形式。請改用 `/commit-commands:commit`、`/commit-commands:commit-push-pr` 或外掛 attribution wrapper。

此 guard 只作用於 Claude Code 的 Bash 工具呼叫，不會安裝本機或全域 Git hooks，也不影響終端、IDE、Git GUI 或 CI 的 commit。`status`、`diff`、`log`、`push` 等非 commit Git 命令與 wrapper 的頂層呼叫仍可正常執行。

## 安全清理 gone 分支

`/commit-commands:clean_gone` 不再解析 `git branch -v` 的 `[gone]` 文字，也不會強制移除 worktree。它採用以下流程：

1. 使用結構化 Git 輸出產生完整且具確定性的計畫，只考慮已設定精確 `refs/remotes/...` 上游 ref，而該 ref 已不存在的本機分支。
2. 顯示所有 `DELETE`/`SKIP` 項目與 `Plan digest: sha256:...`。
3. 只有使用者明確確認這份精確計畫後，才會進入 apply。
4. Apply 會重新計算所有狀態。若任何 ref、OID、精確上游、worktree 關聯、目前/主要 worktree 身分、dirty/untracked/locked/prunable 狀態或保留用 ref 已變更，digest 將不符，並在刪除任何內容前停止。
5. 只移除乾淨、未鎖定、不可 prune，且不是目前或主要 worktree 的 worktree，並且不使用 `--force`。只有成功移除 worktree 後才刪除分支。

以下情況一律跳過：

- 目前或主要 worktree；
- 有 tracked 或 untracked 變更的 worktree；
- locked 或 prunable worktree；
- 分支 commit 未由刪除候選集合外的其他本機分支、現存 remote-tracking ref 或 tag 保留。候選分支彼此不構成保留。

命令不會執行 fetch、prune 或任何網路存取，也沒有強制覆寫模式。遇到第一個失敗就會停止。部分失敗後不要手動補做刪除；請檢查回報的部分完成狀態，並重新執行 `plan`。

## Attribution

```text
Generated with [Claude Code](https://claude.ai/code)

Model: <model> [effort]

Co-Authored-By: Claude <noreply@anthropic.com>
```

Renderer 會處理最後一個 Claude Code marker 後的 attribution，確保一行空白分隔但不重複，移除舊的獨立 `Effort:`，並保留 LF/CRLF 與非目標位元組。若 Claude 先產生另一種 attribution marker，wrapper 會在渲染前恢復為設定的 `Generated with [Claude Code](https://claude.ai/code)`。缺少 `Model:` 時會插入動態解析結果；完全沒有 marker 時會追加完整標準 attribution。無可靠模型時不會虛構靜態值。

模型來源依序為目前 transcript 最新有效 assistant `message.model`、SessionStart model、設定的預設 `model`，最後才省略。Effort 依序取 `CLAUDE_EFFORT`、設定的 `effort`/`effortLevel`，不可用時只寫模型。這些值只作為單行資料驗證，不會當成 shell 程式碼執行。

## Fail-closed 行為

Wrapper 先建立私有暫存訊息，原子更新 attribution，只有渲染成功才執行 `git commit -F`，保留 Git hook 失敗狀態，並在成功、失敗或中斷後清理暫存檔。`commit-push-pr` 不會在 commit 失敗後 push，也不會在 push 失敗後建立 PR。

外掛包含自動 `PreToolUse`、SessionStart、SessionEnd hooks 與 shell wrapper。安裝前請檢查 [`hooks/hooks.json`](../../../../plugins/commit-commands/hooks/hooks.json) 與 [`scripts/`](../../../../plugins/commit-commands/scripts/)。

## 需求與更新

需要 Claude Code plugin/hook 支援、Node.js、Git、Bash；`/commit-push-pr` 還需要 `gh`。Windows 由 Claude Code 的 Git Bash 執行 wrapper，不支援原生 CMD/PowerShell。

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
```

更新後執行 `/reload-plugins`。

## 更多資訊

- [故障排除](../../../../docs/troubleshooting.md)
- [實作與測試](../../../../plugins/commit-commands/README.md)
- [上游來源](../../../../plugins/commit-commands/UPSTREAM.md)
- [Apache License 2.0](../../../../plugins/commit-commands/LICENSE)
