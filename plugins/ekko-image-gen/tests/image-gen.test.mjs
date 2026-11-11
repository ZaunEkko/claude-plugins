import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  declaredImageModels,
  imageDimensions,
  loadConfig,
  normalizeBaseUrl,
  listModels,
  mapModelsToCatalog,
  normalizeModelName,
  normalizeRequest,
  resolveSize,
  runJobs,
  sanitizeBaseName,
} from "../scripts/image-gen.mjs";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlB7t8AAAAASUVORK5CYII=";
const PNG_BYTES = Buffer.from(PNG_BASE64, "base64");

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ekko-image-gen-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function startServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return `http://127.0.0.1:${address.port}/v1`;
}

function config(baseUrl, runtimeDir, overrides = {}) {
  return {
    baseUrl,
    apiKey: "test-secret-key",
    models: ["gpt-image-2"],
    model: "gpt-image-2",
    modelDiscovery: false,
    size: "1024x1024",
    quality: "low",
    maxConcurrency: 4,
    maxGlobalConcurrency: 4,
    timeoutMs: 5000,
    queueTimeoutMs: 5000,
    maxRetries: 0,
    maxInputBytes: 1024 * 1024,
    runtimeDir,
    ...overrides,
  };
}

function successResponse(response, extra = {}) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({
    created: 1,
    data: [{
      b64_json: PNG_BASE64,
      url: "http://localhost:3050/images/test.png",
      revised_prompt: null,
    }],
    usage: { images: 1 },
    ...extra,
  }));
}

test("normalizes service and output names", () => {
  assert.equal(normalizeBaseUrl("http://localhost:3050"), "http://localhost:3050/v1");
  assert.equal(normalizeBaseUrl("http://localhost:3050/v1/"), "http://localhost:3050/v1");
  assert.equal(normalizeBaseUrl("http://127.0.0.1:3050/v1"), "http://127.0.0.1:3050/v1");
  assert.equal(normalizeBaseUrl("http://[::1]:3050/v1"), "http://[::1]:3050/v1");
  assert.equal(normalizeBaseUrl("https://images.example.test/v1"), "https://images.example.test/v1");
  assert.throws(
    () => normalizeBaseUrl("http://images.example.test/v1"),
    /must use HTTPS unless the host is localhost or loopback/u,
  );
  assert.equal(sanitizeBaseName(" 角色：头像 / 一号 "), "角色-头像-一号");
});

test("resolves the image UI aspect-ratio and resolution presets", () => {
  assert.deepEqual(resolveSize({ aspectRatio: "2:3", resolution: "1k" }), {
    width: 1024,
    height: 1536,
    size: "1024x1536",
    aspectRatio: "2:3",
    resolution: "1k",
    preset: "2:3@1k",
  });
  assert.equal(resolveSize("16:9(4k)").size, "3840x2160");
  assert.equal(resolveSize({ size: "9:16", resolution: "2k" }).size, "1440x2560");
  assert.equal(resolveSize({ aspectRatio: "3:4", resolution: "1k" }).size, "1024x1360");
  assert.equal(resolveSize({ aspectRatio: "4:3", resolution: "1k" }).size, "1360x1024");
  assert.throws(() => resolveSize({ aspectRatio: "2:3", resolution: "4k" }), /not exposed/u);
  assert.deepEqual(imageDimensions(PNG_BYTES), { width: 1, height: 1 });
});

