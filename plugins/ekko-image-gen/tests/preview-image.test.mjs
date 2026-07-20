import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createPreviewLinks,
  inspectImagePath,
  launchPreviewProcess,
  main,
  parsePreviewRequest,
  startPreviewServer,
  validatePathSyntax,
} from "../scripts/preview-image.mjs";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlB7t8AAAAASUVORK5CYII=",
  "base64",
);

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ekko-preview-image-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

function assertCode(code) {
  return (error) => {
    assert.equal(error.code, code);
    return true;
  };
}

test("accepts one to four local paths from bounded stdin JSON", () => {
  assert.deepEqual(parsePreviewRequest('{"paths":["/tmp/example.png"]}'), {
    paths: ["/tmp/example.png"],
  });
  assert.throws(() => parsePreviewRequest(""), assertCode("invalid_request"));
  assert.throws(() => parsePreviewRequest("{"), assertCode("invalid_request"));
  assert.throws(() => parsePreviewRequest("[]"), assertCode("invalid_request"));
  assert.throws(() => parsePreviewRequest('{"path":"/tmp/a.png"}'), assertCode("invalid_request"));
  assert.throws(() => parsePreviewRequest('{"paths":[]}'), assertCode("invalid_request"));
  assert.throws(
    () => parsePreviewRequest(JSON.stringify({ paths: ["a", "b", "c", "d", "e"] })),
    assertCode("invalid_request"),
  );
  assert.throws(() => parsePreviewRequest('{"paths":[""]}'), assertCode("invalid_path"));
});

test("rejects relative paths, URIs, control characters, UNC paths, and alternate streams", () => {
  assert.throws(() => validatePathSyntax("relative.png", "linux"), assertCode("invalid_path"));
  assert.throws(() => validatePathSyntax("file:///tmp/example.png", "linux"), assertCode("invalid_path"));
  assert.throws(() => validatePathSyntax("https://example.test/image.png", "linux"), assertCode("invalid_path"));
  assert.throws(() => validatePathSyntax("/tmp/bad\nname.png", "linux"), assertCode("invalid_path"));
  assert.throws(() => validatePathSyntax("\\\\server\\share\\image.png", "win32"), assertCode("invalid_path"));
  assert.throws(() => validatePathSyntax("C:\\images\\image.png:stream", "win32"), assertCode("invalid_path"));
  assert.equal(validatePathSyntax("C:\\images\\example.png", "win32"), "C:\\images\\example.png");
});

