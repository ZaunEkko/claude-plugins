import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  imageDimensions,
  loadConfig,
  normalizeBaseUrl,
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
  assert.throws(() => resolveSize({ aspectRatio: "2:3", resolution: "4k" }), /not exposed/u);
  assert.deepEqual(imageDimensions(PNG_BYTES), { width: 1, height: 1 });
});

test("loads user config and applies environment overrides", async (t) => {
  const directory = await temporaryDirectory(t);
  const configPath = path.join(directory, "config.json");
  await fs.writeFile(configPath, JSON.stringify({
    baseUrl: "http://localhost:3050/v1",
    apiKey: "file-key",
    maxConcurrency: 2,
  }));
  const loaded = await loadConfig({
    configPath,
    homeDir: directory,
    env: {
      EKKO_IMAGE_GEN_API_KEY: "environment-key",
      EKKO_IMAGE_GEN_QUALITY: "high",
    },
  });
  assert.equal(loaded.apiKey, "environment-key");
  assert.equal(loaded.quality, "high");
  assert.equal(loaded.maxConcurrency, 2);
});

test("normalizes a single job and preserves an explicit output target", () => {
  const normalized = normalizeRequest({
    id: "logo",
    prompt: "A logo",
    output: "assets/generated/logo.png",
  }, config("http://localhost:3050/v1", path.resolve("runtime")), {
    cwd: path.resolve("project"),
  });
  assert.equal(normalized.jobs.length, 1);
  assert.equal(normalized.jobs[0].outputName, "logo");
  assert.equal(normalized.jobs[0].outputDir, path.resolve("project/assets/generated"));
});

test("generates an image, saves it without overwriting, and returns clickable URLs", async (t) => {
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
  assert.equal(requestBody.response_format, "b64_json");
  assert.equal(await fs.readFile(first.jobs[0].files[0].path, "base64"), PNG_BASE64);
  assert.equal(first.jobs[0].files[0].width, 1);
  assert.equal(first.jobs[0].files[0].height, 1);
  assert.equal(first.jobs[0].files[0].sizeMatched, false);
  assert.match(first.jobs[0].warnings[0], /service returned 1x1/u);
  assert.match(first.jobs[0].files[0].fileUrl, /^file:\/\//u);
  assert.match(first.jobs[0].files[0].directoryUrl, /^file:\/\//u);
  assert.notEqual(first.jobs[0].files[0].path, second.jobs[0].files[0].path);
});

test("uploads local reference images with multipart form data", async (t) => {
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
    images: [referencePath],
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

  assert.equal(result.status, "ok");
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