test("uses load-time plugin root placeholders for runner commands", async () => {
  const componentFiles = [
    new URL("../skills/generate/SKILL.md", import.meta.url),
    new URL("../agents/image-worker.md", import.meta.url),
  ];

  for (const componentFile of componentFiles) {
    const content = await fs.readFile(componentFile, "utf8");
    assert.match(content, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/image-gen\.mjs"/u);
    assert.doesNotMatch(content, /node "\$CLAUDE_PLUGIN_ROOT\//u);
  }
});

test("documents temporary loopback previews without automatic GUI launch", async () => {
  const skill = await fs.readFile(new URL("../skills/generate/SKILL.md", import.meta.url), "utf8");
  const worker = await fs.readFile(new URL("../agents/image-worker.md", import.meta.url), "utf8");
  const placement = await fs.readFile(
    new URL("../skills/generate/references/output-placement.md", import.meta.url),
    "utf8",
  );
  const readme = await fs.readFile(new URL("../README.md", import.meta.url), "utf8");
  const manifest = JSON.parse(
    await fs.readFile(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8"),
  );
  const marketplace = JSON.parse(
    await fs.readFile(new URL("../../../.claude-plugin/marketplace.json", import.meta.url), "utf8"),
  );
  const publicDocs = await Promise.all([
    "../../../README.md",
    "../../../docs/README.md",
    "../../../docs/ekko-image-gen/README.md",
    "../../../i18n/en/README.md",
  ].map((relativePath) => fs.readFile(new URL(relativePath, import.meta.url), "utf8")));
  const marketplaceEntry = marketplace.plugins.find(({ name }) => name === "ekko-image-gen");
  const combinedGuidance = [skill, worker, placement, readme, ...publicDocs].join("\n");

  assert.equal(manifest.version, "0.1.17");
  assert.match(manifest.description, /temporary loopback HTTP preview links/u);
  assert.ok(marketplaceEntry);
  assert.match(marketplaceEntry.description, /temporary loopback HTTP preview links/u);
  assert.match(skill, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/preview-image\.mjs"/u);
  assert.match(skill, /must not launch a browser|never launch a GUI/u);
  assert.match(skill, /after 15 minutes/u);
  assert.match(worker, /Never invoke `scripts\/preview-image\.mjs`/u);
  assert.doesNotMatch(worker, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/preview-image\.mjs"/u);
  assert.match(placement, /\[打开图片\]\(http:\/\/127\.0\.0\.1:/u);
  assert.match(readme, /不会主动弹出任何应用/u);
  assert.match(publicDocs[2], /15 分钟/u);
  assert.doesNotMatch(combinedGuidance, /scripts\/open-image\.mjs/u);
  assert.doesNotMatch(combinedGuidance, /terminal users can normally use Ctrl\+click/u);
  assert.doesNotMatch(combinedGuidance, /Ctrl\+click normally opens/u);
  assert.doesNotMatch(combinedGuidance, /Windows 终端通常(?:可通过|使用) Ctrl\+鼠标左键/u);
});

test("inherits configured preset components for partial job size overrides", () => {
  const configured = config("http://localhost:3050/v1", os.tmpdir(), {
    size: "3840x2160",
    aspectRatio: "16:9",
    resolution: "4k",
  });
  const { jobs } = normalizeRequest({
    jobs: [
      { id: "ratio", prompt: "ratio", aspectRatio: "9:16" },
      { id: "resolution", prompt: "resolution", resolution: "2k" },
      { id: "label", prompt: "label", size: "9:16" },
      { id: "default", prompt: "default" },
      { id: "auto", prompt: "auto", aspectRatio: "auto" },
    ],
  }, configured);

  assert.deepEqual(
    jobs.map(({ size, aspectRatio, resolution }) => ({ size, aspectRatio, resolution })),
    [
      { size: "2160x3840", aspectRatio: "9:16", resolution: "4k" },
      { size: "2560x1440", aspectRatio: "16:9", resolution: "2k" },
      { size: "2160x3840", aspectRatio: "9:16", resolution: "4k" },
      { size: "3840x2160", aspectRatio: "16:9", resolution: "4k" },
      { size: "1024x1024", aspectRatio: "auto", resolution: "auto" },
    ],
  );

  const autoConfigured = config("http://localhost:3050/v1", os.tmpdir(), {
    size: "1024x1024",
    aspectRatio: "auto",
    resolution: "auto",
  });
  const autoJobs = normalizeRequest({
    jobs: [
      { id: "auto-ratio", prompt: "auto ratio", aspectRatio: "16:9" },
      { id: "auto-resolution", prompt: "auto resolution", resolution: "2k" },
    ],
  }, autoConfigured).jobs;
  assert.deepEqual(
    autoJobs.map(({ size, aspectRatio, resolution }) => ({ size, aspectRatio, resolution })),
    [
      { size: "1920x1088", aspectRatio: "16:9", resolution: "1k" },
      { size: "2048x2048", aspectRatio: "1:1", resolution: "2k" },
    ],
  );
});

test("loads user config and applies environment overrides", async (t) => {
  const directory = await temporaryDirectory(t);
  const configPath = path.join(directory, "config.json");
  await fs.writeFile(configPath, JSON.stringify({
    baseUrl: "http://localhost:3050/v1",
    apiKey: "file-key",
    maxConcurrency: 2,
    maxImagesPerRequest: 2,
    maxOutputBytes: 4096,
  }));
  const loaded = await loadConfig({
    configPath,
    homeDir: directory,
    env: {
      EKKO_IMAGE_GEN_API_KEY: "environment-key",
      EKKO_IMAGE_GEN_QUALITY: "high",
      EKKO_IMAGE_GEN_MAX_IMAGES_PER_REQUEST: "1",
      EKKO_IMAGE_GEN_MAX_OUTPUT_BYTES: "2048",
    },
  });
  assert.equal(loaded.apiKey, "environment-key");
  assert.equal(loaded.quality, "high");
  assert.equal(loaded.maxConcurrency, 2);
  assert.equal(loaded.maxImagesPerRequest, 1);
  assert.equal(loaded.maxOutputBytes, 2048);
  assert.deepEqual(loaded.models, []);

  const emptyOverrideLoaded = await loadConfig({
    configPath,
    homeDir: directory,
    env: {
      EKKO_IMAGE_GEN_BASE_URL: " ",
      EKKO_IMAGE_GEN_API_KEY: "",
      EKKO_IMAGE_GEN_QUALITY: " ",
      EKKO_IMAGE_GEN_MAX_OUTPUT_BYTES: "",
    },
  });
  assert.equal(emptyOverrideLoaded.baseUrl, "http://localhost:3050/v1");
  assert.equal(emptyOverrideLoaded.apiKey, "file-key");
  assert.equal(emptyOverrideLoaded.quality, "auto");
  assert.equal(emptyOverrideLoaded.maxOutputBytes, 4096);

  const defaultConfigDirectory = path.join(directory, ".claude");
  await fs.mkdir(defaultConfigDirectory, { recursive: true });
  await fs.copyFile(configPath, path.join(defaultConfigDirectory, "ekko-image-gen.local.json"));
  const emptyConfigPathLoaded = await loadConfig({
    homeDir: directory,
    env: { EKKO_IMAGE_GEN_CONFIG: "" },
  });
  assert.equal(emptyConfigPathLoaded.apiKey, "file-key");
  assert.equal(emptyConfigPathLoaded.maxOutputBytes, 4096);
});

test("lets a single-model environment override replace a persisted model list", async (t) => {
  const directory = await temporaryDirectory(t);
  const configPath = path.join(directory, "config.json");
  await fs.writeFile(configPath, JSON.stringify({
    baseUrl: "https://images.example.test/v1",
    apiKey: "file-key",
    models: ["persisted-primary", "persisted-fallback"],
  }));

  const loaded = await loadConfig({
    configPath,
    homeDir: directory,
    env: { EKKO_IMAGE_GEN_MODEL: "temporary-model" },
  });

  assert.deepEqual(loaded.models, ["temporary-model"]);

  const pluralLoaded = await loadConfig({
    configPath,
    homeDir: directory,
    env: {
      EKKO_IMAGE_GEN_MODELS: "temporary-primary,temporary-fallback",
      EKKO_IMAGE_GEN_MODEL: "ignored-single-model",
    },
  });
  assert.deepEqual(pluralLoaded.models, ["temporary-primary", "temporary-fallback"]);
});

test("uses public defaults when configuration contains only endpoint and key", async (t) => {
  const directory = await temporaryDirectory(t);
  const configPath = path.join(directory, "config.json");
  await fs.writeFile(configPath, JSON.stringify({
    baseUrl: "https://images.example.test/v1",
    apiKey: "file-key",
  }));

  const loaded = await loadConfig({ configPath, homeDir: directory, env: {} });

  assert.equal(loaded.baseUrl, "https://images.example.test/v1");
  assert.deepEqual(loaded.models, []);
  assert.equal(loaded.modelDiscovery, true);
  assert.equal(loaded.maxImagesPerRequest, 4);
  assert.equal(loaded.maxOutputBytes, 50 * 1024 * 1024);
});

test("normalizes a single job and preserves an explicit output target", () => {
  const normalized = normalizeRequest({
    id: "logo",
    prompt: "A logo",
    images: "first-reference.png",
    referenceImages: { source: "second-reference.png", name: "secondary" },
    output: "assets/generated/logo.png",
  }, config("http://localhost:3050/v1", path.resolve("runtime")), {
    cwd: path.resolve("project"),
  });
  assert.equal(normalized.jobs.length, 1);
  assert.equal(normalized.jobs[0].outputName, "logo");
  assert.equal(normalized.jobs[0].outputDir, path.resolve("project/assets/generated"));
  assert.deepEqual(normalized.jobs[0].images, [
    { source: "first-reference.png", name: null },
    { source: "second-reference.png", name: "secondary" },
  ]);
  assert.equal(normalized.jobs[0].historyDisabled, null);
  assert.throws(
    () => normalizeRequest({ prompt: "A logo", historyDisabled: "yes" }, config("http://localhost:3050/v1", path.resolve("runtime"))),
    /historyDisabled must be a boolean/u,
  );
});

test("generates an image, saves it without overwriting, and returns local file URLs", async (t) => {
  const directory = await temporaryDirectory(t);
  let requestPath = null;
  let authorization = null;
  let requestBody = null;
  const baseUrl = await startServer(t, async (request, response) => {
    requestPath = request.url;
    authorization = request.headers.authorization;
    requestBody = JSON.parse((await readBody(request)).toString("utf8"));
    successResponse(response);
  });

  const outputDir = path.join(directory, "assets", "images");
  const first = await runJobs({
    id: "blue-icon",
    prompt: "A blue icon",
    outputDir,
    outputName: "blue-icon",
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime")),
  });
  const second = await runJobs({
    id: "blue-icon",
    prompt: "A blue icon",
    outputDir,
    outputName: "blue-icon",
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime")),
  });

  assert.equal(first.status, "ok");
  assert.equal(requestPath, "/v1/images/generations");
  assert.equal(authorization, "Bearer test-secret-key");
  assert.equal(requestBody.prompt, "A blue icon");
  assert.equal("response_format" in requestBody, false);
  assert.equal("history_disabled" in requestBody, false);
  assert.equal(await fs.readFile(first.jobs[0].files[0].path, "base64"), PNG_BASE64);
  assert.equal(first.jobs[0].files[0].width, 1);
  assert.equal(first.jobs[0].files[0].height, 1);
  assert.equal(first.jobs[0].files[0].sizeMatched, false);
  assert.match(first.jobs[0].warnings[0], /service returned 1x1/u);
  assert.match(first.jobs[0].files[0].fileUrl, /^file:\/\//u);
  assert.match(first.jobs[0].files[0].directoryUrl, /^file:\/\//u);
  assert.notEqual(first.jobs[0].files[0].path, second.jobs[0].files[0].path);
});

test("keeps request timeouts active while reading response bodies", async (t) => {
  const directory = await temporaryDirectory(t);
  const baseUrl = await startServer(t, async (request, response) => {
    await readBody(request);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.flushHeaders();
    response.write('{"data":[');
  });
  const startedAt = Date.now();

  const result = await runJobs({
    id: "stalled-response",
    prompt: "A response that never finishes",
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      timeoutMs: 5000,
      maxRetries: 0,
    }),
  });

  assert.equal(result.status, "error");
  assert.equal(result.jobs[0].error.code, "request_timeout");
  assert.ok(Date.now() - startedAt < 7000);
});

test("stops oversized chunked Images API JSON before full buffering", async (t) => {
  const directory = await temporaryDirectory(t);
  const prefix = Buffer.from('{"data":[{"b64_json":"', "utf8");
  const chunk = Buffer.alloc(1024, 0x41);
  const plannedChunks = 100;
  let requestCount = 0;
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const baseUrl = await startServer(t, async (request, response) => {
    requestCount += 1;
    await readBody(request);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write(prefix);
    let sentChunks = 0;
    const timer = setInterval(() => {
      sentChunks += 1;
      response.write(chunk);
      if (sentChunks === plannedChunks) {
        clearInterval(timer);
        response.end('"}]}');
      }
    }, 1);
    response.on("close", () => {
      clearInterval(timer);
      resolveClosed({
        sentBytes: prefix.length + sentChunks * chunk.length,
        plannedBytes: prefix.length + plannedChunks * chunk.length + 4,
      });
    });
  });

  const result = await runJobs({
    id: "oversized-json-response",
    prompt: "Exercise the JSON response limit",
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      models: ["primary-model", "fallback-model"],
      model: undefined,
      maxOutputBytes: 1024,
      maxRetries: 2,
    }),
  });

  let timeout;
  const closeReport = await Promise.race([
    closed,
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve(null), 2000);
    }),
  ]);
  clearTimeout(timeout);

  assert.equal(result.status, "error");
  assert.equal(result.jobs[0].error.code, "response_too_large");
  assert.equal(requestCount, 1);
  assert.deepEqual(
    result.jobs[0].error.details.modelAttempts.map((attempt) => attempt.model),
    ["primary-model"],
  );
  assert.ok(closeReport, "expected the oversized JSON stream to close");
  assert.ok(closeReport.sentBytes < closeReport.plannedBytes, JSON.stringify(closeReport));
});

test("sends the provider history extension only when explicitly requested", async (t) => {
  const directory = await temporaryDirectory(t);
  let requestBody = null;
  const baseUrl = await startServer(t, async (request, response) => {
    requestBody = JSON.parse((await readBody(request)).toString("utf8"));
    successResponse(response);
  });

  const result = await runJobs({
    id: "history-extension",
    prompt: "A private generation",
    historyDisabled: true,
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime")),
  });

  assert.equal(result.status, "ok");
  assert.equal(requestBody.history_disabled, true);
});

test("rejects successful responses with non-image base64 or URL payloads", async (t) => {
  const directory = await temporaryDirectory(t);
  const invalidBase64 = Buffer.from("not an image", "utf8").toString("base64");
  const baseUrl = await startServer(t, async (request, response) => {
    if (request.url === "/generated.txt") {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("not an image");
      return;
    }
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    const data = body.prompt === "bad-base64"
      ? [{ b64_json: invalidBase64 }]
      : [{ url: `http://${request.headers.host}/generated.txt` }];
    successResponse(response, { data });
  });

  const result = await runJobs({
    concurrency: 2,
    jobs: [
      {
        id: "bad-base64",
        prompt: "bad-base64",
        outputDir: path.join(directory, "base64-output"),
      },
      {
        id: "bad-url",
        prompt: "bad-url",
        outputDir: path.join(directory, "url-output"),
      },
    ],
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime")),
  });

  assert.equal(result.status, "error");
  assert.equal(result.summary.failed, 2);
  assert.deepEqual(result.jobs.map((job) => job.error.code), [
    "invalid_response",
    "invalid_response",
  ]);
});

test("bounds generated base64 and URL payloads with maxOutputBytes", async (t) => {
  const directory = await temporaryDirectory(t);
  const oversizedBytes = Buffer.concat([PNG_BYTES, Buffer.alloc(2048)]);
  const baseUrl = await startServer(t, async (request, response) => {
    if (request.url === "/oversized.png") {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.write(PNG_BYTES);
      response.end(Buffer.alloc(2048));
      return;
    }
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    const data = body.prompt === "oversized-base64"
      ? [{ b64_json: oversizedBytes.toString("base64") }]
      : [{ url: `http://${request.headers.host}/oversized.png` }];
    successResponse(response, { data });
  });

  const result = await runJobs({
    concurrency: 2,
    jobs: [
      {
        id: "oversized-base64",
        prompt: "oversized-base64",
        outputDir: path.join(directory, "base64-output"),
      },
      {
        id: "oversized-url",
        prompt: "oversized-url",
        outputDir: path.join(directory, "url-output"),
      },
    ],
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      maxOutputBytes: 1024,
    }),
  });

  assert.equal(result.status, "error");
  assert.equal(result.summary.failed, 2);
  assert.deepEqual(result.jobs.map((job) => job.error.code), [
    "image_too_large",
    "image_too_large",
  ]);
});

