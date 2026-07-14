## Summary / 变更摘要

<!-- What changed, why, and what user-visible result does it produce? -->

## Affected areas / 影响范围

- [ ] Marketplace catalog
- [ ] `commit-commands`
- [ ] Another plugin
- [ ] Documentation or localization
- [ ] Community templates or CI

## Change type / 变更类型

- [ ] Bug fix
- [ ] New capability
- [ ] Behavior change
- [ ] Documentation only
- [ ] Upstream synchronization
- [ ] Release or maintenance

## Validation / 验证

<!-- List the exact commands run and their results. State any skipped or failed checks. -->

```text
python -m json.tool .claude-plugin/marketplace.json >/dev/null
claude plugin validate .
```

- [ ] Affected plugin manifest validates.
- [ ] Affected behavior tests pass.
- [ ] `claude plugin validate <plugin> --strict` passes when applicable.
- [ ] `git diff --check` passes.
- [ ] Local installation or reload behavior was tested, or the reason it was skipped is documented.

## Trust, permissions, and side effects / 信任、权限与副作用

- [ ] No hooks, scripts, shell execution, MCP servers, network access, or permissions changed.
- [ ] Changes to those components are documented below.
- [ ] Failure paths are fail-closed for commit, push, release, deletion, or other irreversible actions.
- [ ] Tests do not modify user-scope plugin settings or contact real remotes.

<!-- Describe new automatic behavior, data flow, credentials, file changes, network access, and rollback. -->

## Documentation and localization / 文档与本地化

- [ ] Root README or plugin/user guide updated for user-visible behavior.
- [ ] `CHANGELOG.md` updated when notable.
- [ ] Affected translations updated, or missing translations are listed below.
- [ ] Commands, paths, versions, scopes, and security requirements match across languages.

## License and provenance / 许可证与来源

- [ ] No third-party or upstream-derived content was added.
- [ ] Third-party source, license, hashes, copied/modified files, and synchronization notes are documented.
- [ ] The root MIT and `plugins/commit-commands/` Apache-2.0 boundary remains correct.

## Additional notes / 补充说明

<!-- Screenshots, compatibility notes, follow-up work, or known limitations. Do not include secrets. -->
