# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Added `ekko-image-gen@zaunekko`, an OpenAI-compatible image generation plugin with one skill command for text-to-image and pasted-reference image editing against localhost or third-party HTTPS endpoints.
- Added context-aware output placement, clickable local file and directory links, direct Claude Code image inspection, bounded parallel leaf workers, parent-agent visual acceptance, and targeted retries.
- Added a dependency-free Node.js runner with JSON/multipart routing, remote-reference host download, collision-safe writes, API-key redaction, partial-success reporting, and a cross-process global concurrency semaphore.
- Added provider-defined model fallback with `gpt-image-2` as the public default, UI-derived aspect-ratio and 1K/2K/4K presets, and actual output-dimension reporting when upstream pixels differ from the requested tier.
- Added isolated tests for generation, image editing, minimal and advanced configuration, output links, collision handling, model fallback, size presets, concurrency limiting, partial success, provider extensions, and secret redaction.
- Added provider-cap-aware logical image counts through optional `maxImagesPerRequest`, automatic bounded follow-up after short responses, serial within-job request splitting, deterministic multi-file naming, per-request usage records, and preservation of files from partially completed jobs.

### Changed

- Bumped `ekko-image-gen` to `0.1.10` so user-scope version-cached installations receive non-empty environment override handling, scalar-reference normalization, bounded output downloads, multi-image auto-adaptation, the standard GPT Image request shape, streamed input and timeout limits, official multi-reference multipart fields, 16-aligned presets, secure endpoint validation, strict output-image validation, intra-response partial-file preservation, precise model-fallback classification, correct environment model precedence, and public marketplace documentation.

### Fixed

- Ignored empty or whitespace-only `EKKO_IMAGE_GEN_*` overrides so unfilled shell templates cannot replace valid local JSON endpoint, API-key, or advanced settings.
- Preserved scalar `images` and `referenceImages` values as one-element reference lists instead of silently routing those jobs to text generation.
- Bounded generated base64 images and streamed image-URL downloads with the configurable `maxOutputBytes` limit.
- Returned files already written from an upstream response when a later item in that same response fails decoding, downloading, or writing, reporting the job as `partial` with usage and item-index diagnostics.
- Limited 400/404/422 model fallback to explicit model error codes or strict model-unavailability wording, so content-policy and ordinary parameter errors are not resubmitted to later models.
- Kept request timeouts active until JSON or image response bodies finish streaming, so a server cannot hold a global slot indefinitely after sending headers.
- Rejected non-loopback plain HTTP API endpoints before any bearer key, prompt, or reference image can be transmitted.
- Rejected base64 and URL output payloads whose bytes are not a supported image format instead of writing mislabeled PNG files.
- Made a non-empty `EKKO_IMAGE_GEN_MODEL` override replace a persisted JSON `models` list unless the plural environment override is also set.
- Sent multiple edit references through repeated `image[]` multipart fields while preserving the established single-reference `image` compatibility path.
- Changed the `3:4` and `4:3` 1K presets to `1024x1360` and `1360x1024`, keeping both dimensions divisible by 16 for GPT Image 2 compatibility.
- Omitted the legacy `response_format` field from standard GPT Image generation and edit requests while retaining support for both `b64_json` and URL responses.
- Enforced `maxInputBytes` while streaming chunked remote reference images, aborting before an oversized response can be fully buffered in memory.
- Fixed Windows `commit-commands` wrapper tests to prefer Git Bash from the active Git installation instead of the WSL `bash.exe` shim, while preserving the literal subprocess calls introduced by CodeQL hardening.

## 2.0.3 - 2026-07-17

### Added

- Added a `PreToolUse` Bash guard that blocks direct `git commit` and `git.exe commit` calls inside Claude Code, including common Git global-option forms such as `git -C <path> commit`, so commits cannot bypass dynamic attribution.
- Extended the guard to known Playwright `browser_run_code_unsafe` tool names, blocking observable local-process commit creation and attribution-wrapper execution while leaving normal browser automation and explicit no-commit Git preparation paths available.
- Added `--claude-state-file <path>` to the attribution wrapper for strict detached-session binding; invalid explicit state fails before Git and never falls through to another concurrent session.

### Fixed

