# Runner request and configuration

## User-local configuration

Read configuration from the first available source:

1. `EKKO_IMAGE_GEN_*` environment variables;
2. the JSON file named by `EKKO_IMAGE_GEN_CONFIG`;
3. `~/.claude/ekko-image-gen.local.json`.

Environment values override JSON values only when they contain a non-whitespace string; empty shell-template variables are ignored. A non-empty `EKKO_IMAGE_GEN_MODEL` temporarily replaces a persisted `models` list when `EKKO_IMAGE_GEN_MODELS` is not set. Plain HTTP API endpoints are accepted only for `localhost` or loopback hosts; non-local services must use HTTPS. Keep the API key outside the plugin repository. A normal installation only needs:

```json
{
  "baseUrl": "https://your-openai-compatible-service.example/v1",
  "apiKey": "replace-with-local-key"
}
```

All remaining fields are optional advanced overrides. Their defaults are shown here:

```json
{
  "models": [],
  "size": "1024x1024",
  "quality": "auto",
  "maxConcurrency": 4,
  "maxGlobalConcurrency": 4,
  "maxImagesPerRequest": 4,
  "timeoutMs": 240000,
  "queueTimeoutMs": 600000,
  "maxRetries": 1,
  "maxInputBytes": 26214400,
  "maxOutputBytes": 52428800
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
- `EKKO_IMAGE_GEN_MAX_OUTPUT_BYTES`
- `EKKO_IMAGE_GEN_RUNTIME_DIR`

The runner reads configuration on every invocation; editing the JSON file does not require a Claude Code restart.

`maxImagesPerRequest` is an optional provider capability ceiling from `1` to `4`, not the user's logical variant count. The default is `4`. When an upstream accepts a larger `n` but returns fewer items, the runner infers the effective response size and schedules bounded follow-up requests only for the remaining logical count. Set the field explicitly when the provider's limit is already known and the initial probe should be avoided.

Some OpenAI-compatible gateways translate Images API calls into a Responses API `image_generation` tool and reject `n` outright with a `400` naming the `n` parameter. The runner detects that rejection from the error `param` or message, retries the same upstream request with a single image, and caps every later request in the same run at one image per request. The job records the downgrade as a warning instead of failing.

`maxOutputBytes` limits each decoded base64 image and each generated-image URL download. The default is `52428800` bytes (50 MiB). URL responses are checked by `Content-Length` when available and otherwise streamed under the limit. Before JSON parsing, each Images API response is also streamed under a derived bound: base64 expansion of `maxOutputBytes` multiplied by that upstream request's image count, plus 64 KiB for metadata. Exceeding this bound returns `response_too_large` without retrying or switching models.

No model name is built into the runner, because every name is provider-defined and every generation of them expires. The chain is resolved per endpoint in this order:

1. the user's configured `models`;
2. the model remembered from the last successful run against that endpoint, when it still appears in the catalog;
3. the models the service itself declares as image-capable in `GET /v1/models`, newest `created` first.

Step 3 reads declared capability, never the model name: `architecture.output_modalities`, `output_modalities`, `modalities.output`, `model_info.mode`, `mode`, or `capabilities.image_generation`. Only output modality counts, since a vision chat model merely accepts image input. A catalog that declares no modality at all yields no candidates rather than a guess, and the job fails with `model_unresolved` carrying `details.availableModels`.

Names are compared in a normalized form, lowercased with a leading namespace segment and a trailing `-YYYY-MM-DD` snapshot removed, so a configured `gpt-image-2` matches a catalog entry of `openai/gpt-image-2`. The catalog's literal id is what gets sent.

`modelDiscovery` defaults to `true`; set it to `false` to skip the catalog request entirely and rely only on configured names. The catalog is cached per endpoint under `runtimeDir/catalog` for ten minutes, and discovery failure is never fatal.

The first job that resolves a model through the configured chain records it for the rest of that run, so later jobs start from the model the endpoint actually serves instead of repeating a failed probe per job. A job that names its own `model` or `models` keeps its requested order and is never reordered, which preserves a deliberate per-job quality-tier escalation.

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
| `images` | no | One local path, file URL, HTTP(S) URL, data URL, `{source,name}` object, or an array of those values. Presence selects image edit mode. |
| `referenceImages` | no | Scalar-or-array alias appended to `images`. |
| `outputDir` | recommended | Absolute or working-directory-relative destination. |
| `outputName` | recommended | Base name without extension. |
| `output` | no | Explicit file-like path; its directory and base name override the preceding fields. |
| `model` | no | Preferred model placed before configured fallbacks; use `strictModel: true` to disable fallback. |
| `models` | no | Exact ordered fallback chain for this job. |
| `strictModel` | no | With `model`, restrict execution to that exact model. |
| `size` | no | Exact `WIDTHxHEIGHT`, ratio such as `16:9`, or label such as `16:9(4k)`. |
| `aspectRatio` | no | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `9:16`, `16:9`, or `auto`. |
| `resolution` | no | `1k`, `2k`, `4k`, or `auto`; only combinations exposed by the service UI are accepted. |
| `quality` | no | `auto`, `low`, `medium`, `high`, `xhigh`, or `max`. `xhigh` and `max` are GPT Image 2.5 tiers; services that predate them reject the value upstream. |
| `extraParams` | no | Provider-specific request fields, merged over the configuration's `extraParams` and passed through untouched. See [Provider-specific fields](#provider-specific-fields). |
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

The API may accept a requested tier while returning different actual pixel dimensions. Some gateways ignore `size` completely, returning their own fixed dimensions and orientation no matter which preset or exact `WIDTHxHEIGHT` value is sent; on those services a portrait request can come back as a landscape image, and the only way to steer composition is the prompt. Read `width`, `height`, `requestedWidth`, `requestedHeight`, and `sizeMatched` from every saved file instead of assuming the upstream honored the exact dimensions.

Every saved file also reports `format`, the MIME type detected from its bytes, and its extension follows those bytes. A field passed through `extraParams` that asks for another format cannot change what a service actually returns.

SVG and animated GIF output are intentionally not supported. Only GPT Image 2.6 offers them, tested gateways refuse or silently downgrade them, and other providers do not offer them at all.

## Provider-specific fields

Services differ in which extra request fields they accept: one may support GPT Image 2.6 `complexity`, another a seed, a style preset, or nothing at all. The runner implements none of them. `extraParams` passes any such field through untouched, so a new provider option needs a configuration line rather than a plugin release.

By default nothing extra is sent and each service applies its own defaults; for GPT Image 2.6 that means `complexity` is `high`, the most careful planning. The plugin never lowers a quality-related field on its own.

Set a trade-off on the one job that needs it:

```json
{ "id": "draft-sketch", "prompt": "...", "extraParams": { "complexity": "low" } }
```

- Put `extraParams` in the user configuration only for a field every request to that endpoint genuinely needs, such as one the provider requires. A quality or speed trade-off placed there would pin every future image, including those that should get the service's best effort.
- A job field replaces a configuration field of the same name.
- The runner validates only the shape: an object with non-empty field names. Whether a service accepts a field is the service's decision, and a rejection surfaces as an ordinary upstream error.
- Fields the runner owns cannot be overridden: `model`, `prompt`, `n`, `size`, `quality`, `history_disabled`, `image`, and `image[]`. Use the dedicated job fields for those.
- Image edits send fields as multipart form values, so values there must be strings, numbers, or booleans. Text-to-image requests accept any JSON value.
- Results report the names that were sent in `extraParamNames`, never the values.

No extra field is sent unless one is configured, so a request without `extraParams` keeps the exact shape every service already accepts.

## API routing

- Jobs without references call `POST <baseUrl>/images/generations` with JSON.
- Jobs with references call `POST <baseUrl>/images/edits` with multipart uploads.
- A single edit reference uses the established `image` compatibility field; multiple references use repeated OpenAI-compatible `image[]` fields.
- Remote references are downloaded by the Claude Code host and uploaded as files. This makes host-local URLs usable even when the API runs inside a container.
- The standard request omits the legacy `response_format` field. GPT Image models return `b64_json` by default, and the runner also supports API responses containing an image URL.
- `timeoutMs` remains active through response-body consumption, not only until headers arrive.
- Images API JSON bodies are streamed under a per-request bound derived from `maxOutputBytes`, upstream request count, base64 expansion, and 64 KiB of metadata allowance before `JSON.parse` runs.
- Generated base64 and URL payloads must decode to PNG, JPEG, GIF, WebP, or BMP bytes before any output file is written.
- Generated base64 bytes and streamed URL downloads must stay within `maxOutputBytes`.

## Concurrency

`concurrency` controls independent jobs in one runner process. `maxGlobalConcurrency` uses atomic slot directories under `~/.claude/ekko-image-gen/runtime/slots`, so separate worker agents and separate Claude Code sessions share a bounded cross-process limit. Abandoned slots are removed after a conservative stale timeout.

Use one logical job with `count: 1-4` for variants of one prompt. The runner splits that count into serial upstream requests according to `maxImagesPerRequest`; every request still acquires its own global slot. Use multiple concurrent jobs for different prompts or assets.

If an upstream response returns fewer items than requested, the runner preserves those files, emits a count warning, and replaces the remaining request plan with bounded follow-up chunks inferred from the actual response. It never requests more than the original logical count. If a later request fails, or a later item in the same response cannot be decoded, downloaded, or written after earlier items were saved, the job becomes `partial` and returns every successful file path.

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

`path` and `directory` are the primary portable local results. `fileUrl` and `directoryUrl` are correctly encoded `file://` URIs for hosts that support local hyperlinks, but Ctrl/Cmd+click behavior depends on the Claude Code renderer and terminal host and is not guaranteed. `serviceUrl`, when present and reachable from the user host, is an ordinary HTTP(S) convenience link.

