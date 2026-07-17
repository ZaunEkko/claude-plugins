import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { stateDirectory, statePathForSession } from "../scripts/capture-session-model.mjs";
import {
  findLatestAssistantModel,
  formatModelId,
  resolveSessionEffort,
  resolveSessionModel,
  stateFileFromSessionEnvironment,
  validateEffort,
  validateModelId,
} from "../scripts/resolve-session-model.mjs";

function fixture(t) {
  const tmpDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-resolver-"));
  t.after(() => fs.rmSync(tmpDirectory, { recursive: true, force: true }));
  const directory = stateDirectory(tmpDirectory);
  fs.mkdirSync(directory, { recursive: true });
  return { tmpDirectory, directory };
}

function writeState({ tmpDirectory, directory }, sessionId, state) {
  const stateFile = statePathForSession(sessionId, tmpDirectory);
  fs.writeFileSync(stateFile, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  return { stateFile, expectedStateDirectory: directory };
}

test("uses the latest valid assistant transcript model before the SessionStart model", (t) => {
  const directories = fixture(t);
  const transcriptPath = path.join(directories.tmpDirectory, "transcript with 空格.jsonl");
  const records = [
    { type: "assistant", message: { model: "claude-opus-4-8" } },
    { type: "user", message: { content: "switch model" } },
    { type: "assistant", message: { model: "gpt-5.6-sol", content: [{ type: "tool_use" }] } },
  ];
  fs.writeFileSync(transcriptPath, `${records.map(JSON.stringify).join("\n")}\n{broken tail`, "utf8");
  const state = writeState(directories, "latest-model", {
    transcriptPath,
    model: "claude-sonnet-5",
  });

  const result = resolveSessionModel({
    ...state,
    environment: { ANTHROPIC_MODEL: "claude-opus-4-8" },
    settingsModel: "claude-sonnet-5",
    settingsPath: path.join(directories.tmpDirectory, "missing-settings.json"),
  });
  assert.deepEqual(result, {
    id: "gpt-5.6-sol",
    display: "gpt-5.6-sol",
    source: "transcript",
    confidence: "high",
    diagnostics: {
      anthropicModel: { id: "claude-opus-4-8", confidence: "low" },
      settingsModel: { id: "claude-sonnet-5", confidence: "low" },
    },
  });
  assert.equal(findLatestAssistantModel(transcriptPath, { chunkSize: 17 }), "gpt-5.6-sol");
});

test("derives the state file from CLAUDE_CODE_SESSION_ID when the exported pointer is unavailable", (t) => {
  const directories = fixture(t);
  const sessionId = "bc2cacab-fec0-4caa-9f40-b55d88bb815c";
  const transcriptPath = path.join(directories.tmpDirectory, "current-session.jsonl");
  fs.writeFileSync(
    transcriptPath,
    `${JSON.stringify({ type: "assistant", message: { model: "gpt-5.6-sol" } })}\n`,
  );
  const state = writeState(directories, sessionId, { transcriptPath, model: null });
  const environment = {
    CLAUDE_CODE_SESSION_ID: sessionId,
    CLAUDE_COMMIT_COMMANDS_STATE_FILE: path.join(directories.directory, "missing-exported-state.json"),
  };

  assert.equal(
    stateFileFromSessionEnvironment(environment, directories.directory),
    state.stateFile,
  );
  const result = resolveSessionModel({
    expectedStateDirectory: directories.directory,
    environment,
    settingsPath: path.join(directories.tmpDirectory, "missing-settings.json"),
  });
  assert.equal(result.id, "gpt-5.6-sol");
  assert.equal(result.source, "transcript");
  assert.equal(result.confidence, "high");
});

test("requires an explicit state file without falling through to another session", (t) => {
  const directories = fixture(t);
  const firstTranscript = path.join(directories.tmpDirectory, "first-session.jsonl");
  const secondTranscript = path.join(directories.tmpDirectory, "second-session.jsonl");
  fs.writeFileSync(
    firstTranscript,
    `${JSON.stringify({ type: "assistant", message: { model: "gpt-5.6-sol" } })}\n`,
  );
  fs.writeFileSync(
    secondTranscript,
    `${JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8" } })}\n`,
  );
  const first = writeState(directories, "first-explicit", {
    transcriptPath: firstTranscript,
    model: null,
  });
  const second = writeState(directories, "second-environment", {
    transcriptPath: secondTranscript,
    model: null,
  });

  const result = resolveSessionModel({
    ...first,
    requireStateFile: true,
    environment: {
      CLAUDE_CODE_SESSION_ID: "second-environment",
      CLAUDE_COMMIT_COMMANDS_STATE_FILE: second.stateFile,
    },
  });
  assert.equal(result.id, "gpt-5.6-sol");
  assert.equal(result.source, "transcript");

  assert.throws(
    () => resolveSessionModel({
      stateFile: path.join(directories.directory, "missing.json"),
      requireStateFile: true,
      expectedStateDirectory: directories.directory,
      environment: {
        CLAUDE_COMMIT_COMMANDS_STATE_FILE: second.stateFile,
      },
    }),
    /explicit session state file is unavailable or invalid/u,
  );
});

test("falls back through SessionStart, ANTHROPIC_MODEL, settings, and unavailable", (t) => {
  const directories = fixture(t);
  const missingTranscript = path.join(directories.tmpDirectory, "missing.jsonl");
  const fallbackState = writeState(directories, "fallback", {
    transcriptPath: missingTranscript,
    model: "claude-haiku-4-5-20251001",
  });
  const fallback = resolveSessionModel({
    ...fallbackState,
    environment: { ANTHROPIC_MODEL: "claude-opus-4-8" },
    settingsModel: "claude-sonnet-5",
  });
  assert.equal(fallback.id, "claude-haiku-4-5-20251001");
  assert.equal(fallback.display, "Claude Haiku 4.5");
  assert.equal(fallback.source, "session-start");

  const settingsState = writeState(directories, "settings-fallback", {
    transcriptPath: missingTranscript,
    model: null,
  });
  const environmentFallback = resolveSessionModel({
    ...settingsState,
    environment: { ANTHROPIC_MODEL: "claude-opus-4-8" },
    settingsModel: "claude-sonnet-5",
  });
  assert.equal(environmentFallback.id, "claude-opus-4-8");
  assert.equal(environmentFallback.display, "Claude Opus 4.8");
  assert.equal(environmentFallback.source, "environment");
  assert.equal(environmentFallback.confidence, "low");
  assert.deepEqual(environmentFallback.diagnostics, {
    anthropicModel: { id: "claude-opus-4-8", confidence: "low" },
    settingsModel: { id: "claude-sonnet-5", confidence: "low" },
  });

  const settingsFallback = resolveSessionModel({
    ...settingsState,
    environment: {},
    settingsModel: "claude-sonnet-5",
  });
  assert.equal(settingsFallback.id, "claude-sonnet-5");
  assert.equal(settingsFallback.display, "Claude Sonnet 5");
  assert.equal(settingsFallback.source, "settings");
  assert.equal(settingsFallback.confidence, "low");
  assert.deepEqual(settingsFallback.diagnostics, {
    settingsModel: { id: "claude-sonnet-5", confidence: "low" },
  });

  const unknown = resolveSessionModel({
    ...settingsState,
    environment: { ANTHROPIC_MODEL: "bad\nmodel" },
    settingsPath: path.join(directories.tmpDirectory, "missing-settings.json"),
  });
  assert.equal(unknown.id, null);
  assert.equal(unknown.display, null);
  assert.equal(unknown.source, "unavailable");
  assert.equal(unknown.confidence, "none");
  assert.deepEqual(unknown.diagnostics, {});
});

test("resolves effort from the current session, then settings, and otherwise omits it", (t) => {
  const directories = fixture(t);
  const settingsPath = path.join(directories.tmpDirectory, "settings.json");
  fs.writeFileSync(settingsPath, JSON.stringify({ effort: "medium" }));

  assert.deepEqual(resolveSessionEffort({
    environment: { CLAUDE_EFFORT: "xhigh" },
    settingsPath,
  }), {
    id: "xhigh",
    display: "xhigh",
    source: "environment",
    confidence: "high",
  });
  assert.deepEqual(resolveSessionEffort({ environment: {}, settingsPath }), {
    id: "medium",
    display: "medium",
    source: "settings",
    confidence: "low",
  });
  assert.deepEqual(resolveSessionEffort({
    environment: {},
    settingsPath: path.join(directories.tmpDirectory, "missing-settings.json"),
  }), {
    id: null,
    display: null,
    source: "unavailable",
    confidence: "none",
  });
  assert.equal(validateEffort("XHIGH"), "xhigh");
  assert.equal(validateEffort("xhigh\nInjected"), null);
});

test("formats standard Claude IDs without maintaining a fixed model table", () => {
  assert.equal(formatModelId("claude-opus-4-8"), "Claude Opus 4.8");
  assert.equal(formatModelId("claude-sonnet-5"), "Claude Sonnet 5");
  assert.equal(formatModelId("claude-fable-5-20260701"), "Claude Fable 5");
  assert.equal(formatModelId("gpt-5.6-sol"), "gpt-5.6-sol");
  assert.equal(validateModelId("model;$(touch nope)"), "model;$(touch nope)");
  assert.equal(validateModelId("bad\ntrailer"), null);
  assert.equal(validateModelId(`too-long-${"x".repeat(200)}`), null);
});

test("ignores corrupt state files and unsafe transcript model values", (t) => {
  const directories = fixture(t);
  const transcriptPath = path.join(directories.tmpDirectory, "unsafe.jsonl");
  fs.writeFileSync(
    transcriptPath,
    `${JSON.stringify({ type: "assistant", message: { model: "bad\nCo-Authored-By: attacker" } })}\n`,
  );
  const state = writeState(directories, "unsafe", { transcriptPath, model: null });
  const settingsPath = path.join(directories.tmpDirectory, "missing-settings.json");
  assert.equal(resolveSessionModel({ ...state, environment: {}, settingsPath }).id, null);

  fs.writeFileSync(state.stateFile, "not json", "utf8");
  assert.equal(resolveSessionModel({ ...state, environment: {}, settingsPath }).id, null);
});
