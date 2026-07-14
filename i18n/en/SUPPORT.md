# Support

[简体中文](../../SUPPORT.md) · [English](SUPPORT.md) · [繁體中文](../zh-TW/SUPPORT.md) · [日本語](../ja/SUPPORT.md) · [한국어](../ko/SUPPORT.md)

## Check the documentation first

- [Installation and updates](../../docs/getting-started.md)
- [Troubleshooting](../../docs/troubleshooting.md)
- [`commit-commands` user guide](docs/commit-commands/README.md)
- [Claude Code plugin documentation](https://code.claude.com/docs/en/plugins)

## File an issue

Use the closest [issue template](https://github.com/ZaunEkko/claude-plugins/issues/new/choose). Include the plugin and version, installation source and scope, Claude Code/OS/Git/Node.js/`gh` versions when relevant, minimal reproduction, expected and actual behavior, checks already run, and redacted errors.

Do not submit tokens, API keys, complete transcripts, private repository content, user settings, sensitive paths, or personal data.

## Quick diagnostics

```bash
claude plugin marketplace list --json
claude plugin list --json
claude plugin details commit-commands@zaunekko
claude plugin validate .
```

After installing or updating in a running session, use `/reload-plugins`. If the official same-name distribution is also enabled, disable one version in the same scope.

## Security and support boundaries

Report exploitable vulnerabilities privately according to [SECURITY.md](SECURITY.md), not in a public issue. Maintainers can help with this repository's plugins and Claude Code integration, but cannot guarantee third-party MCP, GitHub, Git, `gh`, account, billing, or unrelated Claude API behavior.
