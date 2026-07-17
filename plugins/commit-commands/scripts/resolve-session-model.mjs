#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { stateDirectory } from "./capture-session-model.mjs";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const MAX_MODEL_LENGTH = 200;
const VALID_EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);

export function validateModelId(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_MODEL_LENGTH ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return null;
  }
  return value;
}

export function validateEffort(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.toLowerCase();
  return VALID_EFFORT_LEVELS.has(normalized) ? normalized : null;
}

export function formatModelId(modelId) {
  const safeModelId = validateModelId(modelId);
  if (!safeModelId) {
    return "unknown";
  }

  const match = /^claude-([a-z]+)-(.+)$/u.exec(safeModelId);
  if (!match) {
    return safeModelId;
  }

  const [, family, rawVersion] = match;
  const versionParts = rawVersion.split("-");
  if (versionParts.length > 1 && /^\d{8}$/u.test(versionParts.at(-1))) {
    versionParts.pop();
  }
  if (versionParts.length === 0 || versionParts.length > 2 || versionParts.some((part) => !/^\d+$/u.test(part))) {
    return safeModelId;
  }

  const familyName = family.charAt(0).toUpperCase() + family.slice(1);
  return `Claude ${familyName} ${versionParts.join(".")}`;
}

function parseTranscriptLine(lineBuffer) {
  let line = lineBuffer;
  if (line.length > 0 && line.at(-1) === 0x0d) {
    line = line.subarray(0, line.length - 1);
  }
  if (line.length === 0) {
    return null;
  }

  try {
    const record = JSON.parse(line.toString("utf8"));
    if (record?.type !== "assistant") {
      return null;
    }
    return validateModelId(record?.message?.model);
  } catch {
    return null;
  }
}

export function findLatestAssistantModel(transcriptPath, { chunkSize = 64 * 1024 } = {}) {
  if (typeof transcriptPath !== "string" || transcriptPath.length === 0) {
    return null;
  }

  let descriptor;
  try {
    descriptor = fs.openSync(transcriptPath, "r");
    let position = fs.fstatSync(descriptor).size;
    let remainder = Buffer.alloc(0);

    while (position > 0) {
      const start = Math.max(0, position - chunkSize);
      const chunk = Buffer.alloc(position - start);
      fs.readSync(descriptor, chunk, 0, chunk.length, start);
      const data = Buffer.concat([chunk, remainder]);
      let lineEnd = data.length;

      for (let index = data.length - 1; index >= 0; index -= 1) {
        if (data[index] !== 0x0a) {
          continue;
        }
        const model = parseTranscriptLine(data.subarray(index + 1, lineEnd));
        if (model) {
          return model;
        }
        lineEnd = index;
      }

      remainder = data.subarray(0, lineEnd);
      position = start;
    }

    return parseTranscriptLine(remainder);
  } catch (error) {
    if (["ENOENT", "EACCES", "EPERM"].includes(error.code)) {
      return null;
    }
    throw error;
  } finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
  }
}

export function isPathInside(directory, candidate) {
  const relative = path.relative(path.resolve(directory), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function stateFileFromSessionEnvironment(
  environment = process.env,
  expectedStateDirectory = stateDirectory(),
) {
  const sessionId = environment.CLAUDE_CODE_SESSION_ID;
  if (
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    sessionId.length > 512 ||
    CONTROL_CHARACTERS.test(sessionId)
  ) {
    return null;
  }

  const digest = createHash("sha256").update(sessionId, "utf8").digest("hex");
  return path.join(expectedStateDirectory, `${digest}.json`);
}

export function readSessionState(
  stateFile,
  { expectedStateDirectory = stateDirectory() } = {},
) {
  if (!stateFile || typeof stateFile !== "string") {
    return null;
  }
  if (!isPathInside(expectedStateDirectory, stateFile)) {
    return null;
  }

  try {
    const metadata = fs.lstatSync(stateFile);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return {
      transcriptPath: typeof parsed.transcriptPath === "string" ? parsed.transcriptPath : null,
      model: validateModelId(parsed.model),
    };
  } catch (error) {
    if (["ENOENT", "EACCES", "EPERM", "SyntaxError"].includes(error.code || error.name)) {
      return null;
    }
    return null;
  }
}

function defaultSettingsPath(environment) {
  const configDirectory = environment.CLAUDE_CONFIG_DIR;
  return configDirectory
    ? path.join(configDirectory, "settings.json")
    : path.join(os.homedir(), ".claude", "settings.json");
}

export function readSettingsModel(settingsPath) {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return validateModelId(settings?.model);
  } catch {
    return null;
  }
}

export function readSettingsEffort(settingsPath) {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return validateEffort(settings?.effort ?? settings?.effortLevel);
  } catch {
    return null;
  }
}

