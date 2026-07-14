# 故障排查

## Marketplace 无法找到

检查市场是否已注册：

```bash
claude plugin marketplace list --json
```

如果没有 `zaunekko`：

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
```

如果已经存在但目录过期：

```bash
claude plugin marketplace update zaunekko
```

## 插件已安装但命令不可用

检查插件状态和作用域：

```bash
claude plugin list --json
claude plugin details commit-commands@zaunekko
```

在当前会话中执行：

```text
/reload-plugins
```

如果插件包含 monitor 变化或重新加载仍无效，开启新的 Claude Code 会话。

## 出现重复命令或触发描述

通常是官方与 ZaunEkko 的 `commit-commands` 在同一作用域同时启用。保留一个：

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

确认命令使用完整命名空间：

```text
/commit-commands:commit
/commit-commands:commit-push-pr
/commit-commands:clean_gone
```

## Marketplace 更新后插件行为没有变化

`marketplace update` 只刷新市场清单，不会自动替换已安装插件：

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
```

然后运行 `/reload-plugins`。

## Hook 行为异常

- 在 Claude Code 中运行 `/hooks`，检查 hook、事件和来源。
- 阅读目标插件的 `hooks/hooks.json` 与脚本。
- Hook 自动执行并继承 Claude Code 环境；不要运行不可信插件。
- 需要硬性 allow/deny 的策略应使用权限系统，不要只依赖 hook。
- 报告问题时提供脱敏后的事件、退出码和 stderr。

## `commit-commands` 没有写入 Model

解析顺序是：

1. 当前 transcript 的最新有效 assistant `message.model`；
2. SessionStart 捕获的 model；
3. 用户设置中的默认 `model`；
4. 全部不可用时移除 attribution 的 `Model:` 行。

这是 fail-closed 行为，不会写 `unknown`。请确认：

- 使用的是 `commit-commands@zaunekko`；
- 当前会话已重新加载插件；
- commit message 中存在最终 Claude Code marker 后的目标 `Model:` 行；
- 临时目录和 transcript 对当前进程可读；
- 没有同时启用官方插件。

## `clean_gone` 跳过了分支

安全清理只处理配置了缺失 `refs/remotes/...` 上游的分支，并要求提交仍由不会同时删除的本地分支、remote-tracking ref 或 tag 保留。以下状态会显示 `SKIP`：

- `main-worktree` / `current-worktree`：分支仍在主或当前 worktree 中使用；
- `dirty-worktree` / `untracked-worktree`：worktree 含有未提交或未跟踪内容；
- `locked-worktree`：worktree 被显式保护；
- `prunable-worktree`：Git 记录与文件系统状态不一致，需要人工检查；
- `unpreserved-commits`：删除会使部分提交只剩 reflog/对象库可恢复。

该命令不会自动 fetch 或 prune。需要刷新远端状态时，请先单独运行你明确认可的 fetch/prune 操作，再重新执行命令。

如果 apply 报告 digest mismatch，说明确认后 repository state 发生变化。重新运行 `plan` 并确认新计划；不要复用旧 digest。

如果 worktree 已成功移除但分支删除失败，分支仍保留在报告的 OID。检查 `git branch --list` 与 `git worktree list --porcelain` 后重新规划，不要直接使用 `--force` 补删。

## Commit 被拒绝

包装器会保留现有 Git hooks 的失败状态。检查：

```bash
git status
git diff --cached
```

然后单独运行项目要求的 lint/test 或检查 `.git/hooks`。渲染失败、pre-commit 失败或 `git commit` 失败时，插件不会继续 push/PR。

## `commit-push-pr` 无法创建 PR

确认：

```bash
gh --version
gh auth status
git remote -v
git status --branch
```

该命令只有在 commit 成功后才 push，并且只有 push 成功后才调用 `gh pr create`。

## Windows 问题

`commit-commands` 的 wrapper 目标环境是 Claude Code 提供的 Git Bash。不要从原生 CMD 或 PowerShell 直接执行 shell wrapper。仓库通过 `.gitattributes` 固定 shell 与 `.mjs` 文件的 LF 行尾。

## 验证失败

运行：

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
python -m json.tool plugins/commit-commands/.claude-plugin/plugin.json >/dev/null
python -m json.tool plugins/commit-commands/hooks/hooks.json >/dev/null
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
node --test plugins/commit-commands/tests/*.mjs
claude plugin validate .
claude plugin validate plugins/commit-commands --strict
```

`--strict` 会把 warning 视为 error。提交 Issue 时请逐项说明哪些命令成功、失败或跳过。

## 仍需帮助

按照 [SUPPORT.md](../SUPPORT.md) 使用对应 Issue 模板。可利用漏洞请走 [SECURITY.md](../SECURITY.md) 的私密渠道。
