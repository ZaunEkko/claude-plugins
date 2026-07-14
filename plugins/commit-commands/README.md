# Commit Commands with Dynamic Model Attribution

`commit-commands@zaunekko` is a third-party compatibility distribution derived from Anthropic's official [`commit-commands`](https://github.com/anthropics/claude-plugins-public/tree/main/plugins/commit-commands) plugin.

It keeps the same plugin name, command namespace, command descriptions, and Git workflows. Its enhancements are deterministic replacement of the commit-attribution `Model:` line with the current Claude Code model plus optional effort, and confirmation-gated cleanup of gone branches/worktrees without forced worktree removal.

This distribution is maintained by ZaunEkko, not Anthropic.

For installation and day-to-day usage in multiple languages, see the [`commit-commands` user guide](../../docs/commit-commands/README.md).

## Compatibility model

The official and ZaunEkko distributions intentionally expose the same runtime namespace:

- Official: `commit-commands@claude-plugins-official`
- Dynamic attribution version: `commit-commands@zaunekko`

Enable exactly one. Do not enable both in the same scope because duplicate commands and trigger descriptions are ambiguous.

Example settings selection:

```json
{
  "enabledPlugins": {
    "commit-commands@claude-plugins-official": false,
    "commit-commands@zaunekko": true
  }
}
```

## Commands

The plugin preserves all three official commands:

| Command | Purpose |
|---|---|
| `/commit-commands:commit` | Stage relevant changes and create one commit. |
| `/commit-commands:commit-push-pr` | Commit, push, and create a pull request sequentially. |
| `/commit-commands:clean_gone` | Plan deterministic cleanup, request explicit confirmation, then remove only safe branches with an exact missing `refs/remotes/...` upstream and eligible clean worktrees. |

All three command names are preserved. The commit commands route creation through the shared attribution wrapper, while `clean_gone.md` delegates cleanup to a deterministic planner/executor instead of parsing human-readable Git output.

## Safe gone-branch cleanup

`/commit-commands:clean_gone` now follows a fail-closed protocol:

1. The plugin script enumerates local refs with `git for-each-ref` and worktrees with `git worktree list --porcelain -z`.
2. Only branches whose configured exact `refs/remotes/...` upstream is missing are considered. The command does not fetch, prune, or access the network.
3. The planner prints every `DELETE` and `SKIP` decision plus a SHA-256 digest covering the relevant refs, OIDs, upstreams, worktrees, locks, dirty state, and preservation witnesses.
4. Claude presents that exact plan and asks for explicit confirmation.
5. Apply recomputes the plan and refuses all mutation if the digest or repository state changed.
6. Clean, unlocked, non-current linked worktrees are removed without `--force`; the branch is deleted only after worktree removal succeeds.

The planner skips:

- the main or current worktree;
- dirty or untracked worktrees;
- locked or prunable worktree records;
- branches whose commits are not preserved by a non-candidate local branch, remote-tracking ref, or tag.

Candidate branches do not preserve one another. There is no dirty/locked/unpreserved override mode. Apply stops on the first failure and reports any operation completed before that failure; rerun `plan` after inspection instead of issuing manual follow-up deletion commands.

## Dynamic attribution behavior

Claude Code still generates the complete commit message, including its configured attribution. Immediately before Git creates the commit, the wrapper:

1. writes the complete message from stdin to a private temporary file;
2. resolves the current model from the latest valid assistant record in the current transcript;
3. falls back to the optional SessionStart model, then the user's configured default model;
4. resolves effort from `CLAUDE_EFFORT`, then the user's configured `effort`/`effortLevel`;
5. writes `Model: <model> [effort]` after a blank separator line, removes legacy standalone `Effort:` attribution, or removes `Model:` when no reliable model exists;
6. runs `git commit -F <temporary-file>` only when rendering succeeds;
7. removes the temporary file after success, failure, or interruption.

Example:

```diff
 Generated with [Claude Code](https://claude.ai/code)
+
-Model: Claude Opus 4.8
+Model: gpt-5.6-sol xhigh
 
 Co-Authored-By: Claude <noreply@anthropic.com>
```

Behavioral boundaries:

- If the attribution has no matching `Model:` line, the message remains byte-for-byte unchanged; the plugin does not add one.
- When a target `Model:` line exists, the renderer ensures the final attribution marker is followed by a blank line without duplicating an existing separator.
- A `Model:` line in the commit body before the final Claude Code attribution marker is not modified.
- If transcript and SessionStart do not provide a valid model, the plugin uses the user's configured default `model` with low confidence.
- If none of those sources provides a valid model, the attribution `Model:` line is removed rather than writing `unknown` or retaining a stale value.
- Standard Claude IDs are formatted generically, such as `claude-opus-4-8` → `Claude Opus 4.8`.
- Unknown provider IDs are kept as supplied after single-line safety validation.
- Known effort levels are `low`, `medium`, `high`, `xhigh`, and `max`; an available value is appended to the model on the same line.
- If effort is unavailable, the line contains only the model. Legacy standalone `Effort:` attribution lines are removed.
- LF and CRLF commit messages are both supported.
- Model and effort data are never evaluated as shell code.

