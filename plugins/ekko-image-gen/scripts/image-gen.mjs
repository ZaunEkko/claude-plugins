#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_MODELS = Object.freeze([
  "plus-codex-gpt-image-2",
  "codex-gpt-image-2",
  "gpt-image-2",
]);

const SIZE_PRESETS = Object.freeze({
  "auto@auto": "1024x1024",
  "1:1@1k": "1024x1024",
  "2:3@1k": "1024x1536",
  "3:2@1k": "1536x1024",
  "3:4@1k": "1024x1365",
  "4:3@1k": "1365x1024",
  "9:16@1k": "1088x1920",
  "16:9@1k": "1920x1088",
  "1:1@2k": "2048x2048",
  "16:9@2k": "2560x1440",
  "9:16@2k": "1440x2560",
  "16:9@4k": "3840x2160",
  "9:16@4k": "2160x3840",
});

const DEFAULT_CONFIG = Object.freeze({
  baseUrl: "http://localhost:3050/v1",
  models: DEFAULT_MODELS,
  size: "1024x1024",
  quality: "auto",
  maxConcurrency: 4,
  maxGlobalConcurrency: 4,
  timeoutMs: 240000,
  queueTimeoutMs: 600000,
  maxRetries: 1,
  maxInputBytes: 25 * 1024 * 1024,
});

const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const MODEL_FALLBACK_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const SUPPORTED_QUALITIES = new Set(["auto", "low", "medium", "high"]);

class ImageGenError extends Error {
  constructor(message, { code = "image_gen_error", status = null, details = null } = {}) {
    super(message);
    this.name = "ImageGenError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedInteger(value, fallback, minimum, maximum, field) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ImageGenError(`${field} must be an integer from ${minimum} to ${maximum}`, {
      code: "invalid_config",
    });
  }
  return parsed;
}

function uniqueStrings(values) {
  return [...new Set(values.map(nonEmptyString).filter(Boolean))];
}

function normalizeModels(value, fallback = DEFAULT_MODELS) {
  const raw = Array.isArray(value)
    ? value
    : nonEmptyString(value)
      ? value.split(",")
      : fallback;
  const models = uniqueStrings(raw);
  if (models.length === 0) {
    throw new ImageGenError("At least one image model is required", { code: "invalid_config" });
  }
  if (models.length > 10) {
    throw new ImageGenError("At most 10 fallback models are supported", { code: "invalid_config" });
  }
  return models;
}

function validatedDimensions(value, field) {
  const match = /^(\d{2,4})x(\d{2,4})$/u.exec(value);
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 64 || width > 4096 || height < 64 || height > 4096) {
    throw new ImageGenError(`${field} dimensions must be from 64 to 4096 pixels`, {
      code: "invalid_config",
    });
  }
  return { width, height, size: `${width}x${height}` };
}

export function resolveSize(value = {}, fallback = DEFAULT_CONFIG.size, field = "size") {
  const raw = typeof value === "string" ? { size: value } : value ?? {};
  const explicit = nonEmptyString(raw.size)?.toLowerCase().replace(/\s+/gu, "");
  const direct = explicit ? validatedDimensions(explicit, field) : null;
  if (direct) {
    return { ...direct, aspectRatio: null, resolution: null, preset: null };
  }

  let aspectRatio = nonEmptyString(raw.aspectRatio)?.toLowerCase().replace(/\s+/gu, "") ?? null;
  let resolution = nonEmptyString(raw.resolution)?.toLowerCase().replace(/\s+/gu, "") ?? null;
  if (explicit) {
    const label = /^((?:auto)|(?:\d+:\d+))(?:\((1k|2k|4k|auto)\))?$/u.exec(explicit);
    if (!label) {
      throw new ImageGenError(`${field} must be WIDTHxHEIGHT or a supported ratio preset`, {
        code: "invalid_config",
      });
    }
    aspectRatio = label[1];
    resolution = label[2] ?? resolution;
  }

  if (!aspectRatio && !resolution) {
    const fallbackDimensions = validatedDimensions(fallback, field);
    if (!fallbackDimensions) {
      throw new ImageGenError(`${field} fallback must be WIDTHxHEIGHT`, { code: "invalid_config" });
    }
    return { ...fallbackDimensions, aspectRatio: null, resolution: null, preset: null };
  }

  aspectRatio ??= "1:1";
  resolution ??= aspectRatio === "auto" ? "auto" : "1k";
  const key = `${aspectRatio}@${resolution}`;
  const preset = SIZE_PRESETS[key];
  if (!preset) {
    throw new ImageGenError(
      `${field} preset ${aspectRatio} (${resolution}) is not exposed by the local image UI`,
      { code: "invalid_config" },
    );
  }
  const dimensions = validatedDimensions(preset, field);
  return { ...dimensions, aspectRatio, resolution, preset: key };
}