test("validates regular files by extension and image signature", async (t) => {
  const directory = await temporaryDirectory(t);
  const fixtures = new Map([
    ["png", PNG_BYTES],
    ["jpg", Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ["gif", Buffer.from("GIF89a", "ascii")],
    ["webp", Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WEBP", "ascii")])],
    ["bmp", Buffer.from("BM", "ascii")],
  ]);

  for (const [extension, bytes] of fixtures) {
    const filePath = path.join(directory, `sample.${extension}`);
    await fs.writeFile(filePath, bytes);
    const inspected = await inspectImagePath(filePath);
    assert.equal(inspected.path, await fs.realpath(filePath));
    assert.equal(inspected.bytes, bytes.length);
    assert.match(inspected.mime, /^image\//u);
  }

  const shellLookingPath = path.join(directory, "image $(touch should-not-run); quoted.png");
  await fs.writeFile(shellLookingPath, PNG_BYTES);
  assert.equal((await inspectImagePath(shellLookingPath)).path, await fs.realpath(shellLookingPath));

  const mismatchPath = path.join(directory, "mismatch.jpg");
  await fs.writeFile(mismatchPath, PNG_BYTES);
  await assert.rejects(inspectImagePath(mismatchPath), assertCode("unsupported_image"));

  const invalidPath = path.join(directory, "invalid.png");
  await fs.writeFile(invalidPath, "not an image");
  await assert.rejects(inspectImagePath(invalidPath), assertCode("unsupported_image"));

  const unsupportedPath = path.join(directory, "unsupported.svg");
  await fs.writeFile(unsupportedPath, "<svg/>");
  await assert.rejects(inspectImagePath(unsupportedPath), assertCode("unsupported_image"));
  await assert.rejects(inspectImagePath(directory), assertCode("not_regular_file"));
  await assert.rejects(inspectImagePath(path.join(directory, "missing.png")), assertCode("path_not_found"));
});

test("rejects a symbolic link as the final path component", async () => {
  const fakePath = path.resolve("symbolic-image.png");
  const fsApi = {
    lstat: async () => ({
      isSymbolicLink: () => true,
      isFile: () => false,
    }),
  };

  await assert.rejects(
    inspectImagePath(fakePath, { fsApi }),
    assertCode("symlink_not_allowed"),
  );
});

test("serves only the accepted image over a tokenized loopback HTTP URL", async (t) => {
  const directory = await temporaryDirectory(t);
  const imagePath = path.join(directory, "预览 image.png");
  await fs.writeFile(imagePath, PNG_BYTES);
  const image = await inspectImagePath(imagePath);
  const preview = await startPreviewServer([image], {
    token: "0123456789abcdef0123456789abcdef",
    ttlMs: 60_000,
  });
  t.after(() => preview.close());

  assert.equal(preview.status, "ready");
  assert.equal(preview.host, "127.0.0.1");
  assert.equal(preview.files.length, 1);
  assert.match(preview.files[0].url, /^http:\/\/127\.0\.0\.1:\d+\/0123456789abcdef0123456789abcdef\/1\//u);

  const response = await fetch(preview.files[0].url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG_BYTES);

  const head = await fetch(preview.files[0].url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const guessed = await fetch(`http://127.0.0.1:${preview.port}/wrong-token/1/image.png`);
  assert.equal(guessed.status, 404);
});

test("creates preview links from canonical paths without launching a GUI", async (t) => {
  const directory = await temporaryDirectory(t);
  const imagePath = path.join(directory, "accepted.png");
  await fs.writeFile(imagePath, PNG_BYTES);
  let receivedImages = null;

  const result = await createPreviewLinks({ paths: [imagePath] }, {
    launchPreviewProcess: async (images) => {
      receivedImages = images;
      return {
        status: "ready",
        expiresInSeconds: 900,
        files: images.map((image) => ({
          path: image.path,
          url: "http://127.0.0.1:43210/token/1/accepted.png",
        })),
      };
    },
  });

  assert.equal(receivedImages.length, 1);
  assert.equal(receivedImages[0].path, await fs.realpath(imagePath));
  assert.equal(result.status, "ready");
  assert.match(result.files[0].url, /^http:\/\/127\.0\.0\.1:/u);
});

test("closes the server when the detached handshake cannot be published", async (t) => {
  const directory = await temporaryDirectory(t);
  const imagePath = path.join(directory, "handshake-failure.png");
  await fs.writeFile(imagePath, PNG_BYTES);
  const launchId = randomUUID();
  const launchPath = path.join(os.tmpdir(), `ekko-image-preview-${launchId}.json`);
  const handshakePath = path.join(os.tmpdir(), `ekko-image-preview-${launchId}.ready.json`);
  t.after(() => Promise.allSettled([
    fs.rm(launchPath, { force: true }),
    fs.rm(handshakePath, { force: true }),
  ]));
  await fs.writeFile(launchPath, JSON.stringify({
    paths: [imagePath],
    token: "0123456789abcdef0123456789abcdef",
    ttlMs: 250,
  }), { flag: "wx" });
  await fs.writeFile(handshakePath, "occupied", { flag: "wx" });

  const previousExitCode = process.exitCode;
  try {
    process.exitCode = 0;
    const startedAt = Date.now();
    const exitCode = await main(["--serve", launchPath, handshakePath]);
    assert.equal(exitCode, 1);
    assert.ok(Date.now() - startedAt < 2000);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test("starts a real detached preview child and expires it automatically", async (t) => {
  const directory = await temporaryDirectory(t);
  const imagePath = path.join(directory, "detached-preview.png");
  await fs.writeFile(imagePath, PNG_BYTES);
  const image = await inspectImagePath(imagePath);

  const preview = await launchPreviewProcess([image], { ttlMs: 1500 });
  assert.equal(preview.status, "ready");
  assert.equal(preview.expiresInSeconds, 2);
  const response = await fetch(preview.files[0].url);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG_BYTES);

  const deadline = Date.now() + 4000;
  let expired = false;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      await fetch(preview.files[0].url);
    } catch {
      expired = true;
      break;
    }
  }
  assert.equal(expired, true, "expected the detached loopback server to expire");
});

test("launches the detached preview child without a shell", async () => {
  const writes = [];
  const removals = [];
  const child = new EventEmitter();
  child.unrefCalled = false;
  child.unref = () => {
    child.unrefCalled = true;
  };
  const spawnCalls = [];
  const fsApi = {
    writeFile: async (filePath, contents, options) => {
      writes.push({ filePath, contents, options });
    },
    readFile: async () => JSON.stringify({
      status: "ready",
      pid: 1234,
      expiresInSeconds: 900,
      files: [{
        path: "/tmp/accepted.png",
        url: "http://127.0.0.1:43210/token/1/accepted.png",
      }],
    }),
    rm: async (filePath) => {
      removals.push(filePath);
    },
  };
  const spawnImpl = (executable, args, options) => {
    spawnCalls.push({ executable, args, options });
    return child;
  };

  const result = await launchPreviewProcess([{ path: "/tmp/accepted.png" }], {
    fsApi,
    spawnImpl,
    runtimeDir: "/tmp",
  });

  assert.equal(result.status, "ready");
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0].contents).paths, ["/tmp/accepted.png"]);
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].args[1], "--serve");
  assert.deepEqual(spawnCalls[0].options, {
    shell: false,
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  });
  assert.equal(child.unrefCalled, true);
  assert.equal(removals.length, 1);
});
