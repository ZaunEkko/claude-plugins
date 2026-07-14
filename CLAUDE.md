# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

This repository is a Claude Code plugin marketplace container for ZaunEkko plugins. The marketplace name is `zaunekko`; the GitHub source is `ZaunEkko/claude-plugins`.

The repository is maintained for public distribution with release-ready changes developed and validated before integration. Repository content is MIT by default; the entire upstream-derived `plugins/commit-commands/` directory is separately licensed under its included Apache-2.0 license.

## Architecture

- `.claude-plugin/marketplace.json` is the marketplace catalog. Claude Code reads it when users add this repository as a marketplace.
- `plugins/<plugin-name>/` contains installable plugin directories referenced by the marketplace catalog.
- `plugins/ekko-plugin-scaffold/` is an unlisted historical layout example, not an active marketplace plugin.
- `plugins/commit-commands/` is a documented same-name compatibility distribution derived from Anthropic's official plugin; it uses Apache-2.0 and preserves the upstream command namespace.
- Each installable plugin has its own manifest at `plugins/<plugin-name>/.claude-plugin/plugin.json`.
- Optional plugin components live inside the target plugin directory:
  - `skills/<skill-name>/SKILL.md`
  - `commands/*.md` only for documented legacy/upstream compatibility
  - `agents/*.md`
  - `hooks/hooks.json`
  - `.mcp.json`
  - `scripts/`

## Naming convention

Installable plugins should use:

```text
ekko-<specific-purpose>
```

Use purpose-first names that are clear in `/plugins` without needing the marketplace source. Examples: `ekko-agy-cli`, `ekko-notion-tasks`, `ekko-browser-debug`.

Avoid generic installable plugin names such as `claude-plugins`, `ekko-plugins`, `ekko-skills`, `tools`, or `utils`.

A same-name exception is allowed only for a licensed upstream compatibility distribution whose explicit purpose is to preserve the upstream installation and runtime namespace. Keep its provenance, file hashes, modification notices, synchronization procedure, and directory-specific license documented. `commit-commands` is the current exception.

## Common validation commands

Validate the marketplace catalog and affected plugin manifests:

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
python -m json.tool plugins/ekko-plugin-scaffold/.claude-plugin/plugin.json >/dev/null
python -m json.tool plugins/commit-commands/.claude-plugin/plugin.json >/dev/null
python -m json.tool plugins/commit-commands/hooks/hooks.json >/dev/null
```

Refresh and install from the local marketplace:

```bash
claude plugin marketplace update zaunekko
claude plugin install <plugin-name>@zaunekko
```

When testing a same-name compatibility distribution, use explicit local scope and disable the official distribution only in that same scope. Do not modify user-scope plugin settings during automated validation.

If adding a new plugin, validate its manifest with the same `python -m json.tool plugins/<plugin-name>/.claude-plugin/plugin.json >/dev/null` pattern and update `.claude-plugin/marketplace.json`.

## Git Flow

Use Git Flow for repository work:

- `main` is the stable branch for released or release-ready marketplace state.
- `develop` is the integration branch for ongoing plugin work.
- Create feature branches from `develop` using `feature/<purpose>`, for example `feature/ekko-agy-cli`.
- Merge completed features back into `develop` after validation.
- Use `release/<version-or-purpose>` when preparing a release candidate from `develop` to `main`.
- Use `hotfix/<purpose>` only for urgent fixes based on `main`.
- Do not commit directly to `main` except for initial bootstrapping or explicit release/hotfix work.

Before merging a branch, run:

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
claude plugin validate .
```

When a branch changes a specific plugin, also validate that plugin's manifest:

```bash
python -m json.tool plugins/<plugin-name>/.claude-plugin/plugin.json >/dev/null
```

## Development workflow

When adding a real plugin:

1. Create `plugins/<plugin-name>/.claude-plugin/plugin.json`; original plugins normally use `ekko-<specific-purpose>`.
2. Add the plugin entry to `.claude-plugin/marketplace.json` with `source: "./plugins/<plugin-name>"`.
3. Put skills, agents, hooks, MCP configuration, commands used for compatibility, and scripts inside that plugin directory.
4. Update `README.md`, `docs/plugin-layout.md`, and `CHANGELOG.md` for user-visible changes.
5. Run the JSON validation commands above and the plugin's behavior tests.
6. Test local installation with `claude plugin marketplace update zaunekko` and `claude plugin install <plugin-name>@zaunekko`.

For new user-invoked capabilities, prefer skills in `skills/<skill-name>/SKILL.md` over the legacy `commands/` layout. Preserve `commands/` only when an existing upstream interface requires compatibility.

## Local-only files

`AGENTS.md` and `HANDOFF.local.md` are intentionally ignored by git. Keep durable project guidance in this file when it should be committed.