export function normalizeBaseUrl(value) {
  const raw = nonEmptyString(value) ?? DEFAULT_CONFIG.baseUrl;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ImageGenError("baseUrl must be a valid HTTP(S) URL", { code: "invalid_config" });
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new ImageGenError("baseUrl must use HTTP or HTTPS", { code: "invalid_config" });
  }
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  if (!parsed.pathname || parsed.pathname === "/") {
    parsed.pathname = "/v1";
  }
  return parsed.toString().replace(/\/$/u, "");
}

function mergeEnvironment(fileConfig, env) {
  return {
    ...fileConfig,
    baseUrl: env.EKKO_IMAGE_GEN_BASE_URL ?? fileConfig.baseUrl,
    apiKey: env.EKKO_IMAGE_GEN_API_KEY ?? fileConfig.apiKey,
    models: env.EKKO_IMAGE_GEN_MODELS ?? fileConfig.models,
    model: env.EKKO_IMAGE_GEN_MODEL ?? fileConfig.model,
    size: env.EKKO_IMAGE_GEN_SIZE ?? fileConfig.size,
    aspectRatio: env.EKKO_IMAGE_GEN_ASPECT_RATIO ?? fileConfig.aspectRatio,
    resolution: env.EKKO_IMAGE_GEN_RESOLUTION ?? fileConfig.resolution,
    quality: env.EKKO_IMAGE_GEN_QUALITY ?? fileConfig.quality,
    maxConcurrency: env.EKKO_IMAGE_GEN_MAX_CONCURRENCY ?? fileConfig.maxConcurrency,
    maxGlobalConcurrency:
      env.EKKO_IMAGE_GEN_MAX_GLOBAL_CONCURRENCY ?? fileConfig.maxGlobalConcurrency,
    timeoutMs: env.EKKO_IMAGE_GEN_TIMEOUT_MS ?? fileConfig.timeoutMs,
    queueTimeoutMs: env.EKKO_IMAGE_GEN_QUEUE_TIMEOUT_MS ?? fileConfig.queueTimeoutMs,
    maxRetries: env.EKKO_IMAGE_GEN_MAX_RETRIES ?? fileConfig.maxRetries,
    maxInputBytes: env.EKKO_IMAGE_GEN_MAX_INPUT_BYTES ?? fileConfig.maxInputBytes,
    runtimeDir: env.EKKO_IMAGE_GEN_RUNTIME_DIR ?? fileConfig.runtimeDir,
  };
}

