# Commit Commands with Dynamic Model Attribution

`commit-commands@zaunekko` is a third-party compatibility distribution derived from Anthropic's official [`commit-commands`](https://github.com/anthropics/claude-plugins-public/tree/main/plugins/commit-commands) plugin.

It keeps the same plugin name, command namespace, command descriptions, and Git workflows. Its only product-level enhancement is deterministic replacement of an existing commit-attribution `Model:` line with the model recorded for the current Claude Code session.

This distribution is maintained by ZaunEkko, not Anthropic.

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
| `/commit-commands:clean_gone` | Remove local branches marked `[gone]` and associated worktrees. |

`clean_gone.md` is copied unchanged. The two commit commands are minimally modified to route commit creation through the plugin's wrapper instead of calling `git commit` directly.

## Dynamic attribution behavior

Claude Code still generates the complete commit message, including its configured attribution. Immediately before Git creates the commit, the wrapper:

1. writes the complete message from stdin to a private temporary file;
2. resolves the current model from the latest valid assistant record in the current transcript;
3. falls back to the optional SessionStart model, then to `unknown`;
4. replaces the final `Model:` line after the final exact Claude Code attribution marker;
5. runs `git commit -F <temporary-file>` only when rendering succeeds;
6. removes the temporary file after success, failure, or interruption.

Example:

```diff
 Generated with [Claude Code](https://claude.ai/code)
-Model: Claude Opus 4.8
+Model: gpt-5.6-sol
 
 Co-Authored-By: Claude <noreply@anthropic.com>
```

Behavioral boundaries:

- If the attribution has no matching `Model:` line, the message remains byte-for-byte unchanged; the plugin does not add one.
- A `Model:` line in the commit body before the final Claude Code attribution marker is not modified.
- If neither transcript nor SessionStart provides a valid model, the plugin writes `Model: unknown` and prints a warning.
- Standard Claude IDs are formatted generically, such as `claude-opus-4-8` → `Claude Opus 4.8`.
- Unknown provider IDs are kept as supplied after single-line safety validation.
- LF and CRLF commit messages are both supported.
- Model data is never evaluated as shell code.

## Session state and privacy

A SessionStart hook creates a per-session state file in a private directory under the operating-system temporary directory and exports its path through `CLAUDE_ENV_FILE`. The state contains only:

- the transcript path;
- the optional SessionStart model;
- a capture timestamp.

It does not copy prompts or transcript content. A SessionEnd hook removes the current state, and SessionStart removes stale state files older than seven days.

The resolver reads transcript JSONL from the end and only extracts the latest valid `message.model` from a top-level assistant record. `ANTHROPIC_MODEL` and the configured settings model are diagnostic-only and never determine the commit attribution.

## Installation

Add or refresh the `zaunekko` marketplace, then install this distribution:

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin install commit-commands@zaunekko
```

Disable or uninstall `commit-commands@claude-plugins-official` before enabling this version. Plugin and hook changes load in a new Claude Code session.

For local development from this checkout:

```bash
claude plugin marketplace add --scope local "D:/project/coding/project/github/claude-plugins"
claude plugin install --scope local commit-commands@zaunekko
claude plugin disable --scope local commit-commands@claude-plugins-official
```

Use explicit `--scope local` during testing so existing user-scope marketplace and plugin settings are not changed.

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

The tests cover session isolation, transcript fallback, malformed JSONL tails, model formatting and injection rejection, LF/CRLF byte preservation, renderer failure, temporary-file cleanup, successful commits, and existing pre-commit hook rejection. Git behavior tests use temporary local repositories and do not contact a real remote or GitHub.

Validate the plugin and marketplace:

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
python -m json.tool plugins/commit-commands/.claude-plugin/plugin.json >/dev/null
python -m json.tool plugins/commit-commands/hooks/hooks.json >/dev/null
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
claude plugin validate .
claude plugin validate --strict plugins/commit-commands
```

## Upstream and license

Current synchronized official marketplace snapshot: `7d0e5f5aae1643db011e905b561fca81776388a6` (copied 2026-07-10).

The copied upstream snapshot and file-level changes are documented in [UPSTREAM.md](UPSTREAM.md).

The entire `plugins/commit-commands/` directory is licensed under the Apache License 2.0 in [LICENSE](LICENSE), including upstream-derived files and ZaunEkko's additions. Modified upstream files carry prominent modification notices where the file format permits them.
