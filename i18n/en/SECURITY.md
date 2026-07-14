# Security Policy

[简体中文](../../SECURITY.md) · [English](SECURITY.md) · [繁體中文](../zh-TW/SECURITY.md) · [日本語](../ja/SECURITY.md) · [한국어](../ko/SECURITY.md)

## Supported versions

The default development line and the latest release are supported. During release preparation, the current public-release-ready version is also treated as supported. Security fixes are prioritized for these versions; backports depend on impact and reproducibility.

## Report a vulnerability privately

Use GitHub private vulnerability reporting:

https://github.com/ZaunEkko/claude-plugins/security/advisories/new

Do not disclose exploitable details in public issues, pull requests, discussions, or commit messages.

Include the affected plugin, version, file and scope; relevant Claude Code, OS, Git and Node.js versions; minimal reproduction steps; impact and prerequisites; redacted logs; and known mitigations. Never include real tokens, API keys, complete transcripts, private repository content, or third-party personal data.

## Plugin threat model

Claude Code plugins and marketplaces are highly trusted components. They may include automatic hooks, scripts executed with user privileges, MCP servers, external network access, and skills that modify files or Git state.

Security issues of particular interest include command injection, path traversal, unsafe temporary files, fail-open commit/push/release flows, undeclared hook side effects, credential or transcript disclosure, marketplace source escape, supply-chain replacement, broken upstream provenance or license boundaries, and dangerous ambiguity caused by enabling same-name distributions together.

## Coordinated disclosure

Maintainers will make a reasonable effort to acknowledge, assess, remediate, and coordinate disclosure. Please allow a reasonable remediation window before publishing exploit details.

This policy does not authorize testing against systems, accounts, or repositories you do not own; denial of service; data destruction; persistence; credential collection; social engineering; or retaining data beyond the minimum required to reproduce the issue.

## Installer guidance

- Add marketplaces only from sources you trust.
- Inspect `plugin.json`, `hooks/hooks.json`, `.mcp.json`, and scripts.
- Use `/hooks` to review active hook sources.
- Test in `--scope local` and an isolated repository first.
- Enable only one same-name compatibility distribution per scope.
- After a marketplace update, explicitly update installed plugins and run `/reload-plugins` in the session.
