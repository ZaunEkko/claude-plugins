# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Added `commit-commands@zaunekko`, a same-name third-party compatibility distribution derived from Anthropic's official `commit-commands` plugin.
- Added per-session model capture, transcript-first model resolution, byte-preserving attribution rendering, and a fail-closed Git commit wrapper.
- Added dynamic `Effort:` attribution from the active `CLAUDE_EFFORT`, with user settings fallback and omission when unavailable.
- Added isolated Node.js tests for hooks, resolver, renderer, Git commits, cleanup, and existing Git hook failures.
- Added Apache-2.0 licensing and detailed upstream provenance for the entire `plugins/commit-commands/` directory.

### Changed

- Documented the compatibility-distribution exception to the normal `ekko-<specific-purpose>` naming convention.
- Updated marketplace, layout, contribution, development, and mixed-license documentation.

### Fixed

- Fixed real Claude Code sessions writing `Model: unknown` when `CLAUDE_ENV_FILE` did not propagate `CLAUDE_COMMIT_COMMANDS_STATE_FILE`; the resolver now derives the isolated state path from `CLAUDE_CODE_SESSION_ID` as a safe fallback.
- Added the user's configured default `model` as the final meaningful fallback after transcript and SessionStart resolution, before writing `unknown`.
- Replaced embedded control bytes in the JavaScript validation regexes with explicit Unicode escapes so source files remain plain text.

## 0.1.0 - 2026-07-08

### Added

- Initial Claude Code marketplace scaffold.
- Marketplace catalog at `.claude-plugin/marketplace.json`.
- Temporary installable plugin scaffold named `ekko-plugin-scaffold`.
- Plugin manifest at `plugins/ekko-plugin-scaffold/.claude-plugin/plugin.json`.
- Placeholder directories for future skills, agents, hooks, and scripts under `plugins/ekko-plugin-scaffold/`.
- Marketplace-oriented README, license, privacy status, and contribution notes.
