# Contributing

[简体中文](../../CONTRIBUTING.md) · [English](CONTRIBUTING.md) · [繁體中文](../zh-TW/CONTRIBUTING.md) · [日本語](../ja/CONTRIBUTING.md) · [한국어](../ko/CONTRIBUTING.md)

Thank you for improving the `zaunekko` Claude Code plugin marketplace. Contributions may include bug fixes, tests, documentation, translations, community templates, or focused new plugins that follow the repository's naming and safety requirements.

## Before you start

- Read the root [README](README.md), [`CLAUDE.md`](../../CLAUDE.md), and the target plugin documentation.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report security issues privately according to [SECURITY.md](SECURITY.md).
- Do not commit API keys, tokens, complete transcripts, user settings, private paths, or generated credential files.

## Git Flow

- `main`: stable or release-ready marketplace state.
- `develop`: integration branch for ongoing work.
- `feature/<purpose>`: branch from `develop` and merge back into `develop`.
- `release/<version-or-purpose>`: prepare a release from `develop` to `main`.
- `hotfix/<purpose>`: urgent fixes based on `main` only.

Do not commit directly to `main` except for explicit release or hotfix work.

## Existing plugins

1. Read the plugin README, manifest, hooks, and tests first.
2. Keep the change within the requested behavior; avoid unrelated refactors.
3. Update behavior tests and user-facing documentation.
4. Document new command execution, network access, MCP, hooks, and permissions.
5. Validate both the target plugin and the marketplace.

## New original plugins

Use the purpose-first name `ekko-<specific-purpose>`.

```text
plugins/ekko-example/
├── .claude-plugin/plugin.json
├── README.md
└── skills/example/SKILL.md
```

Then add `source: "./plugins/ekko-example"` to `.claude-plugin/marketplace.json`. Prefer `skills/` for new capabilities; use `commands/` only for documented upstream compatibility. Keep agents, hooks, `.mcp.json`, scripts, tests, and documentation inside the plugin directory.

See [Plugin authoring](../../docs/plugin-authoring.md).

## Same-name upstream distributions

A same-name exception is allowed only when preserving the upstream installation name and runtime namespace is necessary. It must retain the directory license and document the source commit, file hashes, copied and modified files, synchronization procedure, namespace conflict, and local additions.

`plugins/commit-commands/` is currently the only exception. Do not copy its Apache-derived content into the repository's default MIT area without the required license and provenance.

## Documentation and localization

User-visible changes should update the root README, the plugin/user guide, `CHANGELOG.md`, and affected translations. Simplified Chinese is currently the canonical root documentation. Keep commands, paths, plugin names, versions, and security requirements identical across languages; do not translate code identifiers.

## Validation

At minimum:

```bash
python -m json.tool .claude-plugin/marketplace.json >/dev/null
claude plugin validate .
```

For `commit-commands` changes:

```bash
python -m json.tool plugins/commit-commands/.claude-plugin/plugin.json >/dev/null
python -m json.tool plugins/commit-commands/hooks/hooks.json >/dev/null
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
node --test plugins/commit-commands/tests/*.mjs
claude plugin validate plugins/commit-commands --strict
```

Use explicit local scope for development installs. In a running session use `/reload-plugins`. Automated validation must not modify user-scoped plugin settings.

## Pull Requests

Describe the user-visible result, affected plugins and components, exact validation results, trust or permission changes, documentation/localization status, and any upstream or license changes. State skipped or failed checks plainly and keep each PR focused.

## License

By contributing, you confirm that you may submit the content and agree that original repository content is provided under MIT, while contributions inside `plugins/commit-commands/` are provided under that directory's Apache-2.0 license.
