# claude-plugins

A private-first Claude Code plugin marketplace by [ZaunEkko](https://github.com/ZaunEkko).

## Marketplace

- Source repository: `ZaunEkko/claude-plugins`
- Marketplace name: `zaunekko`
- Distribution status: private during development; public access can be enabled later

## Available plugins

| Plugin | Install identity | Status | License |
|---|---|---|---|
| `ekko-plugin-scaffold` | `ekko-plugin-scaffold@zaunekko` | Temporary empty scaffold | MIT |
| `commit-commands` | `commit-commands@zaunekko` | Third-party compatibility distribution with dynamic model and effort attribution | Apache-2.0 |

### `commit-commands`

`commit-commands@zaunekko` is derived from Anthropic's official `commit-commands` plugin. It preserves `/commit-commands:commit`, `/commit-commands:commit-push-pr`, and `/commit-commands:clean_gone`, while routing commits through a deterministic wrapper that replaces the attribution `Model:` line with the current session model and records the active `Effort:` level when available.

The official and ZaunEkko distributions have the same plugin and command names. Enable exactly one:

```json
{
  "enabledPlugins": {
    "commit-commands@claude-plugins-official": false,
    "commit-commands@zaunekko": true
  }
}
```

See [`plugins/commit-commands/README.md`](plugins/commit-commands/README.md) for behavior, installation, runtime requirements, tests, privacy details, and upstream provenance.

## Naming convention

Original installable plugins should use:

```text
ekko-<specific-purpose>
```

Examples include `ekko-agy-cli`, `ekko-notion-tasks`, and `ekko-browser-debug`. Avoid generic original plugin names such as `tools`, `utils`, `ekko-plugins`, or `claude-plugins`.

A documented exception is allowed for a licensed, same-name compatibility distribution that must preserve an upstream plugin's installation and command namespace. `commit-commands` is such an exception; its source, license, hashes, and modifications are recorded in [`UPSTREAM.md`](plugins/commit-commands/UPSTREAM.md).

## Installation

Add the marketplace:

```text
/plugin marketplace add ZaunEkko/claude-plugins
```

Install a plugin by its marketplace identity:

```text
/plugin install ekko-plugin-scaffold@zaunekko
/plugin install commit-commands@zaunekko
```

For local development from this checkout:

```bash
claude plugin marketplace add --scope local "D:/project/coding/project/github/claude-plugins"
claude plugin install --scope local commit-commands@zaunekko
```

Use local scope for compatibility-plugin testing so existing user-scope marketplace and official plugin settings remain untouched.

## Repository layout

```text
claude-plugins/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   ├── ekko-plugin-scaffold/
│   │   └── .claude-plugin/plugin.json
│   └── commit-commands/
│       ├── .claude-plugin/plugin.json
│       ├── commands/
│       ├── hooks/hooks.json
│       ├── scripts/
│       ├── tests/
│       ├── LICENSE
│       ├── README.md
│       └── UPSTREAM.md
├── docs/
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

Claude Code auto-discovers plugin components inside each installed plugin directory. New user-invoked capabilities should normally use `skills/<skill-name>/SKILL.md`; legacy `commands/` is reserved for compatibility with an existing upstream command interface.

## Development

When adding or changing a plugin:

1. Work from `develop` on a `feature/<purpose>` branch.
2. Keep all components inside the target `plugins/<plugin-name>/` directory.
3. Add or update the marketplace entry.
4. Update user-facing documentation and `CHANGELOG.md`.
5. Run manifest, plugin, and behavior validation.
6. Test local installation in explicit local scope where practical.

Core validation:

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
python -m json.tool plugins/commit-commands/.claude-plugin/plugin.json >/dev/null
python -m json.tool plugins/commit-commands/hooks/hooks.json >/dev/null
node --test plugins/commit-commands/tests/*.mjs
claude plugin validate .
claude plugin validate --strict plugins/commit-commands
```

## License

This repository uses mixed licensing:

- The entire [`plugins/commit-commands/`](plugins/commit-commands/) directory is licensed under its included Apache License 2.0 because it contains an upstream-derived compatibility distribution and local additions maintained as one derivative work.
- The repository's remaining original content is licensed under the root [MIT License](LICENSE).

Private repository access still limits who can obtain the source while development remains private-first.
