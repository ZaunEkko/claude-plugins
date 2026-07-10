# Upstream provenance

This directory is a third-party compatibility distribution derived from Anthropic's official `commit-commands` Claude Code plugin. It is maintained by ZaunEkko and is not an Anthropic release.

## Source

- Upstream repository: <https://github.com/anthropics/claude-plugins-public>
- Upstream plugin path: `plugins/commit-commands`
- Local marketplace source used for synchronization: `claude-plugins-official/plugins/commit-commands`
- Upstream marketplace snapshot SHA: `7d0e5f5aae1643db011e905b561fca81776388a6`
- Copied and compared: 2026-07-10
- Upstream license: Apache License 2.0

The marketplace snapshot SHA identifies the synchronized marketplace checkout. It is not a standalone semantic version or independent release SHA for the `commit-commands` subdirectory.

## Upstream file hashes

SHA-256 values below were calculated from the official marketplace snapshot before modification:

| Upstream file | SHA-256 |
|---|---|
| `.claude-plugin/plugin.json` | `ad7e089b8ab209e4a4a72438dabe5db77c32de9d0131d91b1d4816233e1653a1` |
| `commands/clean_gone.md` | `4f07fa2ccf4f81a69c6455bdc563b53a3d3b20aea6e4e82337c52b172ee02344` |
| `commands/commit.md` | `d1acbc2bf0c50164f48d6bda872de6a343cd9390954ce903c3431c3119e7f8c4` |
| `commands/commit-push-pr.md` | `3bc3d171939149cbbef141cbced553dce6ba6f97dac4a764f4ef1e055c35064d` |
| `LICENSE` | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| `README.md` | `03172e9933f1c1556a3a32a98dc54b31e73ebe57d3348e58aced204e0a9f526b` |

## Files copied unchanged

- `commands/clean_gone.md`
- `LICENSE`

These files are byte-for-byte identical to the synchronized upstream files.

## Files modified from upstream

- `.claude-plugin/plugin.json`
  - identifies ZaunEkko as the third-party maintainer;
  - adds version, repository, license, and discovery metadata;
  - prominently describes the dynamic model-attribution modification.
- `commands/commit.md`
  - keeps the official command description and context collection;
  - replaces direct `git commit` authorization with the plugin wrapper;
  - requires a safely quoted heredoc and sequential staging/commit behavior;
  - carries an in-file modification notice.
- `commands/commit-push-pr.md`
  - keeps the official command description and Git/PR workflow;
  - routes the commit through the plugin wrapper;
  - makes commit, push, and PR creation explicitly sequential instead of parallel tool calls;
  - carries an in-file modification notice.
- `README.md`
  - rewritten for the third-party compatibility distribution;
  - documents the dynamic attribution behavior, conflict policy, runtime, tests, provenance, and license.

## Files added by this distribution

- `.gitattributes`
- `UPSTREAM.md`
- `hooks/hooks.json`
- `scripts/capture-session-model.mjs`
- `scripts/resolve-session-model.mjs`
- `scripts/render-commit-attribution.mjs`
- `scripts/commit-with-dynamic-attribution.sh`
- `tests/test_capture_session_model.mjs`
- `tests/test_resolve_session_model.mjs`
- `tests/test_render_commit_attribution.mjs`
- `tests/test_commit_wrapper.mjs`

All files in this plugin directory are distributed under the directory's Apache License 2.0.

## Synchronization procedure

1. Record the current official marketplace `.gcs-sha` value.
2. Compare the official `plugins/commit-commands` tree with this directory.
3. Copy `commands/clean_gone.md` and `LICENSE` unchanged unless upstream requires an intentional local modification.
4. Rebase the local manifest, commit commands, and README changes onto the new upstream text with the smallest practical diff.
5. Keep prominent modification notices in every modified upstream source file where the format permits comments.
6. Recalculate and update the upstream SHA-256 table.
7. Run the complete `node:test` suite, JSON checks, shell syntax checks, upstream byte comparisons, and `claude plugin validate` in normal and strict modes.
8. Test installation with local scope while the official distribution is disabled in that same scope.

Do not modify the official marketplace source in place. Synchronization always copies into this repository and preserves the official source as the comparison baseline.
