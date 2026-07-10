#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { resolveSessionModel, validateModelId } from "./resolve-session-model.mjs";

const ATTRIBUTION_MARKER = "Generated with [Claude Code](https://claude.ai/code)";
const MODEL_LINE = /^Model:\s*.*$/u;

function splitLineRanges(buffer) {
  const ranges = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0x0a) {
      continue;
    }
    const contentEnd = index > start && buffer[index - 1] === 0x0d ? index - 1 : index;
    ranges.push({ start, contentEnd, end: index + 1 });
    start = index + 1;
  }
  if (start < buffer.length) {
    const contentEnd = buffer.length > start && buffer.at(-1) === 0x0d ? buffer.length - 1 : buffer.length;
    ranges.push({ start, contentEnd, end: buffer.length });
  }
  return ranges;
}

export function renderCommitBuffer(buffer, modelDisplay) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("commit message must be a Buffer");
  }
  if (buffer.includes(0x00)) {
    throw new Error("commit message contains a NUL byte");
  }
  const safeModel = validateModelId(modelDisplay);
  if (!safeModel) {
    throw new Error("resolved model is not safe for a single-line attribution");
  }

  const ranges = splitLineRanges(buffer);
  let markerIndex = -1;
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const line = buffer.subarray(range.start, range.contentEnd).toString("utf8");
    if (line === ATTRIBUTION_MARKER) {
      markerIndex = index;
    }
  }

  if (markerIndex < 0) {
    return { buffer, changed: false };
  }

  let target = null;
  for (let index = markerIndex + 1; index < ranges.length; index += 1) {
    const range = ranges[index];
    const line = buffer.subarray(range.start, range.contentEnd).toString("utf8");
    if (MODEL_LINE.test(line)) {
      target = range;
    }
  }

  if (!target) {
    return { buffer, changed: false };
  }

  const lineEnding = buffer.subarray(target.contentEnd, target.end);
  const replacement = Buffer.concat([Buffer.from(`Model: ${safeModel}`, "utf8"), lineEnding]);
  return {
    buffer: Buffer.concat([
      buffer.subarray(0, target.start),
      replacement,
      buffer.subarray(target.end),
    ]),
    changed: true,
  };
}

function atomicReplace(filePath, buffer, mode) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, buffer);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.chmodSync(temporaryPath, mode & 0o777);
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
    try {
      fs.unlinkSync(temporaryPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

export function renderCommitFile(
  messageFile,
  { resolution = resolveSessionModel(), writeFile = true } = {},
) {
  const metadata = fs.lstatSync(messageFile);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("commit message path must be a regular file");
  }

  const original = fs.readFileSync(messageFile);
  const rendered = renderCommitBuffer(original, resolution.display);
  if (rendered.changed && writeFile) {
    atomicReplace(messageFile, rendered.buffer, metadata.mode);
  }
  return { ...rendered, resolution };
}

function main() {
  const messageFile = process.argv[2];
  if (!messageFile) {
    throw new Error("usage: render-commit-attribution.mjs <message-file>");
  }
  const result = renderCommitFile(messageFile);
  if (result.changed && result.resolution.id === "unknown") {
    console.error("commit-commands: warning: current model could not be resolved; using Model: unknown");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`commit-commands: attribution renderer failed: ${error.message}`);
    process.exitCode = 1;
  }
}