export function normalizeConfig(raw = {}, { homeDir = os.homedir() } = {}) {
  const quality = nonEmptyString(raw.quality) ?? DEFAULT_CONFIG.quality;
  if (!SUPPORTED_QUALITIES.has(quality)) {
    throw new ImageGenError("quality must be auto, low, medium, or high", {
      code: "invalid_config",
    });
  }

  const size = resolveSize({
    size: raw.size,
    aspectRatio: raw.aspectRatio,
    resolution: raw.resolution,
  }, DEFAULT_CONFIG.size, "size");
  const modelSource = raw.models ?? raw.model;

  return {
    baseUrl: normalizeBaseUrl(raw.baseUrl),
    apiKey: nonEmptyString(raw.apiKey),
    models: normalizeModels(modelSource, DEFAULT_CONFIG.models),
    size: size.size,
    aspectRatio: size.aspectRatio,
    resolution: size.resolution,
    quality,
    maxConcurrency: boundedInteger(
      raw.maxConcurrency,
      DEFAULT_CONFIG.maxConcurrency,
      1,
      16,
      "maxConcurrency",
    ),
    maxGlobalConcurrency: boundedInteger(
      raw.maxGlobalConcurrency,
      raw.maxConcurrency ?? DEFAULT_CONFIG.maxGlobalConcurrency,
      1,
      32,
      "maxGlobalConcurrency",
    ),
    timeoutMs: boundedInteger(raw.timeoutMs, DEFAULT_CONFIG.timeoutMs, 5000, 600000, "timeoutMs"),
    queueTimeoutMs: boundedInteger(
      raw.queueTimeoutMs,
      DEFAULT_CONFIG.queueTimeoutMs,
      5000,
      3600000,
      "queueTimeoutMs",
    ),
    maxRetries: boundedInteger(raw.maxRetries, DEFAULT_CONFIG.maxRetries, 0, 5, "maxRetries"),
    maxInputBytes: boundedInteger(
      raw.maxInputBytes,
      DEFAULT_CONFIG.maxInputBytes,
      1024,
      100 * 1024 * 1024,
      "maxInputBytes",
    ),
    runtimeDir: path.resolve(
      nonEmptyString(raw.runtimeDir) ?? path.join(homeDir, ".claude", "ekko-image-gen", "runtime"),
    ),
  };
}

export async function loadConfig({ env = process.env, homeDir = os.homedir(), configPath } = {}) {
  const resolvedPath = path.resolve(
    configPath ??
      env.EKKO_IMAGE_GEN_CONFIG ??
      path.join(homeDir, ".claude", "ekko-image-gen.local.json"),
  );
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(await fs.readFile(resolvedPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      if (error instanceof SyntaxError) {
        throw new ImageGenError(`Invalid JSON in ${resolvedPath}`, { code: "invalid_config" });
      }
      throw error;
    }
  }
  return normalizeConfig(mergeEnvironment(fileConfig, env), { homeDir });
}

