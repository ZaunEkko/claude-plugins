import { randomBytes, randomUUID } from "node:crypto";
import { spawn as nodeSpawn } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { detectImageMime } from "./image-gen.mjs";

const MAX_REQUEST_BYTES = 40 * 1024;
const MAX_PATH_BYTES = 8 * 1024;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 200 * 1024 * 1024;
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MIN_TTL_MS = 250;
const HANDSHAKE_TIMEOUT_MS = 5000;
const FORBIDDEN_PATH_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/u;
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/u;

const MIME_BY_EXTENSION = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
]);

export class ImagePreviewError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "ImagePreviewError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new ImagePreviewError(code, message, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

export function parsePreviewRequest(text) {
  if (typeof text !== "string" || text.trim() === "") {
    fail("invalid_request", "Expected one JSON object on stdin.");
  }
  if (byteLength(text) > MAX_REQUEST_BYTES) {
    fail("invalid_request", `Preview request exceeds ${MAX_REQUEST_BYTES} bytes.`);
  }

  let request;
  try {
    request = JSON.parse(text);
  } catch {
    fail("invalid_request", "Preview request must be valid JSON.");
  }

  if (!isPlainObject(request)) {
    fail("invalid_request", "Preview request must be a JSON object.");
  }
  const keys = Object.keys(request);
  if (keys.length !== 1 || keys[0] !== "paths") {
    fail("invalid_request", "Preview request must contain only a paths property.");
  }
  if (!Array.isArray(request.paths) || request.paths.length < 1 || request.paths.length > MAX_IMAGES) {
    fail("invalid_request", `paths must contain from 1 to ${MAX_IMAGES} image paths.`);
  }
  for (const inputPath of request.paths) {
    if (typeof inputPath !== "string" || inputPath.trim() === "") {
      fail("invalid_path", "Every preview path must be a non-empty string.");
    }
    if (byteLength(inputPath) > MAX_PATH_BYTES) {
      fail("invalid_path", `A preview path exceeds ${MAX_PATH_BYTES} bytes.`);
    }
  }

  return { paths: request.paths };
}

export function validatePathSyntax(inputPath, platform = process.platform) {
  if (FORBIDDEN_PATH_CHARACTERS.test(inputPath)) {
    fail("invalid_path", "path contains control or bidirectional formatting characters.");
  }

  if (platform === "win32") {
    if (URI_SCHEME.test(inputPath) && !WINDOWS_DRIVE_PATH.test(inputPath)) {
      fail("invalid_path", "path must be an absolute local filesystem path, not a URI.");
    }
    if (!WINDOWS_DRIVE_PATH.test(inputPath) || !path.win32.isAbsolute(inputPath)) {
      fail("invalid_path", "path must be an absolute Windows drive path.");
    }
    if (inputPath.startsWith("\\\\")) {
      fail("invalid_path", "UNC and Windows device paths are not supported.");
    }
    if (inputPath.slice(2).includes(":")) {
      fail("invalid_path", "Windows alternate data streams are not supported.");
    }
    return path.win32.normalize(inputPath);
  }

  if (URI_SCHEME.test(inputPath)) {
    fail("invalid_path", "path must be an absolute local filesystem path, not a URI.");
  }
  if (!path.posix.isAbsolute(inputPath)) {
    fail("invalid_path", "path must be an absolute local filesystem path.");
  }
  return path.posix.normalize(inputPath);
}

function fileError(error, inputPath) {
  if (error instanceof ImagePreviewError) {
    throw error;
  }
  if (error?.code === "ENOENT") {
    fail("path_not_found", `Image file does not exist: ${inputPath}`);
  }
  fail("invalid_path", `Cannot inspect image path: ${error.message}`);
}