test("reports files saved before a later response item fails", async (t) => {
  const directory = await temporaryDirectory(t);
  const outputDir = path.join(directory, "output");
  const invalidBase64 = Buffer.from("not an image", "utf8").toString("base64");
  const baseUrl = await startServer(t, async (request, response) => {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    assert.equal(body.n, 2);
    successResponse(response, {
      data: [
        { b64_json: PNG_BASE64 },
        { b64_json: invalidBase64 },
      ],
      usage: { images: 2 },
    });
  });

  const result = await runJobs({
    id: "same-response-partial",
    prompt: "Return one valid and one invalid item",
    count: 2,
    outputDir,
    outputName: "same-response-partial",
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      maxImagesPerRequest: 4,
    }),
  });

  assert.equal(result.status, "partial");
  assert.equal(result.summary.partial, 1);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.jobs[0].status, "partial");
  assert.equal(result.jobs[0].returnedCount, 1);
  assert.equal(result.jobs[0].requestCount, 1);
  assert.equal(result.jobs[0].countSplitUsed, false);
  assert.equal(result.jobs[0].files.length, 1);
  assert.equal(path.basename(result.jobs[0].files[0].path), "same-response-partial-1.png");
  assert.equal((await fs.stat(result.jobs[0].files[0].path)).isFile(), true);
  assert.deepEqual(result.jobs[0].usageByRequest[0], {
    requestIndex: 1,
    requestedCount: 2,
    returnedCount: 1,
    serviceReturnedCount: 2,
    usage: { images: 2 },
  });
  assert.equal(result.jobs[0].error.code, "invalid_response");
  assert.equal(result.jobs[0].error.details.requestIndex, 1);
  assert.equal(result.jobs[0].error.details.responseItemIndex, 2);
  assert.equal(result.jobs[0].error.details.outputIndex, 2);
  assert.match(result.jobs[0].warnings.join("\n"), /Saved 1 image.*item 2 failed/u);
});

