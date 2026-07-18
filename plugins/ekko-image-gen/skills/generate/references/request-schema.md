# Runner request and configuration

## User-local configuration

Read configuration from the first available source:

1. `EKKO_IMAGE_GEN_*` environment variables;
2. the JSON file named by `EKKO_IMAGE_GEN_CONFIG`;
3. `~/.claude/ekko-image-gen.local.json`.

Environment values override JSON values. Keep the API key outside the plugin repository.

```json
{
  "baseUrl": "http://localhost:3050/v1",
  "apiKey": "replace-with-local-key",
  "models": [
    "plus-codex-gpt-image-2",
    "codex-gpt-image-2",
    "gpt-image-2"
  ],
  "size": "1024x1024",
  "quality": "auto",
  "maxConcurrency": 4,
  "maxGlobalConcurrency": 4,
  "timeoutMs": 240000,
  "queueTimeoutMs": 600000,
  "maxRetries": 1,
  "maxInputBytes": 26214400
}
```

Supported environment variables:

- `EKKO_IMAGE_GEN_BASE_URL`
- `EKKO_IMAGE_GEN_API_KEY`
- `EKKO_IMAGE_GEN_MODELS` — comma-separated fallback order
- `EKKO_IMAGE_GEN_MODEL` — backward-compatible single-model override
- `EKKO_IMAGE_GEN_SIZE`
- `EKKO_IMAGE_GEN_ASPECT_RATIO`
- `EKKO_IMAGE_GEN_RESOLUTION`
- `EKKO_IMAGE_GEN_QUALITY`
- `EKKO_IMAGE_GEN_MAX_CONCURRENCY`
- `EKKO_IMAGE_GEN_MAX_GLOBAL_CONCURRENCY`
- `EKKO_IMAGE_GEN_TIMEOUT_MS`
- `EKKO_IMAGE_GEN_QUEUE_TIMEOUT_MS`
- `EKKO_IMAGE_GEN_MAX_RETRIES`
- `EKKO_IMAGE_GEN_MAX_INPUT_BYTES`
- `EKKO_IMAGE_GEN_RUNTIME_DIR`

The runner reads configuration on every invocation; editing the JSON file does not require a Claude Code restart.

## Input JSON

Pass JSON through stdin or use `--request <file>`.

```json
{
  "concurrency": 4,
  "jobs": [
    {
      "id": "inventory-potion",
      "prompt": "A readable red health potion inventory icon...",
      "images": [],
      "outputDir": "D:/game/Assets/UI/Items",
      "outputName": "health-potion",
      "models": ["plus-codex-gpt-image-2", "codex-gpt-image-2", "gpt-image-2"],
      "aspectRatio": "1:1",
      "resolution": "1k",
      "quality": "auto",
      "count": 1,
      "historyDisabled": true
    }
  ]
}
```

A single job object without `jobs` is accepted as shorthand.

### Job fields

| Field | Required | Notes |
|---|---:|---|
| `prompt` | yes | Non-empty generation or edit instruction. |
| `id` | no | Stable report ID; defaults to `image-job-N`. |
| `images` | no | Local paths, file URLs, HTTP(S) URLs, data URLs, or `{source,name}` objects. Presence selects image edit mode. |
| `referenceImages` | no | Alias appended to `images`. |
| `outputDir` | recommended | Absolute or working-directory-relative destination. |
| `outputName` | recommended | Base name without extension. |
| `output` | no | Explicit file-like path; its directory and base name override the preceding fields. |
| `model` | no | Preferred model placed before configured fallbacks; use `strictModel: true` to disable fallback. |
| `models` | no | Exact ordered fallback chain for this job. |
| `strictModel` | no | With `model`, restrict execution to that exact model. |
| `size` | no | Exact `WIDTHxHEIGHT`, ratio such as `16:9`, or label such as `16:9(4k)`. |
| `aspectRatio` | no | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `9:16`, `16:9`, or `auto`. |
| `resolution` | no | `1k`, `2k`, `4k`, or `auto`; only combinations exposed by the service UI are accepted. |
| `quality` | no | `auto`, `low`, `medium`, or `high`. |
| `count` / `n` | no | Images per request, `1-4`. |
| `historyDisabled` | no | Defaults to `true`. |

The runner validates uploaded bytes as PNG, JPEG, GIF, WebP, or BMP and refuses arbitrary files.

### UI-derived size presets

| Ratio/tier | API `size` |
|---|---|
| `1:1` / `1k` | `1024x1024` |
| `2:3` / `1k` | `1024x1536` |
| `3:2` / `1k` | `1536x1024` |
| `3:4` / `1k` | `1024x1365` |
| `4:3` / `1k` | `1365x1024` |
| `9:16` / `1k` | `1088x1920` |
| `16:9` / `1k` | `1920x1088` |
| `1:1` / `2k` | `2048x2048` |
| `16:9` / `2k` | `2560x1440` |
| `9:16` / `2k` | `1440x2560` |
| `16:9` / `4k` | `3840x2160` |
| `9:16` / `4k` | `2160x3840` |
| `auto` | `1024x1024` |

The API may accept a requested tier while returning different actual pixel dimensions. Read `width`, `height`, `requestedWidth`, `requestedHeight`, and `sizeMatched` from every saved file instead of assuming the upstream honored the exact dimensions.

## API routing

- Jobs without references call `POST <baseUrl>/images/generations` with JSON.
- Jobs with references call `POST <baseUrl>/images/edits` with multipart uploads.
- Remote references are downloaded by the Claude Code host and uploaded as files. This makes host-local URLs usable even when the API runs inside a container.
- The runner always requests `b64_json` for reliable local persistence and also preserves any service URL returned by the API.

## Concurrency

`concurrency` controls jobs in one runner process. `maxGlobalConcurrency` uses atomic slot directories under `~/.claude/ekko-image-gen/runtime/slots`, so separate worker agents and separate Claude Code sessions share a bounded cross-process limit. Abandoned slots are removed after a conservative stale timeout.

Use one request with `count: 1-4` for variants of one prompt. Use multiple concurrent jobs for different prompts or assets.

## Output JSON

```json
{
  "status": "ok",
  "summary": {
    "total": 1,
    "succeeded": 1,
    "failed": 0,
    "durationMs": 36000,
    "concurrency": 1,
    "globalConcurrency": 4
  },
  "jobs": [
    {
      "id": "inventory-potion",
      "status": "ok",
      "mode": "generate",
      "files": [
        {
          "path": "D:\\game\\Assets\\UI\\Items\\health-potion.png",
          "fileUrl": "file:///D:/game/Assets/UI/Items/health-potion.png",
          "directory": "D:\\game\\Assets\\UI\\Items",
          "directoryUrl": "file:///D:/game/Assets/UI/Items/",
          "serviceUrl": "http://localhost:3050/images/...png",
          "revisedPrompt": null,
          "bytes": 900000,
          "width": 1024,
          "height": 1024,
          "requestedWidth": 1024,
          "requestedHeight": 1024,
          "sizeMatched": true
        }
      ]
    }
  ]
}
```

Exit codes:

- `0`: every job succeeded;
- `2`: partial success;
- `1`: every job failed or the request/configuration was invalid.

Parse stdout even for exit code `2`; it contains all successful paths and individual errors. The runner never includes the API key in its JSON output.
