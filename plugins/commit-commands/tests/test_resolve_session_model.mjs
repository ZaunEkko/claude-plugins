import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { stateDirectory, statePathForSession } from "../scripts/capture-session-model.mjs";
import {
  findLatestAssistantModel,
  formatModelId,
  resolveSessionModel,
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
    environment: {},
    settingsPath: path.join(directories.tmpDirectory, "missing-settings.json"),
  });
  assert.deepEqual(result, {
    id: "gpt-5.6-sol",
    display: "gpt-5.6-sol",
    source: "transcript",
    confidence: "high",
    diagnostics: {},
  });
  assert.equal(findLatestAssistantModel(transcriptPath, { chunkSize: 17 }), "gpt-5.6-sol");
});

test("falls back to SessionStart and then strictly to unknown", (t) => {
  const directories = fixture(t);
  const missingTranscript = path.join(directories.tmpDirectory, "missing.jsonl");
  const fallbackState = writeState(directories, "fallback", {
    transcriptPath: missingTranscript,
    model: "claude-haiku-4-5-20251001",
  });
  const fallback = resolveSessionModel({ ...fallbackState, environment: {} });
  assert.equal(fallback.id, "claude-haiku-4-5-20251001");
  assert.equal(fallback.display, "Claude Haiku 4.5");
  assert.equal(fallback.source, "session-start");

  const unknownState = writeState(directories, "unknown", {
    transcriptPath: missingTranscript,
    model: null,
  });
  const unknown = resolveSessionModel({
    ...unknownState,
    environment: { ANTHROPIC_MODEL: "claude-opus-4-8" },
    settingsModel: "claude-sonnet-5",
  });
  assert.equal(unknown.id, "unknown");
  assert.equal(unknown.display, "unknown");
  assert.equal(unknown.source, "fallback");
  assert.deepEqual(unknown.diagnostics, {
    anthropicModel: { id: "claude-opus-4-8", confidence: "low" },
    settingsModel: { id: "claude-sonnet-5", confidence: "low" },
  });
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
  assert.equal(resolveSessionModel({ ...state, environment: {} }).id, "unknown");

  fs.writeFileSync(state.stateFile, "not json", "utf8");
  assert.equal(resolveSessionModel({ ...state, environment: {} }).id, "unknown");
});
