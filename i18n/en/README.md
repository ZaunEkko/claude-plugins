<div align="center">

# 🧩 Claude Code Plugins

### A general-purpose plugin marketplace for Claude Code

*Package useful skills, agents, hooks, MCP configuration, and compatibility commands into installable and verifiable Claude Code capabilities.*

[简体中文](../../README.md) · [English](README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md)

[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin_marketplace-D97757?style=flat-square&logo=anthropic&logoColor=white)](https://code.claude.com/docs/en/plugins)
[![Marketplace](https://img.shields.io/badge/marketplace-zaunekko-6f42c1?style=flat-square)](../../.claude-plugin/marketplace.json)
[![License](https://img.shields.io/badge/license-MIT%20%2B%20Apache--2.0-blue?style=flat-square)](#license)
[![Status](https://img.shields.io/badge/status-public--release--ready-blue?style=flat-square)](#what-this-repository-is)

</div>

## ✨ What this repository is

This is ZaunEkko's Claude Code plugin marketplace container. It maintains the marketplace catalog, installable plugins, user documentation, validation workflow, and community files. Claude Code reads the catalog from [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json).

This repository is being prepared for public release and community collaboration. Plugins are implemented, validated, and documented for public distribution, transparent review, and safe contribution. Repository visibility may remain restricted while release preparation is completed. The marketplace name is `zaunekko`, and the GitHub source is `ZaunEkko/claude-plugins`.

## 🧰 What it can contain

- `skills/<skill-name>/SKILL.md` for new user-facing or model-invoked capabilities.
- `agents/*.md` for reusable specialized subagents.
- `hooks/hooks.json` for lifecycle and tool-event automation.
- `.mcp.json` for plugin MCP servers.
- `scripts/` for testable implementations used by other components.
- `commands/*.md` only when an existing upstream interface requires compatibility.

Original plugins normally use the purpose-first name `ekko-<specific-purpose>`. A same-name exception is allowed only for a licensed compatibility distribution that must preserve its upstream install and runtime namespace.

## 📦 Current contents

| Plugin | Status | Description | Documentation |
|---|---|---|---|
| `commit-commands` | Available · compatibility distribution | Preserves the three official command names, writes the current session model plus optional effort into Git commit attribution, and blocks direct commits from bypassing the wrapper inside Claude Code. | [User guide](docs/commit-commands/README.md) · [Implementation and upstream notes](../../plugins/commit-commands/README.md) |
| `ekko-image-gen` | Available · original | One command for an OpenAI-compatible Images API on localhost or a third-party HTTPS endpoint, with text-to-image, pasted-reference editing, context-aware project output, bounded leaf workers, visual review, and clickable local files. | [User guide](../../docs/ekko-image-gen/README.md) · [Implementation](../../plugins/ekko-image-gen/README.md) |

`commit-commands` exposes the same namespace as the official distribution. Enable exactly one version in any given scope.

## 🚀 Quick start

### Already inside Claude Code

Run these commands in the current session:

```text
/plugin marketplace add ZaunEkko/claude-plugins
/plugin install commit-commands@zaunekko
/plugin install ekko-image-gen@zaunekko
/reload-plugins
```

The `/plugin` command uses Claude Code's built-in plugin interface. Use the CLI below when you need explicit scope control, automation, or diagnostics.

### Ask an Agent to install it

Give your Claude Code Agent the repository link and this prompt:

```text
Please install every plugin from this Claude Code marketplace:
https://github.com/ZaunEkko/claude-plugins

Requirements:
1. Confirm whether I want user, project, or local scope unless I already specified it.
2. Modify only the selected scope.
3. Add and update the zaunekko marketplace, read its current catalog, then install and enable every listed plugin.
4. If commit-commands@claude-plugins-official is enabled in the same scope, explain the namespace conflict and disable it without uninstalling or deleting it.
5. For ekko-image-gen, check `~/.claude/ekko-image-gen.local.json`. If missing, create a template containing only `baseUrl` and a placeholder `apiKey`, then tell me to edit the local file directly. Never ask me to paste a real API key into the conversation.
6. Run /reload-plugins and report the exact commands, installation results, and any configuration I still need to fill in.
7. Stop for my decision when permission, authentication, or security confirmation is required; do not bypass it.
```

### CLI installation

#### 1. Add the marketplace

```bash
claude plugin marketplace add ZaunEkko/claude-plugins
claude plugin marketplace update zaunekko
```

#### 2. Install a plugin

```bash
claude plugin install commit-commands@zaunekko --scope user
claude plugin install ekko-image-gen@zaunekko --scope user
```

If the official distribution is enabled in the same scope, switch explicitly:

```bash
claude plugin disable commit-commands@claude-plugins-official --scope user
claude plugin enable commit-commands@zaunekko --scope user
```

After installing, enabling, disabling, or updating a plugin in a running session, use:

```text
/reload-plugins
```

Refreshing a marketplace and updating an installed plugin are separate operations:

```bash
claude plugin marketplace update zaunekko
claude plugin update commit-commands@zaunekko --scope user
claude plugin update ekko-image-gen@zaunekko --scope user
```

#### 3. Configure `ekko-image-gen`

Create `~/.claude/ekko-image-gen.local.json` (`%USERPROFILE%\.claude\ekko-image-gen.local.json` on Windows):

```json
{
  "baseUrl": "https://your-openai-compatible-service.example/v1",
  "apiKey": "replace-with-local-key"
}
```

The endpoint may be localhost or a third-party HTTPS service. Do not commit the real key or paste it into an Agent conversation. The default model is `gpt-image-2`, and the runner automatically completes logical multi-image counts after short provider responses.

#### 4. Choose a scope

| Scope | Use case | Settings file |
|---|---|---|
| `user` | Default for the current user | `~/.claude/settings.json` |
| `project` | Shared with repository collaborators | `.claude/settings.json` |
| `local` | Local testing in the current repository | `.claude/settings.local.json` |

Use `--scope local` for local development and same-name compatibility testing so automated validation does not modify user-scoped settings.

## 🎯 Commands

| Command | Purpose |
|---|---|
| `/commit-commands:commit` | Inspect changes, stage relevant files, and create one commit. |
| `/commit-commands:commit-push-pr` | Commit, then push, then create a Pull Request in fail-closed order. |
| `/commit-commands:clean_gone` | Plan deterministic cleanup, request explicit confirmation, then remove only safe branches with an exact missing `refs/remotes/...` upstream and eligible clean worktrees. |
| `/ekko-image-gen:generate` | Generate or edit images through the configured OpenAI-compatible Images API, then place, inspect, and report local output files in project context. |

Generated attribution looks like:

```text
Generated with [Claude Code](https://claude.ai/code)

Model: gpt-5.6-sol xhigh

Co-Authored-By: Claude <noreply@anthropic.com>
```

When no reliable model can be resolved, the plugin removes the `Model:` line instead of retaining a stale value or writing `unknown`.

## 📚 Documentation

- [Documentation center](../../docs/README.md)
- [Installation and updates](../../docs/getting-started.md)
- [Plugin authoring](../../docs/plugin-authoring.md)
- [Plugin layout](../../docs/plugin-layout.md)
- [Troubleshooting](../../docs/troubleshooting.md)
- [`commit-commands` user guide](docs/commit-commands/README.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)

## 🏗️ Repository layout

```text
.
├── .claude-plugin/marketplace.json
├── .github/
├── docs/
├── i18n/
├── plugins/
│   └── commit-commands/
├── CHANGELOG.md
├── CONTRIBUTING.md
└── README.md
```

Each installable plugin owns its `.claude-plugin/plugin.json` and all of its skills, agents, hooks, MCP configuration, commands, and scripts.

## 🧭 Roadmap

- Continue testing `commit-commands` across platforms and session configurations.
- Add focused plugins through documented proposals, community review, and validation.
- Add multilingual entry points, user guides, trust notes, and behavior tests for new plugins.
- Maintain versioning, update, rollback, and security-review workflows for public releases and community contributions.

See [CHANGELOG.md](../../CHANGELOG.md) and repository tags for actual released work.

## 🧪 Validation

```bash
python -m pip install PyYAML==6.0.3
python .github/validate-repository.py
bash -n plugins/commit-commands/scripts/commit-with-dynamic-attribution.sh
node --test plugins/commit-commands/tests/*.mjs
claude plugin validate .
claude plugin validate . --strict
claude plugin validate plugins/commit-commands
claude plugin validate plugins/commit-commands --strict
```

`--strict` turns validation warnings into errors and is recommended before a Pull Request or release.

## ⚠️ Trust and safety

Claude Code plugins and marketplaces are highly trusted components. They can include hooks, scripts, and MCP servers that execute with your user privileges.

Before installing:

1. Add marketplaces only from sources you trust.
2. Inspect `plugin.json`, `hooks/hooks.json`, `.mcp.json`, and scripts.
3. Use `/hooks` to review active hooks and their source.
4. Test third-party plugins in `local` scope or an isolated repository first.
5. Never post tokens, keys, complete transcripts, private repository data, or sensitive paths in issues or logs.

Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## 📄 License

- Original repository content is licensed under the root [MIT License](../../LICENSE).
- The entire [`plugins/commit-commands/`](../../plugins/commit-commands/) directory is separately licensed under its included [Apache License 2.0](../../plugins/commit-commands/LICENSE).
- Upstream source, hashes, modifications, and synchronization steps are recorded in [`UPSTREAM.md`](../../plugins/commit-commands/UPSTREAM.md).

## 🤝 Community

- [Issue templates](https://github.com/ZaunEkko/claude-plugins/issues/new/choose)
- [Contributing guide](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Security policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
