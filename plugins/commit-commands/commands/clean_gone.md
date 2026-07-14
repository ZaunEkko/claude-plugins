---
allowed-tools: ["Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/clean-gone.mjs:*)", "AskUserQuestion"]
description: Safely clean local branches whose remote-tracking upstream is gone
---

<!-- Modified by ZaunEkko from Anthropic's official commit-commands/commands/clean_gone.md. This distribution replaces human-readable Git parsing and forced deletion with a deterministic plan, explicit confirmation, and state-validated apply step. -->

## Your task

Safely clean local branches whose configured `refs/remotes/...` upstream no longer exists.

1. Run the deterministic planner exactly once:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/clean-gone.mjs" plan
   ```

2. Present the complete planner output to the user, including every `DELETE`/`SKIP` entry and the final `Plan digest: sha256:...` line.

3. If the plan contains no `DELETE` entry, report that no safe cleanup is available and stop. Do not ask for confirmation and do not run `apply`.

4. If the plan contains one or more `DELETE` entries, use `AskUserQuestion` to request explicit confirmation for that exact plan digest. The affirmative option must clearly say that the listed clean worktrees and branches will be removed. Any cancellation, free-form ambiguity, or non-affirmative answer means cancel; do not run `apply`.

5. Only after the user explicitly confirms the exact plan, run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/clean-gone.mjs" apply --expected '<exact sha256 digest from the displayed plan>'
   ```

6. Report the script result exactly. If apply fails, stop without issuing follow-up Git deletion commands. The script may already have completed an earlier listed operation; preserve and report its partial-failure details.

## Safety boundaries

- Do not run `git fetch`, `git remote prune`, or any network command. The plan uses the repository's current remote-tracking refs.
- Do not substitute inline `git branch`, `git worktree`, `grep`, `sed`, or `awk` cleanup commands.
- Do not force-remove dirty or locked worktrees.
- Do not override `SKIP` results. Main/current worktrees, dirty or untracked worktrees, locked/prunable worktrees, and branches with unpreserved commits require manual review outside this command.
- A digest mismatch means repository state changed. Rerun `plan` and request confirmation again; never reuse the previous confirmation.
