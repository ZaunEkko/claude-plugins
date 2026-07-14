# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 0.2.0 - 2026-07-14

### Added

- Added `commit-commands@zaunekko`, a same-name third-party compatibility distribution derived from Anthropic's official `commit-commands` plugin.
- Added per-session model capture, transcript-first model resolution, byte-preserving attribution rendering, and a fail-closed Git commit wrapper.
- Added optional effort metadata from the active `CLAUDE_EFFORT`, with user settings fallback, as a compact suffix on the `Model:` line.
- Added isolated Node.js tests for hooks, resolver, renderer, Git commits, cleanup, existing Git hook failures, and local-only `commit-push-pr` sequencing.
- Added a deterministic `clean_gone` planner/apply script with SHA-256 state validation, explicit confirmation, exact ref/worktree matching, and safety coverage for dirty, locked, current, and unpreserved branches.
- Added Apache-2.0 licensing and detailed upstream provenance for the entire `plugins/commit-commands/` directory.
- Added a documentation center with installation, plugin authoring, layout, troubleshooting, and `commit-commands` user guides.
- Added Simplified Chinese, English, Traditional Chinese, Japanese, and Korean README navigation plus localized contribution, security, conduct, support, and `commit-commands` documentation.
- Added GitHub Issue forms, a Pull Request template, support and security policies, a Code of Conduct, and an automated validation workflow.

### Changed

- Documented the compatibility-distribution exception to the normal `ekko-<specific-purpose>` naming convention.
- Updated marketplace, layout, contribution, development, and mixed-license documentation.
- Consolidated model and effort metadata into `Model: <model> [effort]` while removing legacy standalone `Effort:` lines.
- Separated the Claude Code attribution marker from the compact `Model:` line with a blank line.
- Reworked the marketplace README in the `codex-plugins` information style while translating commands, scopes, hooks, validation, reload, and trust guidance to current Claude Code behavior.
- Documented in-session `/plugin` installation, copyable Agent-assisted installation, CLI scope control, the distinction between marketplace and installed-plugin updates, and `/reload-plugins`.
- Changed `commit-commands` to `2.0.0` and replaced immediate forced gone-branch cleanup with a plan → explicit confirmation → digest-validated apply protocol.
- Removed `ekko-plugin-scaffold` from the active marketplace catalog while retaining its directory as an explicitly unlisted historical layout example.
- Hardened validation with SHA-pinned GitHub Actions, exact Node.js/Python/Claude Code dependencies, catalog-derived active-plugin checks, Windows cleanup coverage, repository link/YAML/LF/mode checks, and a root `.gitattributes` policy.

### Fixed

- Removed locale-dependent `[gone]` parsing, regular-expression branch matching, whitespace-truncated worktree paths, unconditional `git worktree remove --force`, and branch deletion after worktree-removal failure from `clean_gone`.

- Fixed real Claude Code sessions writing `Model: unknown` when `CLAUDE_ENV_FILE` did not propagate `CLAUDE_COMMIT_COMMANDS_STATE_FILE`; the resolver now derives the isolated state path from `CLAUDE_CODE_SESSION_ID` as a safe fallback.
- Added the user's configured default `model` as the final fallback after transcript and SessionStart resolution; when all sources are unavailable, remove the attribution `Model:` line instead of writing `unknown`.
- Replaced embedded control bytes in the JavaScript validation regexes with explicit Unicode escapes so source files remain plain text.

## 0.1.0 - 2026-07-08

### Added

- Initial Claude Code marketplace scaffold.
- Marketplace catalog at `.claude-plugin/marketplace.json`.
- Temporary installable plugin scaffold named `ekko-plugin-scaffold`.
- Plugin manifest at `plugins/ekko-plugin-scaffold/.claude-plugin/plugin.json`.
- Placeholder directories for future skills, agents, hooks, and scripts under `plugins/ekko-plugin-scaffold/`.
- Marketplace-oriented README, license, privacy status, and contribution notes.
