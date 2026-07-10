import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { captureSessionEnd, captureSessionStart } from "../scripts/capture-session-model.mjs";

const pluginRoot = path.resolve(import.meta.dirname, "..");
const wrapper = path.join(pluginRoot, "scripts", "commit-with-dynamic-attribution.sh");
const marker = "Generated with [Claude Code](https://claude.ai/code)";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
}

function git(repository, ...args) {
  const result = run("git", args, { cwd: repository });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function createRepository(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-wrapper-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  git(directory, "init", "--quiet");
  git(directory, "config", "user.name", "Commit Commands Test");
  git(directory, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(directory, "file.txt"), "initial\n");
  git(directory, "add", "file.txt");
  git(directory, "commit", "--quiet", "-m", "initial");
  return directory;
}

function toBashPath(value) {
  return value.replaceAll("\\", "/");
}

function createState(t, model = "gpt-5.6-sol") {
  const sessionId = randomUUID();
  const transcriptDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-transcript-"));
  const transcriptPath = path.join(transcriptDirectory, "session.jsonl");
  fs.writeFileSync(
    transcriptPath,
    `${JSON.stringify({ type: "assistant", message: { model, content: [{ type: "tool_use" }] } })}\n`,
  );
  const stateFile = captureSessionStart({ session_id: sessionId, transcript_path: transcriptPath });
  t.after(() => {
    captureSessionEnd({ session_id: sessionId });
    fs.rmSync(transcriptDirectory, { recursive: true, force: true });
  });
  return stateFile;
}

function wrapperEnvironment(t, stateFile) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-messages-"));
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
  return {
    environment: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      CLAUDE_COMMIT_COMMANDS_NODE: process.execPath,
      CLAUDE_COMMIT_COMMANDS_STATE_FILE: stateFile,
      TMPDIR: toBashPath(temporaryDirectory),
    },
    temporaryDirectory,
  };
}

function commitMessage(model = "Claude Opus 4.8") {
  return `test: dynamic attribution\n\n${marker}\nModel: ${model}\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n`;
}

test("commits through the wrapper with the transcript model and cleans its message file", (t) => {
  const repository = createRepository(t);
  const stateFile = createState(t);
  const { environment, temporaryDirectory } = wrapperEnvironment(t, stateFile);
  fs.appendFileSync(path.join(repository, "file.txt"), "changed\n");
  git(repository, "add", "file.txt");

  const result = run("bash", [wrapper], {
    cwd: repository,
    env: environment,
    input: commitMessage(),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Model: gpt-5\.6-sol/u);
  assert.equal(
    git(repository, "log", "-1", "--format=%B").trimEnd(),
    commitMessage("gpt-5.6-sol").trimEnd(),
  );
  assert.deepEqual(fs.readdirSync(temporaryDirectory), []);
});

test("renderer failure prevents commit and still cleans the temporary message", (t) => {
  const repository = createRepository(t);
  const stateFile = createState(t);
  const { environment, temporaryDirectory } = wrapperEnvironment(t, stateFile);
  fs.appendFileSync(path.join(repository, "file.txt"), "render failure\n");
  git(repository, "add", "file.txt");
  const before = git(repository, "rev-list", "--count", "HEAD").trim();

  const result = run("bash", [wrapper], {
    cwd: repository,
    env: environment,
    input: Buffer.from(`${marker}\nModel: old\0\n`),
    encoding: undefined,
  });
  assert.notEqual(result.status, 0);
  assert.equal(git(repository, "rev-list", "--count", "HEAD").trim(), before);
  assert.deepEqual(fs.readdirSync(temporaryDirectory), []);
});

test("propagates the Git commit failure status when an existing hook rejects", (t) => {
  const repository = createRepository(t);
  const stateFile = createState(t, "claude-sonnet-5");
  const { environment, temporaryDirectory } = wrapperEnvironment(t, stateFile);
  fs.appendFileSync(path.join(repository, "file.txt"), "hook rejection\n");
  git(repository, "add", "file.txt");

  const hook = path.join(repository, ".git", "hooks", "pre-commit");
  fs.writeFileSync(hook, "#!/usr/bin/env sh\nexit 23\n", { mode: 0o755 });
  fs.chmodSync(hook, 0o755);

  const direct = run("git", ["commit", "-m", "probe"], { cwd: repository });
  assert.notEqual(direct.status, 0);
  const wrapped = run("bash", [wrapper], {
    cwd: repository,
    env: environment,
    input: commitMessage(),
  });
  assert.equal(wrapped.status, direct.status);
  assert.equal(git(repository, "rev-list", "--count", "HEAD").trim(), "1");
  assert.deepEqual(fs.readdirSync(temporaryDirectory), []);
});