## Temporary clickable preview helper

Clickable preview URLs are a separate presentation step, not a generation request field. After the parent agent has inspected and accepted the final images, invoke the bundled helper with one to four paths:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/preview-image.mjs" <<'EKKO_IMAGE_PREVIEW'
{"paths":["D:\\game\\Assets\\UI\\Items\\health-potion.png"]}
EKKO_IMAGE_PREVIEW
```

The helper accepts one stdin JSON object containing only a `paths` array. It rejects command-line arguments, URIs, directories, final-component symbolic links, unsupported extensions, mismatched image signatures, Windows UNC/device/alternate-stream paths, and control or bidirectional formatting characters. It supports PNG, JPEG, GIF, WebP, and BMP.

The helper starts a detached HTTP server bound only to `127.0.0.1`. It serves only the validated files under a random 192-bit token, sends `no-store`, `nosniff`, CSP, and no-referrer headers, exposes no directory listing, and exits automatically after 15 minutes. It does not launch a browser, image viewer, or editor.

Successful startup returns:

```json
{
  "status": "ready",
  "pid": 12345,
  "expiresInSeconds": 900,
  "files": [
    {
      "path": "D:\\game\\Assets\\UI\\Items\\health-potion.png",
      "url": "http://127.0.0.1:43210/random-token/1/health-potion.png"
    }
  ]
}
```

Format each returned URL as `[打开图片](http://127.0.0.1:...)`. The user can Ctrl/Cmd+click the ordinary HTTP link; the plugin never opens it automatically. Exit code `1` returns `status: "failed"` with a structured code such as `invalid_request`, `invalid_path`, `path_not_found`, `not_regular_file`, `symlink_not_allowed`, `unsupported_image`, `image_too_large`, or `preview_start_failed`. Preview-link failure must be reported separately and must not change a successful generation result. Loopback URLs may not reach the user's browser when Claude Code runs on a different SSH/container/remote host, so always retain the absolute path.

Generation runner exit codes:

- `0`: every job succeeded;
- `2`: partial success;
- `1`: every job failed or the request/configuration was invalid.

Parse stdout even for exit code `2`; it contains all successful paths and individual errors. The runner never includes the API key in its JSON output.