test("uploads a scalar local reference with multipart form data", async (t) => {
  const directory = await temporaryDirectory(t);
  const referencePath = path.join(directory, "reference.png");
  await fs.writeFile(referencePath, PNG_BYTES);
  let contentType = null;
  let multipartBody = null;
  const baseUrl = await startServer(t, async (request, response) => {
    contentType = request.headers["content-type"];
    multipartBody = (await readBody(request)).toString("latin1");
    assert.equal(request.url, "/v1/images/edits");
    successResponse(response);
  });

  const result = await runJobs({
    id: "edited-icon",
    prompt: "Turn it red",
    images: referencePath,
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime")),
  });

  assert.equal(result.status, "ok");
  assert.equal(result.jobs[0].mode, "edit");
  assert.match(contentType, /^multipart\/form-data; boundary=/u);
  assert.match(multipartBody, /name="image"; filename="reference.png"/u);
  assert.match(multipartBody, /name="prompt"/u);
  assert.match(multipartBody, /Turn it red/u);
  assert.doesNotMatch(multipartBody, /name="response_format"/u);
});

test("uploads multiple references with multipart array fields", async (t) => {
  const directory = await temporaryDirectory(t);
  const firstReference = path.join(directory, "first-reference.png");
  const secondReference = path.join(directory, "second-reference.png");
  await Promise.all([
    fs.writeFile(firstReference, PNG_BYTES),
    fs.writeFile(secondReference, PNG_BYTES),
  ]);
  let multipartBody = null;
  const baseUrl = await startServer(t, async (request, response) => {
    multipartBody = (await readBody(request)).toString("latin1");
    successResponse(response);
  });

  const result = await runJobs({
    id: "multi-reference-edit",
    prompt: "Combine both references",
    images: [firstReference, secondReference],
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime")),
  });

  assert.equal(result.status, "ok");
  assert.match(multipartBody, /name="image\[\]"; filename="first-reference.png"/u);
  assert.match(multipartBody, /name="image\[\]"; filename="second-reference.png"/u);
  assert.doesNotMatch(multipartBody, /name="image"; filename=/u);
});

test("stops chunked remote references at maxInputBytes", async (t) => {
  const directory = await temporaryDirectory(t);
  let apiRequests = 0;
  const baseUrl = await startServer(t, async (request, response) => {
    if (request.url === "/reference.png") {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.write(PNG_BYTES);
      response.end(Buffer.alloc(2048));
      return;
    }
    apiRequests += 1;
    await readBody(request);
    successResponse(response);
  });
  const referenceUrl = `${baseUrl.replace(/\/v1$/u, "")}/reference.png`;

  const result = await runJobs({
    id: "oversized-remote-reference",
    prompt: "Edit this image",
    images: [referenceUrl],
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      maxInputBytes: 1024,
    }),
  });

  assert.equal(result.status, "error");
  assert.equal(result.jobs[0].error.code, "image_too_large");
  assert.equal(apiRequests, 0);
});

test("enforces the shared global concurrency limit", async (t) => {
  const directory = await temporaryDirectory(t);
  let active = 0;
  let peak = 0;
  const baseUrl = await startServer(t, async (request, response) => {
    await readBody(request);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 80));
    active -= 1;
    successResponse(response);
  });

  const jobs = Array.from({ length: 4 }, (_, index) => ({
    id: `asset-${index + 1}`,
    prompt: `Asset ${index + 1}`,
    outputDir: path.join(directory, "output"),
  }));
  const result = await runJobs({ jobs, concurrency: 4 }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      maxConcurrency: 4,
      maxGlobalConcurrency: 1,
    }),
  });

  assert.equal(result.status, "ok", JSON.stringify(result, null, 2));
  assert.equal(result.summary.succeeded, 4);
  assert.equal(peak, 1);
});

test("falls back through the configured model priority after an upstream model failure", async (t) => {
  const directory = await temporaryDirectory(t);
  const seenModels = [];
  const baseUrl = await startServer(t, async (request, response) => {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    seenModels.push(body.model);
    if (body.model === "plus-codex-gpt-image-2") {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        error: { code: "upstream_error", message: "preferred model temporarily failed" },
      }));
      return;
    }
    successResponse(response);
  });

  const result = await runJobs({
    id: "fallback-model",
    prompt: "A fallback test",
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      models: ["plus-codex-gpt-image-2", "codex-gpt-image-2", "gpt-image-2"],
      model: undefined,
      maxRetries: 0,
    }),
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(seenModels, ["plus-codex-gpt-image-2", "codex-gpt-image-2"]);
  assert.equal(result.jobs[0].model, "codex-gpt-image-2");
  assert.equal(result.jobs[0].fallbackUsed, true);
  assert.deepEqual(result.jobs[0].modelAttempts.map((attempt) => attempt.status), ["error", "ok"]);
});

