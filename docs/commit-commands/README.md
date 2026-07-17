# `commit-commands` 使用指南

[简体中文](README.md) · [English](../../i18n/en/docs/commit-commands/README.md) · [繁體中文](../../i18n/zh-TW/docs/commit-commands/README.md) · [日本語](../../i18n/ja/docs/commit-commands/README.md) · [한국어](../../i18n/ko/docs/commit-commands/README.md)

`commit-commands@zaunekko` 是 Anthropic 官方同名插件的第三方兼容分发。它保留原有安装名、命令命名空间和 Git 工作流，把 commit attribution 中的 `Model:` 更新为当前 Claude Code 会话模型，可选附加当前或配置的 effort，并阻止 Claude Code 直接执行原生 `git commit` 绕过 attribution wrapper。

本分发由 ZaunEkko 维护，不代表 Anthropic 官方发布。

## 安装

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
claude plugin install commit-commands@zaunekko --scope user
```

官方分发和本分发使用相同命名空间。同一作用域只启用一个：

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

在当前会话中运行：

```text
/reload-plugins
```

本地试用请把上述命令的 scope 改为 `local`。

## 命令

| 命令 | 说明 |
|---|---|
| `/commit-commands:commit` | 检查改动、暂存相关文件并创建一个 commit。 |
| `/commit-commands:commit-push-pr` | commit 成功后 push，push 成功后用 `gh` 创建 PR。 |
| `/commit-commands:clean_gone` | 规划并确认后，安全清理远端跟踪引用已消失且提交仍由其他引用保留的本地分支与干净 worktree。 |

Claude Code 现在把自定义 commands 统一为 skills 语义，但本插件保留 `commands/` 布局以兼容官方接口。

## 防止 Claude Code 绕过 commit wrapper

插件注册了 `PreToolUse` Bash guard。当 Claude Code 尝试直接运行 `git commit`、`git.exe commit`，或 `git -C <路径> commit` 等带常见 Git 全局参数的直接提交命令时，工具调用会在执行前被拒绝，并提示改用：

- `/commit-commands:commit`；
- `/commit-commands:commit-push-pr`；
- 插件的动态 attribution wrapper。

该保护只作用于 Claude Code 的 Bash 工具调用，不安装本地或全局 Git hooks，也不会影响终端、IDE、Git GUI 或 CI 中的人工提交。`git status`、`git diff`、`git log`、`git push` 等非 commit 命令不受影响。插件 wrapper 的顶层调用也不会被拦截。

## 安全清理 gone 分支

`/commit-commands:clean_gone` 不再解析 `git branch -v` 的 `[gone]` 文本，也不会强制移除 worktree。它采用以下流程：

1. 使用结构化 Git 输出生成完整计划，只考虑配置了缺失 `refs/remotes/...` 上游的本地分支。
2. 显示所有 `DELETE`/`SKIP` 条目与 `Plan digest: sha256:...`。
3. 只有用户明确确认这份精确计划后才进入 apply。
4. Apply 重新计算全部状态；ref、OID、上游、worktree、dirty/lock 状态或保留引用发生任何变化时，digest 不匹配并在删除前停止。
5. 只移除干净、未锁定、非当前/主 worktree，且不使用 `--force`。Worktree 成功移除后才删除分支。

以下情况始终跳过：

- 当前或主 worktree；
- 有 tracked 或 untracked 改动的 worktree；
- locked 或 prunable worktree；
- 分支提交没有被其他不会同时删除的本地分支、remote-tracking ref 或 tag 保留。

命令不会执行 fetch、prune 或任何网络访问，也没有强制覆盖模式。失败后不要手工补执行删除；检查脚本报告的部分完成状态并重新运行 `plan`。

## Attribution 输出

目标格式：

```text
Generated with [Claude Code](https://claude.ai/code)

Model: <model> [effort]

Co-Authored-By: Claude <noreply@anthropic.com>
```

示例：

```text
Generated with [Claude Code](https://claude.ai/code)

Model: gpt-5.6-sol xhigh

Co-Authored-By: Claude <noreply@anthropic.com>
```

行为边界：

- 如果 Claude 先生成另一种 attribution marker，wrapper 会在动态写入模型与 effort 前恢复为配置的 `Generated with [Claude Code](https://claude.ai/code)`。
- 只修改最终 Claude Code attribution marker 后的目标 `Model:` 行。
- marker 与 `Model:` 之间保证一行空行，不重复已有分隔。
- effort 追加到同一行；旧的独立 `Effort:` 行会被移除。
- 可靠模型不可用时移除 attribution 的 `Model:` 行。
- marker 后没有目标 `Model:` 行时，插入动态解析的模型与 effort；commit message 完全没有 marker 时，追加完整标准 attribution。可靠模型不可用时不会伪造静态值。
- 保留 LF/CRLF 和其他非目标字节。

## 模型与 effort 来源

模型解析优先级：

1. 当前 transcript 中最新有效 assistant 记录的 `message.model`；
2. SessionStart 捕获的 model；
3. 用户设置中的默认 `model`；
4. 不可用时不写模型。

Effort 解析优先级：

1. 当前 `CLAUDE_EFFORT`；
2. 用户设置中的 `effort` 或 `effortLevel`；
3. 不可用时只写模型。

插件不会执行模型或 effort 字符串，也不会把 prompt 或 transcript 内容复制到状态文件。

## 失败与安全语义

commit wrapper 采用 fail-closed 顺序：

1. 从 stdin 写入私有临时消息文件；
2. 解析并原子更新 attribution；
3. 只有渲染成功才运行 `git commit -F`；
4. commit 失败时返回 Git 的失败状态；
5. 成功、失败或中断后清理临时文件；
6. `commit-push-pr` 不会在 commit 失败后 push，也不会在 push 失败后创建 PR。

插件包含自动运行的 `PreToolUse`、SessionStart、SessionEnd hooks 和 shell wrapper。安装前请检查 [`hooks/hooks.json`](../../plugins/commit-commands/hooks/hooks.json) 与 [`scripts/`](../../plugins/commit-commands/scripts/)。

## 依赖与平台

- Claude Code plugins、hooks 与 `${CLAUDE_PLUGIN_ROOT}` 支持；
- Node.js、Git、Bash；
- `/commit-push-pr` 额外需要 GitHub CLI `gh`；
- Windows 通过 Claude Code 的 Git Bash 运行，不支持从原生 CMD/PowerShell 直接执行 wrapper。

## 更新

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
```

然后运行 `/reload-plugins`。

## 故障排查

- 命令重复：检查是否同时启用了官方与 ZaunEkko 版本。
- 模型行缺失：这通常表示所有可靠来源都不可用，属于预期的 fail-closed 行为。
- commit 被拒绝：检查项目自身 Git hooks、暂存内容与测试。
- PR 创建失败：运行 `gh auth status` 并检查 remote/upstream。
- hook 来源不明：在 Claude Code 中运行 `/hooks`。

更多内容见 [故障排查](../troubleshooting.md)。

## 实现、测试与许可证

完整实现说明、测试命令、上游 snapshot 与许可证边界见：

- [`plugins/commit-commands/README.md`](../../plugins/commit-commands/README.md)
- [`plugins/commit-commands/UPSTREAM.md`](../../plugins/commit-commands/UPSTREAM.md)
- [`plugins/commit-commands/LICENSE`](../../plugins/commit-commands/LICENSE)

整个 `plugins/commit-commands/` 目录使用 Apache License 2.0。
