# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

This repository is a Claude Code plugin marketplace container for ZaunEkko plugins. The marketplace name is `zaunekko`; the GitHub source is intended to be `ZaunEkko/claude-plugins`.

The repository is private-first while plugins are developed and tested. The license plan is MIT.

## Architecture

- `.claude-plugin/marketplace.json` is the marketplace catalog. Claude Code reads it when users add this repository as a marketplace.
- `plugins/<plugin-name>/` contains installable plugin directories referenced by the marketplace catalog.
- The current temporary placeholder plugin is `plugins/ekko-plugin-scaffold/`.
- Each installable plugin has its own manifest at `plugins/<plugin-name>/.claude-plugin/plugin.json`.
- Optional plugin components live inside the target plugin directory:
  - `skills/<skill-name>/SKILL.md`
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

## Common validation commands

Validate the marketplace catalog and current scaffold plugin manifest:

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
python -m json.tool plugins/ekko-plugin-scaffold/.claude-plugin/plugin.json >/dev/null
```

Refresh and install from the local marketplace:

```bash
claude plugin marketplace update zaunekko
claude plugin install ekko-plugin-scaffold@zaunekko
```

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

1. Create `plugins/ekko-<specific-purpose>/.claude-plugin/plugin.json`.
2. Add the plugin entry to `.claude-plugin/marketplace.json` with `source: "./plugins/ekko-<specific-purpose>"`.
3. Put skills, agents, hooks, MCP configuration, and scripts inside that plugin directory.
4. Update `README.md`, `docs/plugin-layout.md`, and `CHANGELOG.md` for user-visible changes.
5. Run the JSON validation commands above.
6. Test local installation with `claude plugin marketplace update zaunekko` and `claude plugin install <plugin-name>@zaunekko`.

For new user-invoked capabilities, prefer skills in `skills/<skill-name>/SKILL.md` over the legacy `commands/` layout.

## Local-only files

`AGENTS.md` and `HANDOFF.local.md` are intentionally ignored by git. Keep durable project guidance in this file when it should be committed.