# Runner request and configuration

## User-local configuration

Read configuration from the first available source:

1. `EKKO_IMAGE_GEN_*` environment variables;
2. the JSON file named by `EKKO_IMAGE_GEN_CONFIG`;
3. `~/.claude/ekko-image-gen.local.json`.

Environment values override JSON values. A non-empty `EKKO_IMAGE_GEN_MODEL` temporarily replaces a persisted `models` list when `EKKO_IMAGE_GEN_MODELS` is not set. Keep the API key outside the plugin repository. A normal installation only needs:

```json
{
  "baseUrl": "https://your-openai-compatible-service.example/v1",
  "apiKey": "replace-with-local-key"
}
```

All remaining fields are optional advanced overrides. Their defaults are shown here:

```json
{
  "models": ["gpt-image-2"],
  "size": "1024x1024",
  "quality": "auto",
  "maxConcurrency": 4,
  "maxGlobalConcurrency": 4,
  "maxImagesPerRequest": 4,
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
- `EKKO_IMAGE_GEN_MAX_IMAGES_PER_REQUEST`
- `EKKO_IMAGE_GEN_TIMEOUT_MS`
- `EKKO_IMAGE_GEN_QUEUE_TIMEOUT_MS`
- `EKKO_IMAGE_GEN_MAX_RETRIES`
- `EKKO_IMAGE_GEN_MAX_INPUT_BYTES`
- `EKKO_IMAGE_GEN_RUNTIME_DIR`

The runner reads configuration on every invocation; editing the JSON file does not require a Claude Code restart.

`maxImagesPerRequest` is an optional provider capability ceiling from `1` to `4`, not the user's logical variant count. The default is `4`. When an upstream accepts a larger `n` but returns fewer items, the runner infers the effective response size and schedules bounded follow-up requests only for the remaining logical count. Set the field explicitly when the provider's limit is already known and the initial probe should be avoided.

Model names are provider-defined even when the HTTP API is OpenAI-compatible. The repository default is `gpt-image-2`, so normal installations omit `models`; configure an ordered list only when the endpoint uses different names or needs explicit fallback.

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
      "aspectRatio": "1:1",
      "resolution": "1k",
      "quality": "auto",
      "count": 1
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
| `count` / `n` | no | Logical images requested for this job, `1-4`; the runner may split them across upstream requests. |
| `historyDisabled` | no | Provider-specific generation extension. When omitted, the runner does not send `history_disabled`; set a boolean only for services that document support. |

The runner validates uploaded bytes as PNG, JPEG, GIF, WebP, or BMP and refuses arbitrary files.

### UI-derived size presets

| Ratio/tier | API `size` |
|---|---|
| `1:1` / `1k` | `1024x1024` |
| `2:3` / `1k` | `1024x1536` |
| `3:2` / `1k` | `1536x1024` |
| `3:4` / `1k` | `1024x1360` |
| `4:3` / `1k` | `1360x1024` |
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
- A single edit reference uses the established `image` compatibility field; multiple references use repeated OpenAI-compatible `image[]` fields.
- Remote references are downloaded by the Claude Code host and uploaded as files. This makes host-local URLs usable even when the API runs inside a container.
- The standard request omits the legacy `response_format` field. GPT Image models return `b64_json` by default, and the runner also supports API responses containing an image URL.

## Concurrency

`concurrency` controls independent jobs in one runner process. `maxGlobalConcurrency` uses atomic slot directories under `~/.claude/ekko-image-gen/runtime/slots`, so separate worker agents and separate Claude Code sessions share a bounded cross-process limit. Abandoned slots are removed after a conservative stale timeout.

Use one logical job with `count: 1-4` for variants of one prompt. The runner splits that count into serial upstream requests according to `maxImagesPerRequest`; every request still acquires its own global slot. Use multiple concurrent jobs for different prompts or assets.

If an upstream response returns fewer items than requested, the runner preserves those files, emits a count warning, and replaces the remaining request plan with bounded follow-up chunks inferred from the actual response. It never requests more than the original logical count. If a later request fails, earlier files remain available in a job with `status: "partial"`.

## Output JSON

```json
{
  "status": "ok",
  "summary": {
    "total": 1,
    "succeeded": 1,
    "partial": 0,
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
      "model": "plus-codex-gpt-image-2",
      "requestedCount": 1,
      "returnedCount": 1,
      "requestCount": 1,
      "countSplitUsed": false,
      "usage": null,
      "usageByRequest": [
        {
          "requestIndex": 1,
          "requestedCount": 1,
          "returnedCount": 1,
          "serviceReturnedCount": 1,
          "usage": null
        }
      ],
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
