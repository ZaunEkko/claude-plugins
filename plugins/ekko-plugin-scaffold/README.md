# ekko-plugin-scaffold plugin

This is the temporary installable Claude Code plugin scaffold published from the `ZaunEkko/claude-plugins` marketplace.

The initial version intentionally contains no active skills, agents, hooks, or MCP servers yet. Component directories are kept in place so the first real capability can be added without changing the repository shape.

## Naming convention

Published plugins in this marketplace should use the pattern:

```text
ekko-<specific-purpose>
```

Examples:

- `ekko-agy-cli`
- `ekko-notion-tasks`
- `ekko-browser-debug`

Avoid generic names such as `claude-plugins`, `ekko-plugins`, or `ekko-skills` for installable plugins.

## Component directories

- `skills/`: future skills in `skills/<skill-name>/SKILL.md`.
- `agents/`: future agent definitions as Markdown files.
- `hooks/`: future hook configuration in `hooks/hooks.json`.
- `scripts/`: helper scripts used by plugin components.

## Install identity

```text
ekko-plugin-scaffold@zaunekko
```
