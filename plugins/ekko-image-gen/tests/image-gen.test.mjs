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
  assert.equal(resolveSize({ aspectRatio: "3:4", resolution: "1k" }).size, "1024x1360");
  assert.equal(resolveSize({ aspectRatio: "4:3", resolution: "1k" }).size, "1360x1024");
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
    maxImagesPerRequest: 2,
  }));
  const loaded = await loadConfig({
    configPath,
    homeDir: directory,
    env: {
      EKKO_IMAGE_GEN_API_KEY: "environment-key",
      EKKO_IMAGE_GEN_QUALITY: "high",
      EKKO_IMAGE_GEN_MAX_IMAGES_PER_REQUEST: "1",
    },
  });
  assert.equal(loaded.apiKey, "environment-key");
  assert.equal(loaded.quality, "high");
  assert.equal(loaded.maxConcurrency, 2);
  assert.equal(loaded.maxImagesPerRequest, 1);
  assert.deepEqual(loaded.models, ["gpt-image-2"]);
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
  assert.deepEqual(loaded.models, ["gpt-image-2"]);
  assert.equal(loaded.maxImagesPerRequest, 4);
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
  assert.equal(normalized.jobs[0].historyDisabled, null);
  assert.throws(
    () => normalizeRequest({ prompt: "A logo", historyDisabled: "yes" }, config("http://localhost:3050/v1", path.resolve("runtime"))),
    /historyDisabled must be a boolean/u,
  );
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

test("validates maxImagesPerRequest configuration", async (t) => {
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
