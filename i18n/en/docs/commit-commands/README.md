# `commit-commands` User Guide

[简体中文](../../../../docs/commit-commands/README.md) · [English](README.md) · [繁體中文](../../../zh-TW/docs/commit-commands/README.md) · [日本語](../../../ja/docs/commit-commands/README.md) · [한국어](../../../ko/docs/commit-commands/README.md)

`commit-commands@zaunekko` is a third-party compatibility distribution derived from Anthropic's official plugin of the same name. It preserves the install identity, command namespace, and Git workflow while updating the commit attribution `Model:` line with the current Claude Code session model and optional effort.

This distribution is maintained by ZaunEkko and is not an Anthropic release.

## Install

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
claude plugin install commit-commands@zaunekko --scope user
```

Enable only one distribution per scope:

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

Then run `/reload-plugins` in the current session. Use `local` scope for local testing.

## Commands

| Command | Purpose |
|---|---|
| `/commit-commands:commit` | Inspect changes, stage relevant files, and create one commit. |
| `/commit-commands:commit-push-pr` | Commit, then push, then create a PR only after each prior step succeeds. |
| `/commit-commands:clean_gone` | After planning and explicit confirmation, safely remove local branches whose exact `refs/remotes/...` upstream is missing, plus clean worktrees, only when their commits remain preserved by other refs. |

Claude Code now treats custom commands as skills, but this plugin keeps its `commands/` layout to preserve the official interface.

## Safely clean gone branches

`/commit-commands:clean_gone` no longer parses `[gone]` text from `git branch -v` and never force-removes a worktree. It uses this process:

1. Generate a complete, deterministic plan from structured Git output, considering only local branches configured with an exact `refs/remotes/...` upstream ref that is missing.
2. Display every `DELETE`/`SKIP` entry and `Plan digest: sha256:...`.
3. Enter apply only after the user explicitly confirms that exact plan.
4. Recompute all state during apply. If any ref, OID, exact upstream, worktree association, current/main identity, dirty/untracked/locked/prunable state, or preserving ref changed, the digest mismatches and the command stops before deleting anything.
5. Remove only clean, unlocked, non-prunable worktrees that are neither current nor main, without `--force`. Delete the branch only after its worktree was removed successfully.

The command always skips:

- the current or main worktree;
- worktrees with tracked or untracked changes;
- locked or prunable worktrees;
- a branch whose commit is not preserved by another local branch outside the deletion candidate set, an existing remote-tracking ref, or a tag. Candidate branches do not preserve one another.

The command performs no fetch, prune, or network access, and has no force-override mode. It stops on the first failure. After a partial failure, do not complete deletions manually; inspect the reported partial-completion state and rerun `plan`.

## Attribution

```text
Generated with [Claude Code](https://claude.ai/code)

Model: <model> [effort]

Co-Authored-By: Claude <noreply@anthropic.com>
```

The renderer targets only the `Model:` line after the final Claude Code marker, guarantees one blank separator without duplicating an existing one, removes legacy standalone `Effort:` lines, preserves LF/CRLF and non-target bytes, and removes the model line when no reliable model is available. If the final marker has no target model line, the message remains byte-identical.

Model resolution order:

1. Latest valid assistant `message.model` in the current transcript.
2. Model captured at SessionStart.
3. Configured default `model`.
4. Omit the attribution model line.

Effort resolution order:

1. Active `CLAUDE_EFFORT`.
2. Configured `effort` or `effortLevel`.
3. Write the model only.

Model and effort values are validated as single-line data and are never evaluated as shell code.

## Fail-closed behavior

The wrapper writes a private temporary message, renders attribution atomically, calls `git commit -F` only after rendering succeeds, propagates Git hook failures, removes temporary files after success/failure/interruption, and prevents `commit-push-pr` from pushing after a failed commit or creating a PR after a failed push.

The plugin contains automatic SessionStart/SessionEnd hooks and a shell wrapper. Inspect [`hooks/hooks.json`](../../../../plugins/commit-commands/hooks/hooks.json) and [`scripts/`](../../../../plugins/commit-commands/scripts/) before installing.

## Requirements

- Claude Code plugin and hook support.
- Node.js, Git, and Bash.
- GitHub CLI `gh` for `/commit-push-pr`.
- On Windows, the wrapper runs through Claude Code's Git Bash, not native CMD or PowerShell.

## Update

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
```

Run `/reload-plugins` afterward.

## More information

- [Troubleshooting](../../../../docs/troubleshooting.md)
- [Implementation and tests](../../../../plugins/commit-commands/README.md)
- [Upstream provenance](../../../../plugins/commit-commands/UPSTREAM.md)
- [Apache License 2.0](../../../../plugins/commit-commands/LICENSE)