export function sanitizeBaseName(value, fallback = "generated-image") {
  const normalized = (nonEmptyString(value) ?? fallback)
    .normalize("NFKC")
    .replace(/[<>:"/\\|?* -]/gu, "-")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[. -]+|[. -]+$/gu, "")
    .slice(0, 96);
  return normalized || fallback;
}

function normalizeImageSource(value) {
  if (typeof value === "string") {
    return { source: value, name: null };
  }
  if (!value || typeof value !== "object") {
    throw new ImageGenError("Each image reference must be a path, URL, or image object", {
      code: "invalid_request",
    });
  }
  const source = nonEmptyString(value.source) ?? nonEmptyString(value.path) ?? nonEmptyString(value.url);
  if (!source) {
    throw new ImageGenError("Image objects require source, path, or url", {
      code: "invalid_request",
    });
  }
  return { source, name: nonEmptyString(value.name) };
}

function normalizeJob(raw, index, config, cwd) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ImageGenError(`jobs[${index}] must be an object`, { code: "invalid_request" });
  }
  const prompt = nonEmptyString(raw.prompt);
  if (!prompt) {
    throw new ImageGenError(`jobs[${index}].prompt is required`, { code: "invalid_request" });
  }

  const id = sanitizeBaseName(raw.id, `image-job-${index + 1}`);
  const count = boundedInteger(raw.count ?? raw.n, 1, 1, 4, `jobs[${index}].count`);
  const quality = nonEmptyString(raw.quality) ?? config.quality;
  if (!SUPPORTED_QUALITIES.has(quality)) {
    throw new ImageGenError(`jobs[${index}].quality must be auto, low, medium, or high`, {
      code: "invalid_request",
    });
  }
  const size = resolveSize({
    size: raw.size,
    aspectRatio: raw.aspectRatio,
    resolution: raw.resolution,
  }, config.size, `jobs[${index}].size`);

  let models;
  if (Array.isArray(raw.models)) {
    models = normalizeModels(raw.models);
  } else if (nonEmptyString(raw.model)) {
    models = raw.strictModel === true
      ? normalizeModels([raw.model])
      : uniqueStrings([raw.model, ...config.models]);
  } else {
    models = [...config.models];
  }

  const explicitOutput = nonEmptyString(raw.output);
  let outputDir;
  let outputName;
  if (explicitOutput) {
    const resolvedOutput = path.resolve(cwd, explicitOutput);
    outputDir = path.dirname(resolvedOutput);
    outputName = path.basename(resolvedOutput, path.extname(resolvedOutput));
  } else {
    outputDir = path.resolve(cwd, nonEmptyString(raw.outputDir) ?? "generated-images");
    outputName = nonEmptyString(raw.outputName) ?? id;
  }

  const images = [...(Array.isArray(raw.images) ? raw.images : [])];
  if (Array.isArray(raw.referenceImages)) {
    images.push(...raw.referenceImages);
  }
  if (images.length > 10) {
    throw new ImageGenError(`jobs[${index}] supports at most 10 reference images`, {
      code: "invalid_request",
    });
  }

  return {
    id,
    prompt,
    images: images.map(normalizeImageSource),
    outputDir,
    outputName: sanitizeBaseName(outputName, id),
    models,
    size: size.size,
    aspectRatio: size.aspectRatio,
    resolution: size.resolution,
    quality,
    count,
    historyDisabled: raw.historyDisabled !== false,
  };
}

export function normalizeRequest(payload, config, { cwd = process.cwd() } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ImageGenError("Request payload must be a JSON object", { code: "invalid_request" });
  }
  const rawJobs = Array.isArray(payload.jobs) ? payload.jobs : [payload];
  if (rawJobs.length === 0) {
    throw new ImageGenError("At least one image job is required", { code: "invalid_request" });
  }
  if (rawJobs.length > 100) {
    throw new ImageGenError("A single invocation supports at most 100 jobs", {
      code: "invalid_request",
    });
  }
  return {
    concurrency: boundedInteger(
      payload.concurrency,
      Math.min(config.maxConcurrency, rawJobs.length),
      1,
      config.maxConcurrency,
      "concurrency",
    ),
    jobs: rawJobs.map((job, index) => normalizeJob(job, index, config, cwd)),
  };
}

function detectImageMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 2 && bytes.subarray(0, 2).toString("ascii") === "BM") {
    return "image/bmp";
  }
  return null;
}

export function imageDimensions(bytes, mime = detectImageMime(bytes)) {
  if (mime === "image/png" && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mime === "image/gif" && bytes.length >= 10) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (mime === "image/bmp" && bytes.length >= 26) {
    return { width: Math.abs(bytes.readInt32LE(18)), height: Math.abs(bytes.readInt32LE(22)) };
  }
  if (mime === "image/webp" && bytes.length >= 30) {
    const chunk = bytes.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8 " && bytes.length >= 30) {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    }
  }
  if (mime === "image/jpeg") {
    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (startOfFrame.has(marker)) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9 || marker >= 0xd0 && marker <= 0xd7) {
        offset += 2;
        continue;
      }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) {
        break;
      }
      offset += 2 + length;
    }
  }
  return { width: null, height: null };
}

