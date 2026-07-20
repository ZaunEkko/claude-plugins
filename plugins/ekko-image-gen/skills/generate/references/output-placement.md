# Context-aware output placement

Select the output destination in the parent agent before starting image workers. Treat the project context as the source of truth rather than applying a universal asset folder.

## Decision hierarchy

1. **Explicit target.** Honor a directory, file path, or consuming module named by the user.
2. **Existing task target.** Reuse the directory already established by the current implementation task, design document, asset manifest, or prior conversation.
3. **Repository rules.** Follow `CLAUDE.md`, `AGENTS.md`, asset pipelines, import aliases, build rules, and naming conventions.
4. **Consumer proximity.** Place an asset where neighboring assets used by the same component, scene, character, article, or feature already live.
5. **Project convention.** Select an existing conventional directory that matches the asset role.
6. **Safe fallback.** Use `<project-root>/generated-images/` and state that no stronger signal was available.

Never overwrite an existing file. Prefer a stable semantic base name; let the runner add a collision suffix when necessary.

## Project signals

These are examples, not fixed routing rules. Prefer actual repository evidence over the table.

| Project/context | Common signals |
|---|---|
| Unity | `Assets/Art`, `Assets/Sprites`, `Assets/Textures`, `Assets/UI`, neighboring `.meta`-managed assets |
| Unreal | project `Content` conventions, source-art folders, import instructions |
| Godot | `assets`, `art`, `sprites`, `textures`, scene-adjacent resource folders |
| Other game projects | existing character, environment, UI, item, VFX, concept-art, or source-art hierarchy |
| Vue / React / Vite | current imports and whether assets belong in `src/assets`, `public/images`, feature-local folders, or generated static content |
| Next.js | `public`, feature-local assets, imported static images, metadata/OG image locations |
| Documentation | `docs/images`, `docs/assets`, article attachment directories, or the documentation generator's expected path |
| Design/content workspace | the current deliverable's attachments, figures, covers, or export directory |

## Autonomous multi-asset tasks

Let the parent agent create an asset inventory before delegation. Assign every worker:

- one explicit destination directory;
- one output base name;
- one job-specific prompt;
- shared art-direction constraints;
- acceptance criteria.

Allow different workers to target different directories when the project structure requires it. For example, a game task may place portraits under `Assets/Art/Characters`, item icons under `Assets/UI/Items`, and backgrounds under `Assets/Art/Backgrounds`.

Do not let workers independently reinterpret the global directory strategy. Workers may reject an invalid or missing target, but they should not move an asset to a guessed location.

## Single-command tasks

For a user who simply asks for one image:

- infer a useful destination from the current project;
- use `generated-images/` only when the image is not yet tied to a project feature;
- call `Read` on the saved file;
- return the absolute path as the durable result;
- after parent review, pass accepted paths to `${CLAUDE_PLUGIN_ROOT}/scripts/preview-image.mjs` and return `[打开图片](http://127.0.0.1:...)` links that terminal users can Ctrl/Cmd+click;
- state that the loopback links expire after 15 minutes while the absolute files remain;
- keep runner `fileUrl` and `directoryUrl` as host-dependent compatibility metadata rather than the primary action;
- for a follow-up request to open a previous result after expiry, create a fresh preview link from the accepted path without regenerating;
- never let an image worker start the preview server and never launch a browser, editor, or platform opener automatically.

## Ambiguity and safety

Ask one focused question only when two plausible destinations have materially different build or runtime behavior and project evidence cannot resolve the choice. Otherwise choose the strongest existing convention, report the decision, and proceed.

Do not write generated assets into dependency caches, build output, package-manager directories, plugin installation caches, or source-control internals such as `.git`.
