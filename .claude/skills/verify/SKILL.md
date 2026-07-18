---
name: verify
description: Runtime verification recipes for commit-commands hooks and ekko-image-gen CLI behavior.
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

## Verify `ekko-image-gen`

Use the installed user-scope cache that matches the current source version. Keep outputs in an operating-system temporary directory and never expose the user's API key.

1. Establish the diff with `git diff HEAD --stat`.
2. Refresh the local marketplace, update `ekko-image-gen@zaunekko`, and compare the source plugin directory with the installed version cache using `git diff --no-index`.
3. Drive a real scalar-reference edit through the installed CLI. Pass `images` as one string, confirm `mode: "edit"` and `inputCount: 1`, then inspect the generated file with `Read` for reference preservation and the requested visual change.
4. Drive `maxOutputBytes` through the installed CLI with an isolated local mock Images API and an obviously fake environment API key. Return a generated-image URL that streams beyond the limit; capture `image_too_large`, exit code `1`, and a server close event well before the planned byte count.
5. Probe an empty scalar reference (`images: " "`) against an unreachable loopback endpoint. Confirm `invalid_request` occurs before networking instead of silently switching to text generation.
6. Capture CLI JSON, exit statuses, server byte counts, image paths, and visual observations inline.

Do not use real third-party endpoints for failure probes. Do not place credentials in command arguments, fixtures, logs, prompts, or repository content.