function extensionForMime(mime) {
  return new Map([
    ["image/png", ".png"],
    ["image/jpeg", ".jpg"],
    ["image/gif", ".gif"],
    ["image/webp", ".webp"],
    ["image/bmp", ".bmp"],
  ]).get(mime) ?? ".png";
}

function contentType(value) {
  return nonEmptyString(value)?.split(";", 1)[0].toLowerCase() ?? null;
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("request timeout")), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadImageBytes(image, config, fetchImpl, cwd) {
  const source = image.source;
  let bytes;
  let sourceName = image.name;

  if (/^data:image\//iu.test(source)) {
    const match = /^data:([^;,]+);base64,(.+)$/isu.exec(source);
    if (!match) {
      throw new ImageGenError("Only base64 image data URLs are supported", {
        code: "invalid_image",
      });
    }
    bytes = Buffer.from(match[2], "base64");
    sourceName ??= `reference${extensionForMime(match[1].toLowerCase())}`;
  } else if (/^https?:\/\//iu.test(source)) {
    const response = await fetchWithTimeout(fetchImpl, source, {}, config.timeoutMs);
    if (!response.ok) {
      throw new ImageGenError(`Reference image download failed with HTTP ${response.status}`, {
        code: "image_download_failed",
        status: response.status,
      });
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > config.maxInputBytes) {
      throw new ImageGenError("Reference image exceeds maxInputBytes", {
        code: "image_too_large",
      });
    }
    bytes = Buffer.from(await response.arrayBuffer());
    if (!sourceName) {
      const parsed = new URL(source);
      sourceName = path.basename(decodeURIComponent(parsed.pathname)) || "reference-image";
    }
  } else {
    let filePath;
    try {
      filePath = source.startsWith("file:") ? fileURLToPath(source) : path.resolve(cwd, source);
    } catch {
      throw new ImageGenError(`Invalid reference image path: ${source}`, {
        code: "invalid_image",
      });
    }
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new ImageGenError(`Reference image is not a file: ${filePath}`, {
        code: "invalid_image",
      });
    }
    if (stat.size > config.maxInputBytes) {
      throw new ImageGenError(`Reference image exceeds maxInputBytes: ${filePath}`, {
        code: "image_too_large",
      });
    }
    bytes = await fs.readFile(filePath);
    sourceName ??= path.basename(filePath);
  }

  if (bytes.length === 0 || bytes.length > config.maxInputBytes) {
    throw new ImageGenError("Reference image is empty or too large", { code: "image_too_large" });
  }
  const mime = detectImageMime(bytes);
  if (!mime) {
    throw new ImageGenError("Reference input is not a supported PNG, JPEG, GIF, WebP, or BMP image", {
      code: "invalid_image",
    });
  }
  const parsedName = path.parse(sourceName ?? "reference-image");
  return {
    bytes,
    mime,
    name: sanitizeBaseName(parsedName.name, "reference-image") + extensionForMime(mime),
  };
}

