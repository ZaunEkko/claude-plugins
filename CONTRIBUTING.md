# Contributing

Thanks for your interest in improving `claude-plugins`.

## Component guidelines

- Name installable plugins with `ekko-<specific-purpose>`; avoid generic names such as `claude-plugins`, `ekko-plugins`, or `ekko-skills`.
- Prefer new capabilities as skills in `skills/<skill-name>/SKILL.md`.
- Keep each skill focused on one clear workflow or body of knowledge.
- Use kebab-case names for directories and files.
- Avoid hardcoded machine-specific paths, credentials, or local-only assumptions.
- Document required external tools, environment variables, and setup steps.

## Before opening a PR

1. Validate the plugin structure.
2. Test the affected component in Claude Code when possible.
3. Update `README.md` for user-facing behavior changes.
4. Update `CHANGELOG.md` for notable changes.

## Security

Do not commit secrets, personal tokens, private URLs, or machine-specific configuration. Use environment variables and document them clearly.
