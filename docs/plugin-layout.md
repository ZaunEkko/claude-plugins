# Plugin and marketplace layout

This repository follows Claude Code's marketplace layout.

## Marketplace root

- `.claude-plugin/marketplace.json`: marketplace catalog read by Claude Code when users add `ZaunEkko/claude-plugins` as a marketplace.
- `plugins/ekko-plugin-scaffold/`: temporary installable plugin scaffold referenced by the marketplace catalog.

## Plugin naming convention

Installable plugins in this marketplace should use:

```text
ekko-<specific-purpose>
```

Use purpose-first names that remain clear in `/plugins` even without seeing the marketplace source:

- Good: `ekko-agy-cli`, `ekko-notion-tasks`, `ekko-browser-debug`
- Avoid: `claude-plugins`, `ekko-plugins`, `ekko-skills`, `tools`, `utils`

## Installable plugin

- `plugins/ekko-plugin-scaffold/.claude-plugin/plugin.json`: plugin manifest read by Claude Code after installation.

## Optional plugin component directories

All component directories currently live inside `plugins/ekko-plugin-scaffold/`:

- `skills/`: future skills. Each skill should live at `skills/<skill-name>/SKILL.md`.
- `agents/`: future subagent definitions as Markdown files.
- `hooks/`: future hook configuration. Add `hooks/hooks.json` only when hooks exist.
- `scripts/`: helper scripts used by plugin components.

## Intentionally absent for now

- `commands/`: legacy slash-command layout. Prefer skills for new user-invoked capabilities.
- `.mcp.json`: add inside the plugin directory only when the plugin ships an MCP server integration.