async function readImageHeader(filePath, fsApi) {
  const handle = await fsApi.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function inspectImagePath(inputPath, options = {}) {
  const platform = options.platform ?? process.platform;
  const fsApi = options.fsApi ?? fs;
  const normalizedPath = validatePathSyntax(inputPath, platform);

  try {
    const lexicalStat = await fsApi.lstat(normalizedPath);
    if (lexicalStat.isSymbolicLink()) {
      fail("symlink_not_allowed", "The final image path must not be a symbolic link.");
    }
    if (!lexicalStat.isFile()) {
      fail("not_regular_file", "The image path must refer to a regular file.");
    }

    const canonicalPath = await fsApi.realpath(normalizedPath);
    const canonicalStat = await fsApi.stat(canonicalPath);
    if (!canonicalStat.isFile()) {
      fail("not_regular_file", "The resolved image path must refer to a regular file.");
    }
    if (canonicalStat.size > MAX_IMAGE_BYTES) {
      fail("image_too_large", `Preview image exceeds ${MAX_IMAGE_BYTES} bytes.`);
    }

    const extension = path.extname(canonicalPath).toLowerCase();
    const expectedMime = MIME_BY_EXTENSION.get(extension);
    if (!expectedMime) {
      fail("unsupported_image", `Unsupported image extension: ${extension || "(none)"}`);
    }

    const header = await readImageHeader(canonicalPath, fsApi);
    const detectedMime = detectImageMime(header);
    if (!detectedMime) {
      fail("unsupported_image", "File contents are not a supported image format.");
    }
    if (detectedMime !== expectedMime) {
      fail(
        "unsupported_image",
        `Image extension ${extension} does not match detected format ${detectedMime}.`,
      );
    }

    return {
      path: canonicalPath,
      name: path.basename(canonicalPath),
      mime: detectedMime,
      bytes: canonicalStat.size,
    };
  } catch (error) {
    fileError(error, normalizedPath);
  }
}

function encodeHeaderFilename(name) {
  return encodeURIComponent(name).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function previewHeaders(image) {
  const encodedName = encodeHeaderFilename(image.name);
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
    "Content-Length": String(image.bytes),
    "Content-Security-Policy": "default-src 'none'; img-src 'self'",
    "Content-Type": image.mime,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

async function inspectOpenedImage(handle, image) {
  const stat = await handle.stat();
  if (!stat.isFile()) {
    fail("not_regular_file", "The opened preview target must be a regular file.");
  }
  if (stat.size > MAX_IMAGE_BYTES) {
    fail("image_too_large", `Preview image exceeds ${MAX_IMAGE_BYTES} bytes.`);
  }
  const header = Buffer.alloc(32);
  const { bytesRead } = await handle.read(header, 0, header.length, 0);
  const detectedMime = detectImageMime(header.subarray(0, bytesRead));
  if (detectedMime !== image.mime) {
    fail("unsupported_image", "Image contents changed before the preview server opened the file.");
  }
  return { ...image, bytes: stat.size };
}

export async function startPreviewServer(images, options = {}) {
  const token = options.token ?? randomBytes(24).toString("base64url");
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (!Array.isArray(images) || images.length < 1 || images.length > MAX_IMAGES) {
    fail("invalid_request", `Preview server requires from 1 to ${MAX_IMAGES} images.`);
  }
  if (!/^[A-Za-z0-9_-]{32,128}$/u.test(token)) {
    fail("invalid_request", "Preview token must be a base64url value with at least 192 bits of entropy.");
  }
  if (!Number.isInteger(ttlMs) || ttlMs < MIN_TTL_MS || ttlMs > DEFAULT_TTL_MS) {
    fail("invalid_request", `Preview TTL must be an integer from ${MIN_TTL_MS} to ${DEFAULT_TTL_MS} milliseconds.`);
  }

  const host = "127.0.0.1";
  const handles = [];
  const routes = new Map();
  let expectedHost = null;

  try {
    for (const [index, image] of images.entries()) {
      const handle = await fs.open(image.path, "r");
      handles.push(handle);
      const openedImage = await inspectOpenedImage(handle, image);
      const route = `/${token}/${index + 1}/${encodeURIComponent(openedImage.name)}`;
      routes.set(route, { ...openedImage, handle });
    }
  } catch (error) {
    await Promise.allSettled(handles.map((handle) => handle.close()));
    throw error;
  }

  const server = http.createServer((request, response) => {
    const requestPath = request.url?.split("?", 1)[0] ?? "";
    const image = routes.get(requestPath);
    if (request.headers.host !== expectedHost || !image || !["GET", "HEAD"].includes(request.method ?? "")) {
      response.writeHead(404, {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'",
        "Content-Type": "text/plain; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      response.end("Not found\n");
      return;
    }

    response.writeHead(200, previewHeaders(image));
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = createReadStream(image.path, {
      fd: image.handle.fd,
      autoClose: false,
      start: 0,
      end: Math.max(0, image.bytes - 1),
    });
    stream.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      response.destroy();
    });
    stream.pipe(response);
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 1_000;
  server.maxRequestsPerSocket = 8;

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, host, resolve);
    });
  } catch (error) {
    server.closeAllConnections?.();
    await Promise.allSettled(handles.map((handle) => handle.close()));
    throw error;
  }

  let closed = false;
  const close = async () => {
    if (closed) {
      return;
    }
    closed = true;
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
    await Promise.allSettled(handles.map((handle) => handle.close()));
  };
  const address = server.address();
  expectedHost = `${host}:${address.port}`;
  const timer = setTimeout(() => {
    close().catch(() => {});
  }, ttlMs);
  const files = [...routes.entries()].map(([route, image]) => ({
    path: image.path,
    url: `http://${host}:${address.port}${route}`,
  }));

  return {
    status: "ready",
    host,
    port: address.port,
    expiresInSeconds: Math.ceil(ttlMs / 1000),
    files,
    close: async () => {
      clearTimeout(timer);
      await close();
    },
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHandshake(handshakePath, child, options = {}) {
  const fsApi = options.fsApi ?? fs;
  const timeoutMs = options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS;
  const startedAt = Date.now();
  let childError = null;
  let childExit = null;
  child.once("error", (error) => {
    childError = error;
  });
  child.once("exit", (code, signal) => {
    childExit = { code, signal };
  });

  while (Date.now() - startedAt < timeoutMs) {
    if (childError) {
      throw childError;
    }
    try {
      const handshake = JSON.parse(await fsApi.readFile(handshakePath, "utf8"));
      await fsApi.rm(handshakePath, { force: true });
      if (handshake.status !== "ready") {
        fail(
          handshake.error?.code ?? "preview_start_failed",
          handshake.error?.message ?? "Preview server failed to start.",
        );
      }
      return handshake;
    } catch (error) {
      if (error instanceof ImagePreviewError) {
        throw error;
      }
      if (error?.name !== "SyntaxError" && error?.code !== "ENOENT") {
        throw error;
      }
    }
    if (childExit) {
      fail(
        "preview_start_failed",
        `Preview server exited before becoming ready (${childExit.code ?? childExit.signal ?? "unknown"}).`,
      );
    }
    await sleep(25);
  }

  fail("preview_start_failed", "Timed out while starting the local image preview server.");
}

export async function launchPreviewProcess(images, options = {}) {
  const fsApi = options.fsApi ?? fs;
  const spawnImpl = options.spawnImpl ?? nodeSpawn;
  const runtimeDir = options.runtimeDir ?? os.tmpdir();
  const launchId = randomUUID();
  const launchPath = path.join(runtimeDir, `ekko-image-preview-${launchId}.json`);
  const handshakePath = path.join(runtimeDir, `ekko-image-preview-${launchId}.ready.json`);
  const payload = {
    paths: images.map((image) => image.path),
    token: randomBytes(24).toString("base64url"),
    ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
  };

  await fsApi.writeFile(launchPath, JSON.stringify(payload), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });

  let child;
  try {
    child = spawnImpl(process.execPath, [fileURLToPath(import.meta.url), "--serve", launchPath, handshakePath], {
      shell: false,
      detached: true,
      windowsHide: true,
      stdio: "ignore",
    });
    const handshake = await waitForHandshake(handshakePath, child, options);
    child.unref?.();
    return handshake;
  } catch (error) {
    child?.kill?.();
    await Promise.allSettled([
      fsApi.rm(launchPath, { force: true }),
      fsApi.rm(handshakePath, { force: true }),
    ]);
    if (error?.code === "ENOENT") {
      fail("preview_start_failed", "Node.js could not start the local image preview server.");
    }
    throw error;
  }
}

export async function createPreviewLinks(request, options = {}) {
  const images = [];
  for (const inputPath of request.paths) {
    images.push(await inspectImagePath(inputPath, options));
  }
  const launch = options.launchPreviewProcess ?? launchPreviewProcess;
  return launch(images, options);
}

export async function readStdin(input = process.stdin) {
  const chunks = [];
  let total = 0;
  for await (const chunk of input) {
    total += chunk.length;
    if (total > MAX_REQUEST_BYTES) {
      fail("invalid_request", `Preview request exceeds ${MAX_REQUEST_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function errorResult(error) {
  return {
    status: "failed",
    error: {
      code: error.code ?? "preview_start_failed",
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

async function writeHandshake(handshakePath, value) {
  await fs.writeFile(handshakePath, JSON.stringify(value), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function normalizedPathForComparison(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function validateServePaths(launchPath, handshakePath) {
  const resolvedLaunch = path.resolve(launchPath);
  const resolvedHandshake = path.resolve(handshakePath);
  const runtimeDirectory = normalizedPathForComparison(os.tmpdir());
  if (
    normalizedPathForComparison(path.dirname(resolvedLaunch)) !== runtimeDirectory ||
    normalizedPathForComparison(path.dirname(resolvedHandshake)) !== runtimeDirectory
  ) {
    fail("invalid_request", "Preview server state files must be direct children of the operating-system temporary directory.");
  }

  const match = /^ekko-image-preview-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/u
    .exec(path.basename(resolvedLaunch));
  if (!match || path.basename(resolvedHandshake) !== `ekko-image-preview-${match[1]}.ready.json`) {
    fail("invalid_request", "Preview server state filenames are invalid.");
  }
  return { launchPath: resolvedLaunch, handshakePath: resolvedHandshake };
}

async function serveMain(rawLaunchPath, rawHandshakePath) {
  let launchPath;
  let handshakePath;
  try {
    ({ launchPath, handshakePath } = validateServePaths(rawLaunchPath, rawHandshakePath));
  } catch {
    process.exitCode = 1;
    return;
  }

  let preview = null;
  try {
    const launchStat = await fs.lstat(launchPath);
    if (launchStat.isSymbolicLink() || !launchStat.isFile()) {
      fail("invalid_request", "Preview server launch state must be a regular non-symlink file.");
    }
    const payload = JSON.parse(await fs.readFile(launchPath, "utf8"));
    await fs.rm(launchPath, { force: true });
    if (!isPlainObject(payload) || Object.keys(payload).sort().join(",") !== "paths,token,ttlMs") {
      fail("invalid_request", "Invalid preview server launch payload.");
    }
    const request = parsePreviewRequest(JSON.stringify({ paths: payload.paths }));
    if (!/^[A-Za-z0-9_-]{32,128}$/u.test(payload.token)) {
      fail("invalid_request", "Invalid preview server token.");
    }
    if (!Number.isInteger(payload.ttlMs) || payload.ttlMs < MIN_TTL_MS || payload.ttlMs > DEFAULT_TTL_MS) {
      fail("invalid_request", "Invalid preview server TTL.");
    }
    const images = [];
    for (const inputPath of request.paths) {
      images.push(await inspectImagePath(inputPath));
    }
    preview = await startPreviewServer(images, {
      token: payload.token,
      ttlMs: payload.ttlMs,
    });
    await writeHandshake(handshakePath, {
      status: preview.status,
      pid: process.pid,
      expiresInSeconds: preview.expiresInSeconds,
      files: preview.files,
    });
  } catch (error) {
    if (preview) {
      await preview.close().catch(() => {});
    }
    await fs.rm(launchPath, { force: true }).catch(() => {});
    await writeHandshake(handshakePath, errorResult(error)).catch(() => {});
    process.exitCode = 1;
  }
}

export async function main(argv = process.argv.slice(2), options = {}) {
  if (argv[0] === "--serve") {
    if (argv.length !== 3) {
      process.exitCode = 1;
      return 1;
    }
    await serveMain(argv[1], argv[2]);
    return process.exitCode ?? 0;
  }

  const stdout = options.stdout ?? process.stdout;
  const input = options.stdin ?? process.stdin;
  try {
    if (argv.length > 0) {
      fail("invalid_request", "Pass the preview request as JSON on stdin; command-line arguments are not accepted.");
    }
    const request = parsePreviewRequest(await readStdin(input));
    const result = await createPreviewLinks(request, options);
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    stdout.write(`${JSON.stringify(errorResult(error), null, 2)}\n`);
    return 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  process.exitCode = await main();
}