test("falls back on explicit model client errors", async (t) => {
  const directory = await temporaryDirectory(t);
  const seenModels = [];
  const baseUrl = await startServer(t, async (request, response) => {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    seenModels.push(body.model);
    if (body.model === "primary-model") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        error: { code: "model_not_found", message: "The requested model does not exist" },
      }));
      return;
    }
    successResponse(response);
  });

  const result = await runJobs({
    id: "client-model-fallback",
    prompt: "Use the available model",
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      models: ["primary-model", "fallback-model"],
      model: undefined,
      maxRetries: 0,
    }),
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(seenModels, ["primary-model", "fallback-model"]);
  assert.equal(result.jobs[0].model, "fallback-model");
  assert.equal(result.jobs[0].fallbackUsed, true);
});

test("does not fall back on policy or parameter errors that mention a model", async (t) => {
  const directory = await temporaryDirectory(t);
  const seenRequests = [];
  const failures = new Map([
    ["policy", {
      status: 400,
      code: "content_policy_violation",
      message: "The model is unavailable for this content under the content policy",
    }],
    ["size", {
      status: 422,
      code: "invalid_size",
      message: "The model is unsupported for the requested size",
    }],
  ]);
  const baseUrl = await startServer(t, async (request, response) => {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    seenRequests.push({ prompt: body.prompt, model: body.model });
    const failure = failures.get(body.prompt);
    if (body.model === "primary-model" && failure) {
      response.writeHead(failure.status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        error: { code: failure.code, message: failure.message },
      }));
      return;
    }
    successResponse(response);
  });

  const result = await runJobs({
    concurrency: 1,
    jobs: [
      { id: "policy-error", prompt: "policy", outputDir: path.join(directory, "output") },
      { id: "size-error", prompt: "size", outputDir: path.join(directory, "output") },
    ],
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      models: ["primary-model", "fallback-model"],
      model: undefined,
      maxRetries: 0,
    }),
  });

  assert.equal(result.status, "error");
  assert.deepEqual(seenRequests, [
    { prompt: "policy", model: "primary-model" },
    { prompt: "size", model: "primary-model" },
  ]);
  assert.deepEqual(result.jobs.map((job) => job.error.code), [
    "content_policy_violation",
    "invalid_size",
  ]);
  assert.deepEqual(
    result.jobs.map((job) => job.error.details.modelAttempts.length),
    [1, 1],
  );
});

test("keeps successful paths when another job fails and redacts the API key", async (t) => {
  const directory = await temporaryDirectory(t);
  const baseUrl = await startServer(t, async (request, response) => {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    if (body.prompt === "fail") {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        error: {
          code: "bad_request",
          message: "request rejected for test-secret-key",
        },
      }));
      return;
    }
    successResponse(response);
  });

  const result = await runJobs({
    concurrency: 2,
    jobs: [
      { id: "good", prompt: "pass", outputDir: path.join(directory, "output") },
      { id: "bad", prompt: "fail", outputDir: path.join(directory, "output") },
    ],
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime")),
  });

  assert.equal(result.status, "partial");
  assert.equal(result.summary.succeeded, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.jobs[0].status, "ok");
  assert.equal(result.jobs[1].status, "error");
  assert.doesNotMatch(JSON.stringify(result), /test-secret-key/u);
  assert.match(result.jobs[1].error.message, /\[REDACTED\]/u);
});

test("validates provider request and output limits", async (t) => {
  const directory = await temporaryDirectory(t);
  const configPath = path.join(directory, "config.json");
  for (const value of [0, 5, 1.5, "invalid"]) {
    await fs.writeFile(configPath, JSON.stringify({
      baseUrl: "http://localhost:3050/v1",
      apiKey: "file-key",
      maxImagesPerRequest: value,
    }));
    await assert.rejects(
      loadConfig({ configPath, homeDir: directory, env: {} }),
      /maxImagesPerRequest must be an integer from 1 to 4/u,
    );
  }
  for (const value of [0, 200 * 1024 * 1024 + 1, 1.5, "invalid"]) {
    await fs.writeFile(configPath, JSON.stringify({
      baseUrl: "http://localhost:3050/v1",
      apiKey: "file-key",
      maxOutputBytes: value,
    }));
    await assert.rejects(
      loadConfig({ configPath, homeDir: directory, env: {} }),
      /maxOutputBytes must be an integer from 1024 to 209715200/u,
    );
  }
});

test("splits logical generation count into provider-sized requests", async (t) => {
  const directory = await temporaryDirectory(t);
  const requestBodies = [];
  const baseUrl = await startServer(t, async (request, response) => {
    requestBodies.push(JSON.parse((await readBody(request)).toString("utf8")));
    successResponse(response);
  });

  const result = await runJobs({
    id: "split-generation",
    prompt: "Two variants",
    count: 2,
    outputDir: path.join(directory, "output"),
    outputName: "split-generation",
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      maxImagesPerRequest: 1,
    }),
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(requestBodies.map((body) => body.n), [1, 1]);
  assert.equal(result.jobs[0].requestedCount, 2);
  assert.equal(result.jobs[0].returnedCount, 2);
  assert.equal(result.jobs[0].requestCount, 2);
  assert.equal(result.jobs[0].countSplitUsed, true);
  assert.equal(result.jobs[0].usage, null);
  assert.equal(result.jobs[0].usageByRequest.length, 2);
  assert.deepEqual(
    result.jobs[0].files.map((file) => path.basename(file.path)),
    ["split-generation-1.png", "split-generation-2.png"],
  );
});

test("splits multipart edits and uploads references for every request", async (t) => {
  const directory = await temporaryDirectory(t);
  const referencePath = path.join(directory, "reference.png");
  await fs.writeFile(referencePath, PNG_BYTES);
  const multipartBodies = [];
  const baseUrl = await startServer(t, async (request, response) => {
    assert.equal(request.url, "/v1/images/edits");
    multipartBodies.push((await readBody(request)).toString("latin1"));
    successResponse(response);
  });

  const result = await runJobs({
    id: "split-edit",
    prompt: "Two edited variants",
    images: [referencePath],
    count: 2,
    outputDir: path.join(directory, "output"),
    outputName: "split-edit",
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      maxImagesPerRequest: 1,
    }),
  });

  assert.equal(result.status, "ok");
  assert.equal(result.jobs[0].mode, "edit");
  assert.equal(result.jobs[0].files.length, 2);
  assert.equal(multipartBodies.length, 2);
  for (const body of multipartBodies) {
    assert.match(body, /name="n"\r\n\r\n1\r\n/u);
    assert.match(body, /name="image"; filename="reference.png"/u);
  }
});

