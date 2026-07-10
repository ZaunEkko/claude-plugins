---
allowed-tools: ["Bash(git add:*)", "Bash(git status:*)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/commit-with-dynamic-attribution.sh:*)"]
description: Create a git commit
---

<!-- Modified by ZaunEkko from Anthropic's official commit-commands/commands/commit.md. This distribution routes commit creation through a dynamic model-attribution wrapper. -->

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

Based on the above changes, create a single git commit.

1. Stage the relevant changes with `git add`.
2. Draft the complete commit message, including the Git attribution required by the active Claude Code instructions.
3. Choose a unique heredoc delimiter and verify that it does not appear as a standalone line in the commit message.
4. After staging succeeds, invoke the plugin wrapper in one Bash tool call. Pass the complete message on stdin through a single-quoted heredoc:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/commit-with-dynamic-attribution.sh" <<'__CLAUDE_COMMIT_UNIQUE_DELIMITER__'
   <complete commit message>
   __CLAUDE_COMMIT_UNIQUE_DELIMITER__
   ```

Do not call `git commit` directly. The wrapper deterministically replaces the existing attribution `Model:` line after the Claude Code attribution marker, then executes `git commit -F`. If rendering fails, do not attempt another commit path.

Use only the allowed Bash tools and do not send explanatory text outside the required tool calls.
