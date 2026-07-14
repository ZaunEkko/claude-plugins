#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  resolveSessionEffort,
  resolveSessionModel,
  validateEffort,
  validateModelId,
} from "./resolve-session-model.mjs";

const ATTRIBUTION_MARKER = "Generated with [Claude Code](https://claude.ai/code)";
const MODEL_LINE = /^Model:\s*.*$/u;
const EFFORT_LINE = /^Effort:\s*.*$/u;

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

export function renderCommitBuffer(buffer, modelDisplay, effortDisplay = null) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("commit message must be a Buffer");
  }
  if (buffer.includes(0x00)) {
    throw new Error("commit message contains a NUL byte");
  }
  const safeModel = modelDisplay === null ? null : validateModelId(modelDisplay);
  if (modelDisplay !== null && !safeModel) {
    throw new Error("resolved model is not safe for a single-line attribution");
  }
  const safeEffort = effortDisplay === null ? null : validateEffort(effortDisplay);
  if (effortDisplay !== null && !safeEffort) {
    throw new Error("resolved effort is not safe for a single-line attribution");
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

  const markerTarget = ranges[markerIndex];
  let modelTarget = null;
  let effortTarget = null;
  for (let index = markerIndex + 1; index < ranges.length; index += 1) {
    const range = ranges[index];
    const line = buffer.subarray(range.start, range.contentEnd).toString("utf8");
    if (MODEL_LINE.test(line)) {
      modelTarget = range;
    }
    if (EFFORT_LINE.test(line)) {
      effortTarget = range;
    }
  }

  if (!modelTarget) {
    return { buffer, changed: false };
  }

  const edits = [];
  const modelLineEnding = buffer.subarray(modelTarget.contentEnd, modelTarget.end);
  if (safeModel) {
    const modelAttribution = safeEffort ? `${safeModel} ${safeEffort}` : safeModel;
    edits.push({
      start: modelTarget.start,
      end: modelTarget.end,
      replacement: Buffer.concat([Buffer.from(`Model: ${modelAttribution}`, "utf8"), modelLineEnding]),
    });
  } else {
    edits.push({
      start: modelTarget.start,
      end: modelTarget.end,
      replacement: Buffer.alloc(0),
    });
  }

  if (safeModel) {
    const lineAfterMarker = ranges[markerIndex + 1] ?? null;
    const markerHasBlankSeparator =
      lineAfterMarker !== null && lineAfterMarker.contentEnd === lineAfterMarker.start;
    if (!markerHasBlankSeparator) {
      const markerLineEnding = buffer.subarray(markerTarget.contentEnd, markerTarget.end);
      const separator = markerLineEnding.length > 0
        ? markerLineEnding
        : modelLineEnding.length > 0
          ? modelLineEnding
          : Buffer.from("\n", "utf8");
      edits.push({
        start: markerTarget.end,
        end: markerTarget.end,
        replacement: separator,
      });
    }
  }

  if (effortTarget) {
    edits.push({
      start: effortTarget.start,
      end: effortTarget.end,
      replacement: Buffer.alloc(0),
    });
  }

  let rendered = buffer;
  for (const edit of edits.sort((left, right) =>
    right.start - left.start || right.end - left.end)) {
    rendered = Buffer.concat([
      rendered.subarray(0, edit.start),
      edit.replacement,
      rendered.subarray(edit.end),
    ]);
  }
  return { buffer: rendered, changed: true };
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
  {
    resolution = resolveSessionModel(),
    effortResolution = resolveSessionEffort(),
    writeFile = true,
  } = {},
) {
  const metadata = fs.lstatSync(messageFile);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("commit message path must be a regular file");
  }

  const original = fs.readFileSync(messageFile);
  const rendered = renderCommitBuffer(original, resolution.display, effortResolution.display);
  if (rendered.changed && writeFile) {
    atomicReplace(messageFile, rendered.buffer, metadata.mode);
  }
  return { ...rendered, resolution, effortResolution };
}

function main() {
  const messageFile = process.argv[2];
  if (!messageFile) {
    throw new Error("usage: render-commit-attribution.mjs <message-file>");
  }
  renderCommitFile(messageFile);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`commit-commands: attribution renderer failed: ${error.message}`);
    process.exitCode = 1;
  }
}
