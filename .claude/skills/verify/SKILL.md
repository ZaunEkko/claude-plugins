---
name: verify
description: Runtime verification recipe for commit-commands hooks and attribution wrapper changes.
---

# Verify `commit-commands`

Use an isolated temporary Git repository. Do not change user plugin settings, contact a remote, or run Agent/Workflow.

1. Establish the uncommitted or branch diff with `git diff HEAD --stat`.
2. Drive `scripts/deny-direct-git-commit.mjs` as a CLI by piping real `PreToolUse` JSON to stdin:
   - Playwright `browser_run_code_unsafe` plus `node:child_process` and `git commit` must emit structured `deny` JSON.
   - An attribution-wrapper process call must emit the same denial.
   - Normal browser-only code must exit 0 with no stdout.
   - Missing `tool_input.code` must exit 2 with a useful error.
3. Drive `scripts/commit-with-dynamic-attribution.sh` inside the isolated repository:
   - Create the fixture baseline with `git commit-tree` plus `git update-ref` so the currently loaded Bash guard is not bypassed.
   - Create two SessionStart state files through `capture-session-model.mjs start`.
   - Keep the second state in the environment and pass the first through `--claude-state-file`; the committed message must use the first transcript model.
   - Pass a missing explicit state path; the wrapper must fail before Git and the commit count must not change.
   - Remove session pointers, set `ANTHROPIC_MODEL` plus a settings alias, and run the wrapper again; the commit must use `ANTHROPIC_MODEL`.
4. Capture the hook JSON, wrapper output, final commit messages, exit statuses, and before/after commit counts inline.

Hook configuration changes load only in a new Claude Code session. Directly driving the hook CLI verifies the changed script without modifying the active installation.
