import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  captureSessionEnd,
  captureSessionStart,
  cleanupStaleStates,
  shellQuote,
  stateDirectory,
  statePathForSession,
} from "../scripts/capture-session-model.mjs";

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-capture-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("captures isolated session state and appends a safely quoted environment export", (t) => {
  const tmpDirectory = temporaryDirectory(t);
  const envFile = path.join(tmpDirectory, "claude env file");
  const transcriptPath = path.join(tmpDirectory, "目录 with spaces", "session.jsonl");

  const firstState = captureSessionStart(
    {
      session_id: "session one\\中文",
      transcript_path: transcriptPath,
      model: "claude-opus-4-8",
    },
    { tmpDirectory, envFile, now: Date.UTC(2026, 6, 10) },
  );
  const secondState = captureSessionStart(
    {
      session_id: "session two",
      transcript_path: `${transcriptPath}.second`,
      model: "gpt-5.6-sol",
    },
    { tmpDirectory, envFile, now: Date.UTC(2026, 6, 10) },
  );

  assert.notEqual(firstState, secondState);
  assert.equal(firstState, statePathForSession("session one\\中文", tmpDirectory));
  assert.deepEqual(JSON.parse(fs.readFileSync(firstState, "utf8")), {
    version: 1,
    transcriptPath,
    model: "claude-opus-4-8",
    capturedAt: "2026-07-10T00:00:00.000Z",
  });

  const exports = fs.readFileSync(envFile, "utf8").trim().split("\n");
  assert.equal(exports[0], `export CLAUDE_COMMIT_COMMANDS_STATE_FILE=${shellQuote(firstState)}`);
  assert.equal(exports[1], `export CLAUDE_COMMIT_COMMANDS_STATE_FILE=${shellQuote(secondState)}`);

  assert.equal(captureSessionEnd({ session_id: "session one\\中文" }, { tmpDirectory }), true);
  assert.equal(fs.existsSync(firstState), false);
  assert.equal(fs.existsSync(secondState), true);
  assert.equal(captureSessionEnd({ session_id: "missing" }, { tmpDirectory }), false);
});

test("allows hook input without a startup model and rejects control-character injection", (t) => {
  const tmpDirectory = temporaryDirectory(t);
  const stateFile = captureSessionStart(
    { session_id: "no-model", transcript_path: "C:\\safe path\\transcript.jsonl" },
    { tmpDirectory },
  );
  assert.equal(JSON.parse(fs.readFileSync(stateFile, "utf8")).model, null);

  assert.throws(
    () => captureSessionStart({ session_id: "bad\nexport PWNED=1" }, { tmpDirectory }),
    /control characters/u,
  );
  assert.throws(() => shellQuote("bad\nvalue"), /control characters/u);
  assert.equal(shellQuote("path with ' quote"), `'path with '"'"' quote'`);
});

test("removes stale regular state files but leaves fresh and unrelated entries", (t) => {
  const tmpDirectory = temporaryDirectory(t);
  const directory = stateDirectory(tmpDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const stale = path.join(directory, "stale.json");
  const fresh = path.join(directory, "fresh.json");
  const unrelated = path.join(directory, "keep.txt");
  fs.writeFileSync(stale, "{}\n");
  fs.writeFileSync(fresh, "{}\n");
  fs.writeFileSync(unrelated, "keep\n");
  fs.utimesSync(stale, new Date(0), new Date(0));

  const removed = cleanupStaleStates(directory, { now: 10_000, ttlMs: 1_000 });
  assert.equal(removed, 1);
  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.existsSync(fresh), true);
  assert.equal(fs.existsSync(unrelated), true);
});