test("pins the first successful fallback model across split requests", async (t) => {
  const directory = await temporaryDirectory(t);
  const seenModels = [];
  const baseUrl = await startServer(t, async (request, response) => {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    seenModels.push(body.model);
    if (body.model === "plus-codex-gpt-image-2") {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        error: { code: "upstream_error", message: "preferred model failed" },
      }));
      return;
    }
    successResponse(response);
  });

  const result = await runJobs({
    id: "split-fallback",
    prompt: "Fallback variants",
    count: 2,
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      models: ["plus-codex-gpt-image-2", "codex-gpt-image-2", "gpt-image-2"],
      model: undefined,
      maxImagesPerRequest: 1,
      maxRetries: 0,
    }),
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(seenModels, [
    "plus-codex-gpt-image-2",
    "codex-gpt-image-2",
    "codex-gpt-image-2",
  ]);
  assert.equal(result.jobs[0].model, "codex-gpt-image-2");
  assert.equal(result.jobs[0].fallbackUsed, true);
  assert.deepEqual(result.jobs[0].modelAttempts.map((attempt) => attempt.status), ["error", "ok"]);
});

test("automatically completes a logical count after a provider short response", async (t) => {
  const directory = await temporaryDirectory(t);
  const requestedCounts = [];
  const baseUrl = await startServer(t, async (request, response) => {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    requestedCounts.push(body.n);
    successResponse(response);
  });

  const result = await runJobs({
    id: "short-result",
    prompt: "Two images in one logical job",
    count: 2,
    outputDir: path.join(directory, "output"),
    outputName: "short-result",
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      maxImagesPerRequest: 4,
    }),
  });

  assert.deepEqual(requestedCounts, [2, 1]);
  assert.equal(result.status, "ok");
  assert.equal(result.jobs[0].requestedCount, 2);
  assert.equal(result.jobs[0].returnedCount, 2);
  assert.equal(result.jobs[0].requestCount, 2);
  assert.equal(result.jobs[0].countSplitUsed, true);
  assert.deepEqual(
    result.jobs[0].files.map((file) => path.basename(file.path)),
    ["short-result-1.png", "short-result-2.png"],
  );
  assert.match(result.jobs[0].warnings.join("\n"), /scheduled 1 bounded follow-up request/u);
  assert.doesNotMatch(result.jobs[0].warnings.join("\n"), /were saved across/u);
});

test("preserves files when a later split request fails", async (t) => {
  const directory = await temporaryDirectory(t);
  let requests = 0;
  const baseUrl = await startServer(t, async (request, response) => {
    await readBody(request);
    requests += 1;
    if (requests === 1) {
      successResponse(response);
      return;
    }
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      error: { code: "bad_request", message: "later request failed" },
    }));
  });

  const result = await runJobs({
    id: "partial-result",
    prompt: "Two images with a later failure",
    count: 2,
    outputDir: path.join(directory, "output"),
    outputName: "partial-result",
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      maxImagesPerRequest: 1,
      maxRetries: 0,
    }),
  });

  assert.equal(requests, 2);
  assert.equal(result.status, "partial");
  assert.equal(result.summary.succeeded, 0);
  assert.equal(result.summary.partial, 1);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.jobs[0].status, "partial");
  assert.equal(result.jobs[0].returnedCount, 1);
  assert.equal(result.jobs[0].error.code, "bad_request");
  assert.equal(path.basename(result.jobs[0].files[0].path), "partial-result-1.png");
  assert.match(result.jobs[0].warnings.join("\n"), /1 were saved/u);
  await fs.access(result.jobs[0].files[0].path);
});

test("split requests retain the shared global concurrency limit", async (t) => {
  const directory = await temporaryDirectory(t);
  let active = 0;
  let peak = 0;
  let requests = 0;
  const baseUrl = await startServer(t, async (request, response) => {
    await readBody(request);
    requests += 1;
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 40));
    active -= 1;
    successResponse(response);
  });

  const result = await runJobs({
    concurrency: 2,
    jobs: [
      { id: "split-a", prompt: "A", count: 2, outputDir: path.join(directory, "output") },
      { id: "split-b", prompt: "B", count: 2, outputDir: path.join(directory, "output") },
    ],
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      maxImagesPerRequest: 1,
      maxConcurrency: 2,
      maxGlobalConcurrency: 1,
    }),
  });

  assert.equal(result.status, "ok");
  assert.equal(requests, 4);
  assert.equal(peak, 1);
});

test("retries with single-image requests when the service rejects a multi-image count", async (t) => {
  const directory = await temporaryDirectory(t);
  const seenCounts = [];
  const seenModels = [];
  const baseUrl = await startServer(t, async (request, response) => {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    seenCounts.push(body.n);
    seenModels.push(body.model);
    if (body.n > 1) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        error: {
          code: "unknown_parameter",
          message: "Unknown parameter: 'tools[0].n'.",
          param: "tools[0].n",
          type: "invalid_request_error",
        },
      }));
      return;
    }
    successResponse(response);
  });

  const result = await runJobs({
    id: "count-rejection",
    prompt: "A multi-image request",
    outputDir: path.join(directory, "output"),
    count: 2,
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      models: ["gpt-image-2.5-flare", "gpt-image-2"],
      model: undefined,
      maxImagesPerRequest: 4,
    }),
  });

  const job = result.jobs[0];
  assert.equal(result.status, "ok");
  assert.equal(job.status, "ok");
  assert.equal(job.files.length, 2);
  assert.deepEqual(seenCounts, [2, 1, 1]);
  assert.equal(job.countSplitUsed, true);
  assert.deepEqual([...new Set(seenModels)], ["gpt-image-2.5-flare"]);
  assert.equal(job.model, "gpt-image-2.5-flare");
  assert.equal(job.fallbackUsed, false);
  assert.ok(job.warnings.some((warning) => warning.includes("retried with one image per upstream request")));
});

test("classifies upstream errors that only carry an error type", async (t) => {
  const directory = await temporaryDirectory(t);
  const seenModels = [];
  const baseUrl = await startServer(t, async (request, response) => {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    seenModels.push(body.model);
    if (body.model === "gpt-image-2.5-flare") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        error: {
          message: 'Model "gpt-image-2.5-flare" is not available for this group',
          type: "model_not_found",
        },
      }));
      return;
    }
    successResponse(response);
  });

  const result = await runJobs({
    id: "type-only-error",
    prompt: "A type-only error",
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      models: ["gpt-image-2.5-flare", "gpt-image-2"],
      model: undefined,
    }),
  });

  const job = result.jobs[0];
  assert.equal(result.status, "ok");
  assert.deepEqual(seenModels, ["gpt-image-2.5-flare", "gpt-image-2"]);
  assert.equal(job.modelAttempts[0].code, "model_not_found");
  assert.equal(job.model, "gpt-image-2");
  assert.equal(job.fallbackUsed, true);
});