export function resolveSessionEffort({
  environment = process.env,
  settingsPath = defaultSettingsPath(environment),
  settingsEffort,
} = {}) {
  const currentEffort = validateEffort(environment.CLAUDE_EFFORT);
  if (currentEffort) {
    return {
      id: currentEffort,
      display: currentEffort,
      source: "environment",
      confidence: "high",
    };
  }

  const configuredEffort = validateEffort(settingsEffort) || readSettingsEffort(settingsPath);
  if (configuredEffort) {
    return {
      id: configuredEffort,
      display: configuredEffort,
      source: "settings",
      confidence: "low",
    };
  }

  return {
    id: null,
    display: null,
    source: "unavailable",
    confidence: "none",
  };
}

export function resolveSessionModel({
  stateFile,
  requireStateFile = false,
  expectedStateDirectory = stateDirectory(),
  environment = process.env,
  settingsPath = defaultSettingsPath(environment),
  settingsModel,
} = {}) {
  if (requireStateFile && (typeof stateFile !== "string" || stateFile.length === 0)) {
    throw new TypeError("an explicit session state file is required");
  }
  const diagnostics = {};
  const environmentModel = validateModelId(environment.ANTHROPIC_MODEL);
  const configuredModel = validateModelId(settingsModel) || readSettingsModel(settingsPath);
  if (environmentModel) {
    diagnostics.anthropicModel = { id: environmentModel, confidence: "low" };
  }
  if (configuredModel) {
    diagnostics.settingsModel = { id: configuredModel, confidence: "low" };
  }

  const candidateStateFiles = (requireStateFile
    ? [stateFile]
    : [
        stateFile,
        environment.CLAUDE_COMMIT_COMMANDS_STATE_FILE,
        stateFileFromSessionEnvironment(environment, expectedStateDirectory),
      ])
    .filter((candidate, index, candidates) => candidate && candidates.indexOf(candidate) === index);

  let state = null;
  for (const candidateStateFile of candidateStateFiles) {
    state = readSessionState(candidateStateFile, { expectedStateDirectory });
    if (state) {
      break;
    }
  }
  if (requireStateFile && !state) {
    throw new Error("explicit session state file is unavailable or invalid");
  }

  const transcriptModel = state?.transcriptPath
    ? findLatestAssistantModel(state.transcriptPath)
    : null;

  if (transcriptModel) {
    return {
      id: transcriptModel,
      display: formatModelId(transcriptModel),
      source: "transcript",
      confidence: "high",
      diagnostics,
    };
  }
  if (state?.model) {
    return {
      id: state.model,
      display: formatModelId(state.model),
      source: "session-start",
      confidence: "medium",
      diagnostics,
    };
  }
  if (environmentModel) {
    return {
      id: environmentModel,
      display: formatModelId(environmentModel),
      source: "environment",
      confidence: "low",
      diagnostics,
    };
  }
  if (configuredModel) {
    return {
      id: configuredModel,
      display: formatModelId(configuredModel),
      source: "settings",
      confidence: "low",
      diagnostics,
    };
  }
  return {
    id: null,
    display: null,
    source: "unavailable",
    confidence: "none",
    diagnostics,
  };
}

function main() {
  const stateFile = process.argv[2];
  const model = resolveSessionModel({ stateFile });
  const effort = resolveSessionEffort();
  process.stdout.write(`${JSON.stringify({ ...model, effort })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`commit-commands: model resolver failed: ${error.message}`);
    process.exitCode = 1;
  }
}
