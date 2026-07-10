# Plugin and marketplace layout

This repository follows Claude Code's marketplace layout.

## Marketplace root

- `.claude-plugin/marketplace.json`: marketplace catalog read when users add `ZaunEkko/claude-plugins`.
- `plugins/ekko-plugin-scaffold/`: temporary installable scaffold.
- `plugins/commit-commands/`: upstream-derived compatibility distribution with dynamic commit model and effort attribution.

## Plugin naming convention

Original plugins should use `ekko-<specific-purpose>` names that remain clear without the marketplace source:

- Good: `ekko-agy-cli`, `ekko-notion-tasks`, `ekko-browser-debug`
- Avoid: `claude-plugins`, `ekko-plugins`, `ekko-skills`, `tools`, `utils`

A same-name compatibility distribution may be an exception when preserving an upstream installation identity and runtime namespace is the explicit product requirement. Such an exception must document its upstream source, license, unchanged files, modified files, local additions, and synchronization process.

`plugins/commit-commands/` is the current exception.

## Installable plugin manifests

- `plugins/ekko-plugin-scaffold/.claude-plugin/plugin.json`: temporary scaffold manifest.
- `plugins/commit-commands/.claude-plugin/plugin.json`: third-party compatibility distribution manifest.

## Component directories

Claude Code components live at the root of each installable plugin:

- `skills/<skill-name>/SKILL.md`: preferred format for new user-invoked and auto-activated capabilities.
- `agents/*.md`: subagent definitions.
- `commands/*.md`: legacy command definitions, used only when compatibility requires the existing command namespace.
- `hooks/hooks.json`: event hook configuration.
- `scripts/`: helper runtimes used by commands or hooks.
- `.mcp.json`: MCP server definitions when needed.

The `commit-commands` compatibility plugin uses:

```text
plugins/commit-commands/
├── .claude-plugin/plugin.json
├── commands/
│   ├── clean_gone.md
│   ├── commit.md
│   └── commit-push-pr.md
├── hooks/hooks.json
├── scripts/
├── tests/
├── LICENSE
├── README.md
└── UPSTREAM.md
```

Its entire directory is Apache-2.0 licensed. Repository content outside that directory remains under the root MIT license.
