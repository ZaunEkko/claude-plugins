---
allowed-tools: ["Bash(git checkout --branch:*)", "Bash(git add:*)", "Bash(git status:*)", "Bash(git push:*)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/commit-with-dynamic-attribution.sh:*)", "Bash(gh pr create:*)"]
description: Commit, push, and open a PR
---

<!-- Modified by ZaunEkko from Anthropic's official commit-commands/commands/commit-push-pr.md. This distribution routes commit creation through a dynamic model-and-effort attribution wrapper and enforces dependent Git steps sequentially. -->

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`

## Your task

Based on the above changes:

1. Create a new branch if on main.
2. Stage the relevant changes with `git add`.
3. Draft the complete commit message, including the Git attribution required by the active Claude Code instructions.
4. Choose a unique heredoc delimiter and verify that it does not appear as a standalone line in the commit message.
5. After staging succeeds, invoke the plugin wrapper in one Bash tool call. Pass the complete message on stdin through a single-quoted heredoc:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/commit-with-dynamic-attribution.sh" <<'__CLAUDE_COMMIT_UNIQUE_DELIMITER__'
   <complete commit message>
   __CLAUDE_COMMIT_UNIQUE_DELIMITER__
   ```

6. Only after the wrapper reports a successful commit, push the branch to origin.
7. Only after the push succeeds, create a pull request using `gh pr create`.

Do not call `git commit` directly. Do not issue the commit, push, and PR operations as parallel tool calls: each dependent step must wait for the previous result. If rendering or committing fails, stop without pushing or creating a PR.

Use only the allowed Bash tools and do not send explanatory text outside the required tool calls.