test("reuses the resolved model for later jobs in the same run", async (t) => {
  const directory = await temporaryDirectory(t);
  const attempts = [];
  const baseUrl = await startServer(t, async (request, response) => {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    attempts.push(body.model);
    if (body.model !== "gpt-image-2") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        error: { code: "model_not_found", message: "model is not available for this group" },
      }));
      return;
    }
    successResponse(response);
  });

  const result = await runJobs({
    concurrency: 1,
    jobs: [
      { id: "first", prompt: "A", outputDir: path.join(directory, "output") },
      { id: "second", prompt: "B", outputDir: path.join(directory, "output") },
      { id: "pinned", prompt: "C", outputDir: path.join(directory, "output"), model: "gpt-image-2.5-sunburst" },
    ],
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      models: ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "gpt-image-2"],
      model: undefined,
      maxConcurrency: 1,
    }),
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(
    result.jobs.map((job) => job.modelAttempts.map((attempt) => attempt.model)),
    [
      ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "gpt-image-2"],
      ["gpt-image-2"],
      ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2"],
    ],
  );
  assert.deepEqual(result.jobs.map((job) => job.model), [
    "gpt-image-2",
    "gpt-image-2",
    "gpt-image-2",
  ]);
  assert.equal(attempts.length, 7);
});

test("compares model ids across namespaced and date-stamped gateways", () => {
  assert.equal(normalizeModelName("openai/gpt-image-2.6-flare"), "gpt-image-2.6-flare");
  assert.equal(normalizeModelName("GPT-Image-2.6-Flare-2026-11-04"), "gpt-image-2.6-flare");
  assert.equal(normalizeModelName("vendor/group/seedream-4"), "seedream-4");
  assert.equal(normalizeModelName("   "), "");

  const entries = [
    { id: "openai/gpt-image-2.6-flare", normalized: "gpt-image-2.6-flare" },
    { id: "openai/gpt-image-2", normalized: "gpt-image-2" },
  ];
  assert.deepEqual(
    mapModelsToCatalog(["gpt-image-2.6-flare", "unlisted-model"], entries),
    ["openai/gpt-image-2.6-flare", "unlisted-model"],
  );
});

test("ranks declared image models by service metadata, never by name", () => {
  const entries = [
    { id: "seedream-4", normalized: "seedream-4", created: 30, imageCapable: true },
    { id: "nano-banana-2", normalized: "nano-banana-2", created: 50, imageCapable: true },
    { id: "chat-pro", normalized: "chat-pro", created: 99, imageCapable: false },
  ];
  assert.deepEqual(declaredImageModels(entries), ["nano-banana-2", "seedream-4"]);

  // A catalog that declares nothing yields nothing rather than a guess.
  const silent = [
    { id: "gpt-image-2.6-flare", normalized: "gpt-image-2.6-flare", created: 9, imageCapable: null },
  ];
  assert.deepEqual(declaredImageModels(silent), []);
});

test("resolves an unfamiliar image model from declared output modality", async (t) => {
  const directory = await temporaryDirectory(t);
  const seenModels = [];
  const baseUrl = await startServer(t, async (request, response) => {
    if (request.method === "GET" && request.url.startsWith("/v1/models")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [
        { id: "chat-only", created: 90, architecture: { output_modalities: ["text"] } },
        { id: "vendor/seedream-4", created: 10, architecture: { output_modalities: ["image"] } },
        { id: "vendor/nano-banana-2", created: 70, architecture: { output_modalities: ["image"] } },
      ] }));
      return;
    }
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    seenModels.push(body.model);
    successResponse(response);
  });

  const result = await runJobs({
    id: "declared",
    prompt: "An unfamiliar family",
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      models: [],
      model: undefined,
      modelDiscovery: true,
    }),
  });

  assert.equal(result.status, "ok");
  assert.equal(result.summary.modelOrigin, "declared");
  // Newest declared image model first; the text-only model is excluded.
  assert.deepEqual(result.summary.modelChain, ["vendor/nano-banana-2", "vendor/seedream-4"]);
  assert.deepEqual(seenModels, ["vendor/nano-banana-2"]);
});

test("fails with the catalog attached when nothing declares an image modality", async (t) => {
  const directory = await temporaryDirectory(t);
  const baseUrl = await startServer(t, async (request, response) => {
    if (request.method === "GET" && request.url.startsWith("/v1/models")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "mystery-1" }, { id: "mystery-2" }] }));
      return;
    }
    successResponse(response);
  });

  const result = await runJobs({
    id: "silent-catalog",
    prompt: "No modality anywhere",
    outputDir: path.join(directory, "output"),
  }, {
    cwd: directory,
    config: config(baseUrl, path.join(directory, "runtime"), {
      models: [],
      model: undefined,
      modelDiscovery: true,
    }),
  });

  assert.equal(result.status, "error");
  assert.equal(result.jobs[0].error.code, "model_unresolved");
  assert.deepEqual(result.jobs[0].error.details.availableModels, ["mystery-1", "mystery-2"]);
});

test("reuses a remembered model and reports the catalog through listModels", async (t) => {
  const directory = await temporaryDirectory(t);
  const runtimeDir = path.join(directory, "runtime");
  const seenModels = [];
  const baseUrl = await startServer(t, async (request, response) => {
    if (request.method === "GET" && request.url.startsWith("/v1/models")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [
        { id: "house-image-a", created: 10, model_info: { mode: "image_generation" } },
        { id: "house-image-b", created: 20, model_info: { mode: "image_generation" } },
      ] }));
      return;
    }
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    seenModels.push(body.model);
    successResponse(response);
  });
  const settings = { models: [], model: undefined, modelDiscovery: true };

  const first = await runJobs({
    id: "first", prompt: "A", outputDir: path.join(directory, "output"),
  }, { cwd: directory, config: config(baseUrl, runtimeDir, settings) });
  assert.equal(first.summary.modelOrigin, "declared");

  // The run records what worked, so the next run skips resolution entirely.
  const second = await runJobs({
    id: "second", prompt: "B", outputDir: path.join(directory, "output"),
  }, { cwd: directory, config: config(baseUrl, runtimeDir, settings) });
  assert.equal(second.summary.modelOrigin, "remembered");
  assert.deepEqual(second.summary.modelChain, ["house-image-b", "house-image-a"]);
  assert.deepEqual(seenModels, ["house-image-b", "house-image-b"]);

  const catalog = await listModels({
    config: config(baseUrl, runtimeDir, settings),
    homeDir: directory,
  });
  assert.equal(catalog.declaresModality, true);
  assert.equal(catalog.modelOrigin, "remembered");
  assert.deepEqual(catalog.models.map((entry) => entry.id), ["house-image-a", "house-image-b"]);
});

const SAFE_SVG = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>\n';
const GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function documentResponse(response, base64) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ created: 1, data: [{ b64_json: base64 }] }));
}

async function outputFiles(directory) {
  try {
    return (await fs.readdir(directory)).sort();
  } catch {
    return [];
  }
}