async function removeStaleSlot(slotPath, staleMs) {
  try {
    const stat = await fs.stat(slotPath);
    if (Date.now() - stat.mtimeMs > staleMs) {
      await fs.rm(slotPath, { recursive: true, force: true });
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function acquireGlobalSlot(config) {
  const lockRoot = path.join(config.runtimeDir, "slots");
  await fs.mkdir(lockRoot, { recursive: true });
  const startedAt = Date.now();
  const staleMs = Math.max(
    300000,
    config.timeoutMs * (config.maxRetries + 1) + 120000,
  );

  while (Date.now() - startedAt <= config.queueTimeoutMs) {
    for (let index = 0; index < config.maxGlobalConcurrency; index += 1) {
      const slotPath = path.join(lockRoot, `slot-${index}`);
      try {
        await fs.mkdir(slotPath);
        await fs.writeFile(
          path.join(slotPath, "owner.json"),
          `${JSON.stringify({ pid: process.pid, id: randomUUID(), acquiredAt: new Date().toISOString() })}\n`,
          "utf8",
        );
        let released = false;
        return async () => {
          if (!released) {
            released = true;
            await fs.rm(slotPath, { recursive: true, force: true });
          }
        };
      } catch (error) {
        if (error.code !== "EEXIST") {
          throw error;
        }
        await removeStaleSlot(slotPath, staleMs);
      }
    }
    await sleep(125);
  }
  throw new ImageGenError("Timed out waiting for a global image-generation slot", {
    code: "queue_timeout",
  });
}

function redact(value, apiKey) {
  const text = String(value ?? "");
  return apiKey ? text.split(apiKey).join("[REDACTED]") : text;
}

function shouldFallbackModel(error) {
  if (MODEL_FALLBACK_STATUSES.has(error.status)) {
    return true;
  }
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return new Set([400, 404, 422]).has(error.status) &&
    /model|unsupported|not found|not available|unavailable|unknown/iu.test(text);
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ImageGenError(`Image service returned non-JSON data: ${text.slice(0, 300)}`, {
      code: "invalid_response",
      status: response.status,
    });
  }
}

async function callApi(endpoint, buildRequest, config, fetchImpl) {
  const url = `${config.baseUrl}${endpoint}`;
  let lastError = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const release = await acquireGlobalSlot(config);
    try {
      const request = buildRequest();
      const response = await fetchWithTimeout(
        fetchImpl,
        url,
        {
          method: "POST",
          ...request,
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            ...(request.headers ?? {}),
          },
        },
        config.timeoutMs,
      );
      const body = await parseResponse(response);
      if (response.ok) {
        return body;
      }
      const message = redact(body?.error?.message ?? body?.detail ?? `HTTP ${response.status}`, config.apiKey);
      lastError = new ImageGenError(message, {
        code: body?.error?.code ?? "api_error",
        status: response.status,
      });
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === config.maxRetries) {
        throw lastError;
      }
    } catch (error) {
      lastError = error instanceof ImageGenError
        ? error
        : new ImageGenError(redact(error.message, config.apiKey), { code: "network_error" });
      if (attempt === config.maxRetries || lastError.status && !RETRYABLE_STATUSES.has(lastError.status)) {
        throw lastError;
      }
    } finally {
      await release();
    }
    await sleep(Math.min(2000, 250 * 2 ** attempt));
  }
  throw lastError;
}

function generationBody(job, model) {
  return {
    model,
    prompt: job.prompt,
    n: job.count,
    size: job.size,
    quality: job.quality,
    response_format: "b64_json",
    history_disabled: job.historyDisabled,
  };
}

function editBody(job, inputs, model) {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", job.prompt);
  form.append("n", String(job.count));
  form.append("size", job.size);
  form.append("quality", job.quality);
  form.append("response_format", "b64_json");
  for (const input of inputs) {
    form.append("image", new Blob([input.bytes], { type: input.mime }), input.name);
  }
  return form;
}

async function responseItemBytes(item, config, fetchImpl) {
  if (nonEmptyString(item?.b64_json)) {
    const raw = item.b64_json.replace(/^data:[^;,]+;base64,/iu, "");
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length === 0) {
      throw new ImageGenError("Image service returned an empty base64 image", {
        code: "invalid_response",
      });
    }
    return { bytes, mime: detectImageMime(bytes) ?? "image/png" };
  }
  if (nonEmptyString(item?.url)) {
    const response = await fetchWithTimeout(fetchImpl, item.url, {}, config.timeoutMs);
    if (!response.ok) {
      throw new ImageGenError(`Generated image download failed with HTTP ${response.status}`, {
        code: "image_download_failed",
        status: response.status,
      });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      bytes,
      mime: detectImageMime(bytes) ?? contentType(response.headers.get("content-type")) ?? "image/png",
    };
  }
  throw new ImageGenError("Image response contains neither b64_json nor url", {
    code: "invalid_response",
  });
}

