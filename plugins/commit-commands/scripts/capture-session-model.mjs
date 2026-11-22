#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const STATE_DIRECTORY_NAME = "claude-code-commit-commands";
export const DEFAULT_STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_FILE_EXPORT_PREFIX = "export CLAUDE_COMMIT_COMMANDS_STATE_FILE=";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

function assertSafeString(value, field, { allowEmpty = false, maxLength = 4096 } = {}) {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  if ((!allowEmpty && value.length === 0) || value.length > maxLength) {
    throw new RangeError(`${field} has an invalid length`);
  }
  if (CONTROL_CHARACTERS.test(value)) {
    throw new TypeError(`${field} contains control characters`);
  }
  return value;
}

export function stateDirectory(tmpDirectory = os.tmpdir()) {
  return path.join(tmpDirectory, STATE_DIRECTORY_NAME);
}

export function statePathForSession(sessionId, tmpDirectory = os.tmpdir()) {
  const safeSessionId = assertSafeString(sessionId, "session_id", { maxLength: 512 });
  const digest = createHash("sha256").update(safeSessionId, "utf8").digest("hex");
  return path.join(stateDirectory(tmpDirectory), `${digest}.json`);
}

function ensurePrivateDirectory(directory) {
  try {
    const existing = fs.lstatSync(directory);
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      throw new Error(`state directory is not a private directory: ${directory}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  try {
    fs.chmodSync(directory, 0o700);
  } catch (error) {
    if (process.platform !== "win32") {
      throw error;
    }
  }
}

function atomicWriteJson(filePath, value) {
  try {
    const existing = fs.lstatSync(filePath);
    if (existing.isSymbolicLink()) {
      throw new Error(`refusing to replace symbolic link: ${filePath}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, filePath);
    try {
      fs.chmodSync(filePath, 0o600);
    } catch (error) {
      if (process.platform !== "win32") {
        throw error;
      }
    }
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

export function shellQuote(value) {
  const safeValue = assertSafeString(value, "environment value", {
    allowEmpty: true,
    maxLength: 32768,
  });
  return `'${safeValue.replaceAll("'", `'"'"'`)}'`;
}

export function cleanupStaleStates(
  directory,
  { now = Date.now(), ttlMs = DEFAULT_STATE_TTL_MS } = {},
) {
  let removed = 0;
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return removed;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const candidate = path.join(directory, entry.name);
    const metadata = fs.lstatSync(candidate);
    if (metadata.isSymbolicLink() || now - metadata.mtimeMs <= ttlMs) {
      continue;
    }
    fs.unlinkSync(candidate);
    removed += 1;
  }
  return removed;
}

function optionalSafeString(value, field, maxLength) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return assertSafeString(value, field, { maxLength });
}

export function captureSessionStart(
  input,
  {
    tmpDirectory = os.tmpdir(),
    envFile = process.env.CLAUDE_ENV_FILE,
    now = Date.now(),
    ttlMs = DEFAULT_STATE_TTL_MS,
  } = {},
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("hook input must be a JSON object");
  }

  const sessionId = assertSafeString(input.session_id, "session_id", { maxLength: 512 });
  const transcriptPath = optionalSafeString(input.transcript_path, "transcript_path", 32768);
  const model = optionalSafeString(input.model, "model", 200);
  const directory = stateDirectory(tmpDirectory);
  ensurePrivateDirectory(directory);
  cleanupStaleStates(directory, { now, ttlMs });

  const stateFile = statePathForSession(sessionId, tmpDirectory);
  atomicWriteJson(stateFile, {
    version: 1,
    transcriptPath,
    model,
    capturedAt: new Date(now).toISOString(),
  });

  if (envFile) {
    const safeEnvFile = assertSafeString(envFile, "CLAUDE_ENV_FILE", { maxLength: 32768 });
    const exportLine = `${STATE_FILE_EXPORT_PREFIX}${shellQuote(stateFile)}`;
    // SessionStart fires again on resume and compaction, and Claude Code never
    // truncates the per-session env file, so append only when the export that
    // currently wins (the last one) differs from ours.
    if (lastStateFileExport(safeEnvFile) !== exportLine) {
      fs.appendFileSync(safeEnvFile, `${exportLine}\n`, { encoding: "utf8", mode: 0o600 });
    }
  }

  return stateFile;
}

function lastStateFileExport(envFile) {
  let contents;
  try {
    contents = fs.readFileSync(envFile, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const lines = contents.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].startsWith(STATE_FILE_EXPORT_PREFIX)) {
      return lines[index];
    }
  }
  return null;
}

export function captureSessionEnd(input, { tmpDirectory = os.tmpdir() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("hook input must be a JSON object");
  }
  const stateFile = statePathForSession(input.session_id, tmpDirectory);
  try {
    const metadata = fs.lstatSync(stateFile);
    if (!metadata.isFile() && !metadata.isSymbolicLink()) {
      throw new Error(`unexpected state path type: ${stateFile}`);
    }
    fs.unlinkSync(stateFile);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const action = process.argv[2];
  const rawInput = await readStandardInput();
  const input = JSON.parse(rawInput || "{}");

  if (action === "start") {
    captureSessionStart(input);
    return;
  }
  if (action === "end") {
    captureSessionEnd(input);
    return;
  }
  throw new Error("expected action: start or end");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`commit-commands: session state warning: ${error.message}`);
    process.exitCode = 0;
  });
}
