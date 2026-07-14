# ekko-plugin-scaffold

This directory preserves the repository's original marketplace scaffold as a historical, non-installable example. It is intentionally **not listed** in `.claude-plugin/marketplace.json` and is not a supported plugin release.

Do not install or advertise `ekko-plugin-scaffold@zaunekko`.

## Naming convention demonstrated

Original plugins in this marketplace should use a purpose-first name:

```text
ekko-<specific-purpose>
```

Examples:

- `ekko-agy-cli`
- `ekko-notion-tasks`
- `ekko-browser-debug`

Avoid generic installable names such as `claude-plugins`, `ekko-plugins`, or `ekko-skills`.

## Example component directories

- `skills/`: skills in `skills/<skill-name>/SKILL.md`.
- `agents/`: agent definitions as Markdown files.
- `hooks/`: hook configuration in `hooks/hooks.json`.
- `scripts/`: helper scripts used by plugin components.

A real plugin should replace this placeholder description, add focused behavior and tests, and be reviewed before being added to the marketplace catalog.