test("sends GPT Image 2.6 fields only when a job or the config sets them", async (t) => {
  const directory = await temporaryDirectory(t);
  const bodies = [];
  const baseUrl = await startServer(t, async (request, response) => {
    bodies.push(JSON.parse((await readBody(request)).toString("utf8")));
    successResponse(response);
  });
  const runtimeDir = path.join(directory, "runtime");

  await runJobs({ id: "plain", prompt: "A", outputDir: path.join(directory, "a") }, {
    cwd: directory,
    config: config(baseUrl, runtimeDir),
  });
  // A job that sets none of the new fields keeps the request shape older
  // services already accept.
  for (const key of ["output_format", "complexity", "frame_count", "frame_duration_ms"]) {
    assert.equal(key in bodies[0], false, key + " must not be sent by default");
  }

  await runJobs({
    concurrency: 1,
    jobs: [
      { id: "inherits", prompt: "B", outputDir: path.join(directory, "b") },
      { id: "overrides", prompt: "C", outputDir: path.join(directory, "c"), complexity: "LOW", outputFormat: "png" },
    ],
  }, {
    cwd: directory,
    config: config(baseUrl, runtimeDir, { complexity: "medium" }),
  });
  assert.equal(bodies[1].complexity, "medium");
  assert.equal("output_format" in bodies[1], false);
  assert.equal(bodies[2].complexity, "low");
  assert.equal(bodies[2].output_format, "png");
});

test("saves requested SVG output one document per request", async (t) => {
  const directory = await temporaryDirectory(t);
  const bodies = [];
  const baseUrl = await startServer(t, async (request, response) => {
    bodies.push(JSON.parse((await readBody(request)).toString("utf8")));
    documentResponse(response, Buffer.from(SAFE_SVG, "utf8").toString("base64"));
  });

  const result = await runJobs({
    id: "vector",
    prompt: "A red circle",
    outputDir: path.join(directory, "output"),
    outputName: "circle",
    outputFormat: "svg",
    count: 2,
  }, { cwd: directory, config: config(baseUrl, path.join(directory, "runtime")) });

  const job = result.jobs[0];
  assert.equal(result.status, "ok");
  assert.deepEqual(bodies.map((body) => [body.n, body.output_format]), [[1, "svg"], [1, "svg"]]);
  assert.deepEqual(await outputFiles(path.join(directory, "output")), ["circle-1.svg", "circle-2.svg"]);
  assert.ok(job.files.every((file) => file.format === "image/svg+xml" && file.formatMatched === true));
  assert.ok(job.files.every((file) => file.sizeMatched === null));
  assert.equal(job.outputFormat, "svg");
  assert.equal(job.warnings.some((warning) => warning.includes("output, but the service returned")), false);
  assert.equal(
    await fs.readFile(path.join(directory, "output", "circle-1.svg"), "utf8"),
    SAFE_SVG,
  );
});

test("reports a format mismatch when a service ignores output_format", async (t) => {
  const directory = await temporaryDirectory(t);
  const baseUrl = await startServer(t, async (request, response) => {
    await readBody(request);
    successResponse(response);
  });

  const result = await runJobs({
    id: "downgraded",
    prompt: "A red circle",
    outputDir: path.join(directory, "output"),
    outputName: "circle",
    outputFormat: "svg",
  }, { cwd: directory, config: config(baseUrl, path.join(directory, "runtime")) });

  const job = result.jobs[0];
  assert.equal(result.status, "ok");
  // Named by the bytes that arrived, never by the format that was requested.
  assert.deepEqual(await outputFiles(path.join(directory, "output")), ["circle.png"]);
  assert.equal(job.files[0].format, "image/png");
  assert.equal(job.files[0].formatMatched, false);
  assert.ok(job.warnings.includes("Requested svg output, but the service returned image/png"));
});

test("refuses SVG with active content, and SVG that nobody asked for", async (t) => {
  const directory = await temporaryDirectory(t);
  let payload = "";
  const baseUrl = await startServer(t, async (request, response) => {
    await readBody(request);
    documentResponse(response, Buffer.from(payload, "utf8").toString("base64"));
  });
  const runtimeDir = path.join(directory, "runtime");

  payload = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="4"/></svg>';
  const unsafe = await runJobs({
    id: "unsafe", prompt: "A", outputDir: path.join(directory, "unsafe"), outputFormat: "svg",
  }, { cwd: directory, config: config(baseUrl, runtimeDir) });
  assert.equal(unsafe.jobs[0].status, "error");
  assert.equal(unsafe.jobs[0].error.code, "unsafe_svg");
  assert.deepEqual(await outputFiles(path.join(directory, "unsafe")), []);

  payload = SAFE_SVG;
  const unrequested = await runJobs({
    id: "unrequested", prompt: "B", outputDir: path.join(directory, "unrequested"),
  }, { cwd: directory, config: config(baseUrl, runtimeDir) });
  assert.equal(unrequested.jobs[0].status, "error");
  assert.equal(unrequested.jobs[0].error.code, "invalid_response");
  assert.deepEqual(await outputFiles(path.join(directory, "unrequested")), []);
});

test("requests animated GIF frames and rejects invalid 2.6 combinations", async (t) => {
  const directory = await temporaryDirectory(t);
  const bodies = [];
  const baseUrl = await startServer(t, async (request, response) => {
    bodies.push(JSON.parse((await readBody(request)).toString("utf8")));
    documentResponse(response, GIF_BASE64);
  });
  const settings = config(baseUrl, path.join(directory, "runtime"));

  const result = await runJobs({
    id: "loop",
    prompt: "A bouncing ball",
    outputDir: path.join(directory, "output"),
    outputName: "ball",
    outputFormat: "gif",
    frameCount: 4,
    frameDurationMs: 150,
    count: 2,
  }, { cwd: directory, config: settings });
  assert.equal(result.status, "ok");
  assert.deepEqual(
    bodies.map((body) => [body.n, body.output_format, body.frame_count, body.frame_duration_ms]),
    [[1, "gif", 4, 150], [1, "gif", 4, 150]],
  );
  assert.deepEqual(await outputFiles(path.join(directory, "output")), ["ball-1.gif", "ball-2.gif"]);
  assert.ok(result.jobs[0].files.every((file) => file.formatMatched === true));

  const reject = (job, pattern) => assert.throws(
    () => normalizeRequest({ id: "x", prompt: "x", ...job }, settings, { cwd: directory }),
    pattern,
  );
  reject({ outputFormat: "svg", images: ["reference.png"] }, /only available for text-to-image/u);
  reject({ outputFormat: "gif", images: ["reference.png"] }, /only available for text-to-image/u);
  reject({ frameCount: 4 }, /require outputFormat gif/u);
  reject({ outputFormat: "svg", frameDurationMs: 100 }, /require outputFormat gif/u);
  reject({ outputFormat: "gif", frameCount: 1 }, /frameCount must be an integer from 2 to 64/u);
  reject({ outputFormat: "gif", frameDurationMs: 5000 }, /frameDurationMs must be an integer from 20 to 2000/u);
  reject({ outputFormat: "tiff" }, /outputFormat must be png, jpeg, webp, gif, or svg/u);
  reject({ complexity: "extreme" }, /complexity must be low, medium, or high/u);
});