## Session state and privacy

A SessionStart hook creates a per-session state file in a private directory under the operating-system temporary directory. When Claude Code exposes `CLAUDE_ENV_FILE`, the hook also exports the exact state path for later Bash calls. If that export is unavailable, the resolver deterministically derives the same SHA-256 state filename from `CLAUDE_CODE_SESSION_ID`. The state contains only:

- the transcript path;
- the optional SessionStart model;
- a capture timestamp.

It does not copy prompts or transcript content. A SessionEnd hook removes the current state, and SessionStart removes stale state files older than seven days.

The resolver reads transcript JSONL from the end and only extracts the latest valid `message.model` from a top-level assistant record. The user's configured settings `model` is used only after transcript and SessionStart resolution fail. `ANTHROPIC_MODEL` remains diagnostic-only and never determines the commit attribution.

Effort is not present as a dedicated field in the observed transcript schema. The plugin therefore uses the active `CLAUDE_EFFORT` value first, then the configured `effort` or `effortLevel`, and appends it to the `Model:` value when available.

## Installation

If Claude Code is already open, use its built-in plugin interface:

```text
/plugin marketplace add ZaunEkko/claude-plugins
/plugin install commit-commands@zaunekko
/reload-plugins
```

For explicit scope control from the CLI:

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
claude plugin install commit-commands@zaunekko --scope user
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

The official and ZaunEkko distributions share a runtime namespace. Disable the official distribution in the same scope before enabling this version; it does not need to be uninstalled.

For local development from this checkout:

```bash
claude plugin marketplace add --scope local "D:/path/to/claude-plugins"
claude plugin install commit-commands@zaunekko --scope local
claude plugin disable commit-commands@claude-plugins-official --scope local
```

Use explicit `--scope local` during testing so existing user-scope marketplace and plugin settings are not changed.

Refreshing the marketplace catalog and updating an installed plugin are separate operations:

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
```

After installing, enabling, disabling, or updating in a running session, use `/reload-plugins`. If Claude Code reports that MCP tool changes would invalidate the prompt cache, use `/reload-plugins --force` only after accepting that cost. Some monitor changes may still require a new session.

## Requirements and platform support

- Claude Code with plugin hooks and `${CLAUDE_PLUGIN_ROOT}` support
- Node.js available as `node` (Claude Code itself supplies a Node-based environment)
- Git
- Bash compatible with Claude Code's Bash tool
- GitHub CLI `gh` only for `/commit-commands:commit-push-pr`

Supported execution environments:

- Linux: system Bash, Node.js, and Git
- macOS: system Bash, Node.js, and Git
- Windows: Claude Code's Git Bash environment; direct wrapper execution from native PowerShell or CMD is not supported

The shell wrapper is pinned to LF line endings through the plugin's `.gitattributes` and recorded as executable in Git.

## Development and testing

Run the isolated automated suite:

```bash
node --test plugins/commit-commands/tests/*.mjs
```

The tests cover safe gone-branch discovery and confirmation, exact refs, paths with spaces/Unicode, dirty/locked/current worktree skips, preservation witnesses, digest mismatches, mutation failures, session isolation, transcript and settings fallback, unavailable-model omission, compact effort formatting, malformed JSONL tails, LF/CRLF byte preservation, renderer failure, temporary-file cleanup, existing pre-commit hook rejection, and the complete `commit-push-pr` order. Remote fixtures use local bare repositories and stubbed tools; tests never contact a real remote or GitHub.

Validate the plugin and marketplace:

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
python -m json.tool plugins/commit-commands/.claude-plugin/plugin.json >/dev/null
python -m json.tool plugins/commit-commands/hooks/hooks.json >/dev/null
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
claude plugin validate .
claude plugin validate plugins/commit-commands --strict
```

## Upstream and license

Current synchronized official marketplace snapshot: `7d0e5f5aae1643db011e905b561fca81776388a6` (copied 2026-07-10).

The copied upstream snapshot and file-level changes are documented in [UPSTREAM.md](UPSTREAM.md).

The entire `plugins/commit-commands/` directory is licensed under the Apache License 2.0 in [LICENSE](LICENSE), including upstream-derived files and ZaunEkko's additions. Modified upstream files carry prominent modification notices where the file format permits them.
