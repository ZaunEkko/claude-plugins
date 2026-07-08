# claude-plugins

A Claude Code plugin marketplace by [ZaunEkko](https://github.com/ZaunEkko).

This repository is intentionally starting as a **marketplace-ready scaffold**. It hosts a temporary initial plugin named `ekko-plugin-scaffold`, with empty component directories prepared for future skills, agents, hooks, scripts, and MCP integrations.

## Status

- Marketplace source: `ZaunEkko/claude-plugins`
- Marketplace name: `zaunekko`
- Current scaffold plugin: `ekko-plugin-scaffold`
- Current scaffold install identity: `ekko-plugin-scaffold@zaunekko`
- Initial version: `0.1.0`
- Current components: none yet
- License plan: MIT
- Repository visibility: private first; public marketplace distribution later

## Naming convention

Installable plugins in this marketplace should use:

```text
ekko-<specific-purpose>
```

Use names that remain clear in `/plugins` even when the marketplace source is not visible.

Recommended examples:

- `ekko-agy-cli` — operates the `agy` CLI from Claude Code.
- `ekko-notion-tasks` — manages Notion task workflows.
- `ekko-browser-debug` — drives browser debugging workflows.

Avoid generic installable plugin names:

- `claude-plugins`
- `ekko-plugins`
- `ekko-skills`
- `tools`
- `utils`

The repository can stay generic (`claude-plugins`) because it is the marketplace container. Individual plugins should be purpose-specific.

## Installation

This repository is intended to start as a private marketplace while plugins are being developed and tested. Public installation instructions below apply after the repository is made accessible to the target users.

After this repository is published and available to Claude Code, users can add this marketplace and install the current scaffold plugin:

```text
/plugin marketplace add ZaunEkko/claude-plugins
/plugin install ekko-plugin-scaffold@zaunekko
```

The GitHub repository identifies the marketplace source. The install name follows Claude Code's `<plugin>@<marketplace>` convention.

## Repository layout

```text
claude-plugins/
├── .claude-plugin/
│   └── marketplace.json                  # Claude Code marketplace catalog
├── plugins/
│   └── ekko-plugin-scaffold/
│       ├── .claude-plugin/
│       │   └── plugin.json               # Temporary scaffold plugin manifest
│       ├── skills/                       # Future skills: skills/<skill-name>/SKILL.md
│       ├── agents/                       # Future agent definitions: agents/<agent-name>.md
│       ├── hooks/                        # Future hook config: hooks/hooks.json
│       └── scripts/                      # Future helper scripts used by plugin components
├── docs/
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

Claude Code discovers plugin components inside the installed plugin directory by convention. In this repository, the current scaffold plugin lives at `plugins/ekko-plugin-scaffold/`:

- Skills live in `plugins/ekko-plugin-scaffold/skills/<skill-name>/SKILL.md`.
- Agents live in `plugins/ekko-plugin-scaffold/agents/*.md`.
- Hooks are configured through `plugins/ekko-plugin-scaffold/hooks/hooks.json`.
- MCP servers are configured through `plugins/ekko-plugin-scaffold/.mcp.json`.

After installation, those same paths are plugin-relative: `skills/<skill-name>/SKILL.md`, `agents/*.md`, `hooks/hooks.json`, and `.mcp.json`.

The legacy `commands/` layout is intentionally not included in the scaffold. New user-invoked capabilities should be implemented as skills unless there is a compatibility reason to use legacy commands.

## Local testing

Before publishing, test the marketplace from this local checkout:

```text
/plugin marketplace add D:\\project\\coding\\project\\github\\claude-plugins
/plugin install ekko-plugin-scaffold@zaunekko
```

After installing, verify that Claude Code lists the marketplace as `zaunekko` and can install `ekko-plugin-scaffold@zaunekko`. This initial scaffold has no active skills yet, so the expected validation target is marketplace/plugin discovery rather than skill behavior.

After pushing to GitHub, test the public source:

```text
/plugin marketplace add ZaunEkko/claude-plugins
/plugin install ekko-plugin-scaffold@zaunekko
```

## Development

### Add a real plugin

When a concrete capability is ready, create a purpose-specific plugin directory:

```text
plugins/ekko-agy-cli/
└── .claude-plugin/plugin.json
```

Then add it to `.claude-plugin/marketplace.json`.

### Add a skill

Create a directory under the plugin's `skills/` directory:

```text
plugins/ekko-agy-cli/skills/my-skill/
└── SKILL.md
```

A skill should include frontmatter with a strong description so Claude Code can activate it at the right time.

### Add an agent

Create an agent definition under the plugin's `agents/` directory:

```text
plugins/ekko-agy-cli/agents/my-agent.md
```

Use focused trigger examples and only grant the tools the agent actually needs.

### Add hooks

Create `hooks/hooks.json` inside the target plugin directory and any required helper scripts. Keep hook commands portable and avoid hardcoded user-specific paths.

### Add MCP integration

Create `.mcp.json` inside the target plugin directory and document all required environment variables in this README.

## Publishing notes

Before publishing a new version:

1. Update the target plugin's `.claude-plugin/plugin.json` with the new semantic version.
2. Update `.claude-plugin/marketplace.json` if plugin metadata or source changes.
3. Update `CHANGELOG.md`.
4. Validate the marketplace and plugin structure.
5. Test installation in Claude Code.
6. Tag or release from the GitHub repository.

## License

MIT © ZaunEkko

This repository is planned to use the MIT license. While the repository remains private, distribution is limited to users who have access to the private source.