async function writeUniqueFile(outputDir, baseName, index, total, extension, bytes) {
  await fs.mkdir(outputDir, { recursive: true });
  const indexedBase = total > 1 ? `${baseName}-${index + 1}` : baseName;
  for (let collision = 0; collision < 10000; collision += 1) {
    const suffix = collision === 0 ? "" : `-${collision + 1}`;
    const filePath = path.join(outputDir, `${indexedBase}${suffix}${extension}`);
    try {
      await fs.writeFile(filePath, bytes, { flag: "wx" });
      return filePath;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
  }
  throw new ImageGenError(`Could not allocate a unique file name in ${outputDir}`, {
    code: "output_collision",
  });
}

async function persistResponse(job, body, config, fetchImpl) {
  if (!Array.isArray(body?.data) || body.data.length === 0) {
    throw new ImageGenError("Image service returned no image data", { code: "invalid_response" });
  }
  const requested = validatedDimensions(job.size, "size");
  const files = [];
  for (let index = 0; index < body.data.length; index += 1) {
    const item = body.data[index];
    const resolved = await responseItemBytes(item, config, fetchImpl);
    const dimensions = imageDimensions(resolved.bytes, resolved.mime);
    const filePath = await writeUniqueFile(
      job.outputDir,
      job.outputName,
      index,
      body.data.length,
      extensionForMime(resolved.mime),
      resolved.bytes,
    );
    const absolutePath = path.resolve(filePath);
    const directory = path.dirname(absolutePath);
    files.push({
      path: absolutePath,
      fileUrl: pathToFileURL(absolutePath).href,
      directory,
      directoryUrl: pathToFileURL(`${directory}${path.sep}`).href,
      serviceUrl: nonEmptyString(item.url),
      revisedPrompt: nonEmptyString(item.revised_prompt),
      bytes: resolved.bytes.length,
      width: dimensions.width,
      height: dimensions.height,
      requestedWidth: requested.width,
      requestedHeight: requested.height,
      sizeMatched: dimensions.width === null || dimensions.height === null
        ? null
        : dimensions.width === requested.width && dimensions.height === requested.height,
    });
  }
  return files;
}

async function runJob(job, config, fetchImpl, cwd) {
  const startedAt = Date.now();
  const inputs = await Promise.all(
    job.images.map((image) => loadImageBytes(image, config, fetchImpl, cwd)),
  );
  const mode = inputs.length > 0 ? "edit" : "generate";
  const modelAttempts = [];
  let body = null;
  let selectedModel = null;

  for (let index = 0; index < job.models.length; index += 1) {
    const model = job.models[index];
    try {
      body = mode === "generate"
        ? await callApi(
            "/images/generations",
            () => ({
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(generationBody(job, model)),
            }),
            config,
            fetchImpl,
          )
        : await callApi(
            "/images/edits",
            () => ({ body: editBody(job, inputs, model) }),
            config,
            fetchImpl,
          );
      selectedModel = model;
      modelAttempts.push({ model, status: "ok", code: null, httpStatus: 200 });
      break;
    } catch (error) {
      modelAttempts.push({
        model,
        status: "error",
        code: error.code ?? "image_gen_error",
        httpStatus: error.status ?? null,
      });
      if (index === job.models.length - 1 || !shouldFallbackModel(error)) {
        throw new ImageGenError(error.message, {
          code: error.code,
          status: error.status,
          details: { modelAttempts },
        });
      }
    }
  }

  const files = await persistResponse(job, body, config, fetchImpl);
  const warnings = files
    .filter((file) => file.sizeMatched === false)
    .map((file) =>
      `Requested ${file.requestedWidth}x${file.requestedHeight}, but the service returned ${file.width}x${file.height}`,
    );
  return {
    id: job.id,
    status: "ok",
    mode,
    model: selectedModel,
    requestedModels: job.models,
    modelAttempts,
    fallbackUsed: selectedModel !== job.models[0],
    size: job.size,
    aspectRatio: job.aspectRatio,
    resolution: job.resolution,
    quality: job.quality,
    inputCount: inputs.length,
    durationMs: Date.now() - startedAt,
    files,
    warnings,
    usage: body?.usage ?? null,
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function consume() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

function errorResult(job, error, apiKey) {
  return {
    id: job.id,
    status: "error",
    error: {
      code: error.code ?? "image_gen_error",
      message: redact(error.message, apiKey),
      status: error.status ?? null,
      details: error.details ?? null,
    },
  };
}

export async function runJobs(payload, options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ImageGenError("Node.js 18 or newer with fetch support is required", {
      code: "unsupported_runtime",
    });
  }
  const config = options.config
    ? normalizeConfig(options.config, { homeDir: options.homeDir ?? os.homedir() })
    : await loadConfig(options);
  if (!config.apiKey) {
    throw new ImageGenError(
      "Missing API key. Set EKKO_IMAGE_GEN_API_KEY or ~/.claude/ekko-image-gen.local.json",
      { code: "missing_api_key" },
    );
  }

  const request = normalizeRequest(payload, config, { cwd });
  const startedAt = Date.now();
  const jobs = await mapLimit(request.jobs, request.concurrency, async (job) => {
    try {
      return await runJob(job, config, fetchImpl, cwd);
    } catch (error) {
      return errorResult(job, error, config.apiKey);
    }
  });
  const succeeded = jobs.filter((job) => job.status === "ok").length;
  const failed = jobs.length - succeeded;
  return {
    status: failed === 0 ? "ok" : succeeded === 0 ? "error" : "partial",
    summary: {
      total: jobs.length,
      succeeded,
      failed,
      durationMs: Date.now() - startedAt,
      concurrency: request.concurrency,
      globalConcurrency: config.maxGlobalConcurrency,
    },
    jobs,
  };
}

function helpText() {
  return `Usage: node image-gen.mjs [--request FILE]\n\nRead a JSON request from FILE or stdin.\nConfiguration: ~/.claude/ekko-image-gen.local.json\nEnvironment overrides: EKKO_IMAGE_GEN_BASE_URL, EKKO_IMAGE_GEN_API_KEY,\nEKKO_IMAGE_GEN_MODELS, EKKO_IMAGE_GEN_MODEL, EKKO_IMAGE_GEN_SIZE,\nEKKO_IMAGE_GEN_ASPECT_RATIO, EKKO_IMAGE_GEN_RESOLUTION, EKKO_IMAGE_GEN_QUALITY,\nEKKO_IMAGE_GEN_MAX_CONCURRENCY, EKKO_IMAGE_GEN_MAX_GLOBAL_CONCURRENCY.\n`;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readPayload(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }
  const requestIndex = argv.indexOf("--request");
  if (requestIndex >= 0) {
    const file = argv[requestIndex + 1];
    if (!file) {
      throw new ImageGenError("--request requires a JSON file path", { code: "invalid_request" });
    }
    return { payload: JSON.parse(await fs.readFile(path.resolve(file), "utf8")) };
  }
  const text = await readStdin();
  if (!text.trim()) {
    throw new ImageGenError("Provide a JSON request on stdin or with --request FILE", {
      code: "invalid_request",
    });
  }
  return { payload: JSON.parse(text) };
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const input = await readPayload(argv);
    if (input.help) {
      process.stdout.write(helpText());
      return 0;
    }
    const result = await runJobs(input.payload);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.status === "ok" ? 0 : result.status === "partial" ? 2 : 1;
  } catch (error) {
    const result = {
      status: "error",
      error: {
        code: error.code ?? (error instanceof SyntaxError ? "invalid_json" : "image_gen_error"),
        message: error.message,
        status: error.status ?? null,
      },
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  process.exitCode = await main();
}