- Restored the canonical `claude.ai/code` commit attribution, dynamic current-model/effort rendering, and the requested blank separator when Claude supplies an alternate generated marker, omits `Model:`, or produces no attribution block.
- Changed detached model fallback order to prefer `ANTHROPIC_MODEL` over a low-information settings alias such as `opus` when transcript and SessionStart state are unavailable.

## 0.2.0 - 2026-07-14

### Added

- Added `commit-commands@zaunekko`, a same-name third-party compatibility distribution derived from Anthropic's official `commit-commands` plugin.
- Added per-session model capture, transcript-first model resolution, byte-preserving attribution rendering, and a fail-closed Git commit wrapper.
- Added optional effort metadata from the active `CLAUDE_EFFORT`, with user settings fallback, as a compact suffix on the `Model:` line.
- Added isolated Node.js tests for hooks, resolver, renderer, Git commits, cleanup, existing Git hook failures, and local-only `commit-push-pr` sequencing.
- Added a deterministic `clean_gone` planner/apply script with SHA-256 state validation, explicit confirmation, exact ref/worktree matching, and safety coverage for dirty, locked, current, and unpreserved branches.
- Added Apache-2.0 licensing and detailed upstream provenance for the entire `plugins/commit-commands/` directory.
- Added a documentation center with installation, plugin authoring, layout, troubleshooting, and `commit-commands` user guides.
- Added Simplified Chinese, English, Traditional Chinese, Japanese, and Korean README navigation plus localized contribution, security, conduct, support, and `commit-commands` documentation.
- Added GitHub Issue forms, a Pull Request template, support and security policies, a Code of Conduct, and an automated validation workflow.

### Changed

- Documented the compatibility-distribution exception to the normal `ekko-<specific-purpose>` naming convention.
- Updated marketplace, layout, contribution, development, and mixed-license documentation.
- Consolidated model and effort metadata into `Model: <model> [effort]` while removing legacy standalone `Effort:` lines.
- Separated the Claude Code attribution marker from the compact `Model:` line with a blank line.
- Reworked the marketplace README in the `codex-plugins` information style while translating commands, scopes, hooks, validation, reload, and trust guidance to current Claude Code behavior.
- Documented in-session `/plugin` installation, copyable Agent-assisted installation, CLI scope control, the distinction between marketplace and installed-plugin updates, and `/reload-plugins`.
- Changed `commit-commands` to `2.0.0` and replaced immediate forced gone-branch cleanup with a plan → explicit confirmation → digest-validated apply protocol.
- Removed `ekko-plugin-scaffold` from the active marketplace catalog while retaining its directory as an explicitly unlisted historical layout example.
- Hardened validation with SHA-pinned GitHub Actions, exact Node.js/Python/Claude Code dependencies, catalog-derived active-plugin checks, Windows cleanup coverage, repository link/YAML/LF/mode checks, and a root `.gitattributes` policy.

### Fixed

- Removed locale-dependent `[gone]` parsing, regular-expression branch matching, whitespace-truncated worktree paths, unconditional `git worktree remove --force`, and branch deletion after worktree-removal failure from `clean_gone`.

- Fixed real Claude Code sessions writing `Model: unknown` when `CLAUDE_ENV_FILE` did not propagate `CLAUDE_COMMIT_COMMANDS_STATE_FILE`; the resolver now derives the isolated state path from `CLAUDE_CODE_SESSION_ID` as a safe fallback.
- Added the user's configured default `model` as the final fallback after transcript and SessionStart resolution; when all sources are unavailable, remove the attribution `Model:` line instead of writing `unknown`.
- Replaced embedded control bytes in the JavaScript validation regexes with explicit Unicode escapes so source files remain plain text.

## 0.1.0 - 2026-07-08

### Added

- Initial Claude Code marketplace scaffold.
- Marketplace catalog at `.claude-plugin/marketplace.json`.
- Temporary installable plugin scaffold named `ekko-plugin-scaffold`.
- Plugin manifest at `plugins/ekko-plugin-scaffold/.claude-plugin/plugin.json`.
- Placeholder directories for future skills, agents, hooks, and scripts under `plugins/ekko-plugin-scaffold/`.
- Marketplace-oriented README, license, privacy status, and contribution notes.
