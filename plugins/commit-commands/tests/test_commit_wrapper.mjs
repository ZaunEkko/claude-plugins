import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  STATE_DIRECTORY_NAME,
  captureSessionEnd,
  captureSessionStart,
} from "../scripts/capture-session-model.mjs";
import { withGitBashPath } from "./helpers/test-environment.mjs";

const pluginRoot = path.resolve(import.meta.dirname, "..");
const wrapper = path.join(pluginRoot, "scripts", "commit-with-dynamic-attribution.sh");
const marker = "Generated with [Claude Code](https://claude.ai/code)";
const generatedMarkers = [
  marker,
  "🤖 Generated with [Claude Code](https://claude.ai/code)",
  "Generated with [Claude Code](https://claude.com/claude-code)",
  "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
];

function run(command, args, options = {}) {
  const environment = command === "bash" ? withGitBashPath(options.env) : options.env;
  return spawnSync(command, args, {
    encoding: "utf8",
    ...options,
    ...(environment ? { env: environment } : {}),
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

function createState(t, model = "gpt-5.6-sol", { tmpDirectory = os.tmpdir() } = {}) {
  const sessionId = randomUUID();
  const transcriptDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-transcript-"));
  const transcriptPath = path.join(transcriptDirectory, "session.jsonl");
  fs.writeFileSync(
    transcriptPath,
    `${JSON.stringify({ type: "assistant", message: { model, content: [{ type: "tool_use" }] } })}\n`,
  );
  const stateFile = captureSessionStart(
    { session_id: sessionId, transcript_path: transcriptPath },
    { tmpDirectory },
  );
  t.after(() => {
    captureSessionEnd({ session_id: sessionId }, { tmpDirectory });
    fs.rmSync(transcriptDirectory, { recursive: true, force: true });
  });
  return { stateFile, sessionId };
}

function wrapperEnvironment(t, state, { includeStatePointer = false } = {}) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-messages-"));
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
  const environment = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    CLAUDE_COMMIT_COMMANDS_NODE: process.execPath,
    CLAUDE_CODE_SESSION_ID: state.sessionId,
    CLAUDE_EFFORT: "xhigh",
    TMPDIR: toBashPath(temporaryDirectory),
  };
  delete environment.CLAUDE_COMMIT_COMMANDS_STATE_FILE;
  if (includeStatePointer) {
    environment.CLAUDE_COMMIT_COMMANDS_STATE_FILE = state.stateFile;
  }
  return {
    environment,
    temporaryDirectory,
  };
}

function commitMessage(model = "Claude Opus 4.8", attributionMarker = marker) {
  const modelBlock = model === null ? "" : `Model: ${model}\n\n`;
  return `test: dynamic attribution\n\n${attributionMarker}\n${modelBlock}Co-Authored-By: Claude <noreply@anthropic.com>\n`;
}

function renderedCommitMessage(model, effort) {
  const modelAttribution = effort ? `${model} ${effort}` : model;
  return `test: dynamic attribution\n\n${marker}\n\nModel: ${modelAttribution}\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n`;
}

test("commits with the transcript model when only CLAUDE_CODE_SESSION_ID identifies the state", (t) => {
  const repository = createRepository(t);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-session-root-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const state = createState(t, "gpt-5.6-sol", { tmpDirectory: temporaryRoot });
  const environment = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    CLAUDE_COMMIT_COMMANDS_NODE: process.execPath,
    CLAUDE_CODE_SESSION_ID: state.sessionId,
    CLAUDE_EFFORT: "xhigh",
    TEMP: toBashPath(temporaryRoot),
    TMP: toBashPath(temporaryRoot),
    TMPDIR: toBashPath(temporaryRoot),
  };
  delete environment.CLAUDE_COMMIT_COMMANDS_STATE_FILE;
  const cases = [
    ...generatedMarkers.map((attributionMarker) => ({ attributionMarker, model: "Claude Opus 4.8" })),
    { attributionMarker: marker, model: null },
  ];
  for (const [index, fixture] of cases.entries()) {
    fs.appendFileSync(path.join(repository, "file.txt"), `changed ${index}\n`);
    git(repository, "add", "file.txt");

    const result = run("bash", [wrapper], {
      cwd: repository,
      env: environment,
      input: commitMessage(fixture.model, fixture.attributionMarker),
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Model: gpt-5\.6-sol xhigh/u);
    assert.doesNotMatch(result.stdout, /^Effort:/mu);
    assert.equal(
      git(repository, "log", "-1", "--format=%B").trimEnd(),
      renderedCommitMessage("gpt-5.6-sol", "xhigh").trimEnd(),
    );
  }
  assert.deepEqual(fs.readdirSync(temporaryRoot), [STATE_DIRECTORY_NAME]);
});

test("explicit state option binds a detached wrapper to one session", (t) => {
  const repository = createRepository(t);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-explicit-root-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const explicitState = createState(t, "gpt-5.6-sol", { tmpDirectory: temporaryRoot });
  const environmentState = createState(t, "claude-opus-4-8", { tmpDirectory: temporaryRoot });
  fs.appendFileSync(path.join(repository, "file.txt"), "explicit state\n");
  git(repository, "add", "file.txt");

  const environment = {
    ...process.env,
    ANTHROPIC_MODEL: "environment-fallback",
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    CLAUDE_COMMIT_COMMANDS_NODE: process.execPath,
    CLAUDE_COMMIT_COMMANDS_STATE_FILE: environmentState.stateFile,
    CLAUDE_EFFORT: "high",
    TEMP: toBashPath(temporaryRoot),
    TMP: toBashPath(temporaryRoot),
    TMPDIR: toBashPath(temporaryRoot),
  };
  delete environment.CLAUDE_CODE_SESSION_ID;

  const result = run("bash", [
    wrapper,
    "--claude-state-file",
    explicitState.stateFile,
  ], {
    cwd: repository,
    env: environment,
    input: commitMessage(),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Model: gpt-5\.6-sol high/u);
  assert.equal(
    git(repository, "log", "-1", "--format=%B").trimEnd(),
    renderedCommitMessage("gpt-5.6-sol", "high").trimEnd(),
  );
  assert.deepEqual(fs.readdirSync(temporaryRoot), [STATE_DIRECTORY_NAME]);
});

test("invalid explicit state prevents commit without falling through", (t) => {
  const repository = createRepository(t);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-invalid-state-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const environmentState = createState(t, "claude-opus-4-8", { tmpDirectory: temporaryRoot });
  const missingState = path.join(temporaryRoot, STATE_DIRECTORY_NAME, "missing.json");
  fs.appendFileSync(path.join(repository, "file.txt"), "invalid explicit state\n");
  git(repository, "add", "file.txt");
  const before = git(repository, "rev-list", "--count", "HEAD").trim();

  const environment = {
    ...process.env,
    ANTHROPIC_MODEL: "environment-fallback",
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    CLAUDE_COMMIT_COMMANDS_NODE: process.execPath,
    CLAUDE_COMMIT_COMMANDS_STATE_FILE: environmentState.stateFile,
    CLAUDE_EFFORT: "high",
    TEMP: toBashPath(temporaryRoot),
    TMP: toBashPath(temporaryRoot),
    TMPDIR: toBashPath(temporaryRoot),
  };
  delete environment.CLAUDE_CODE_SESSION_ID;

  const result = run("bash", [
    wrapper,
    `--claude-state-file=${missingState}`,
  ], {
    cwd: repository,
    env: environment,
    input: commitMessage(),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit session state file is unavailable or invalid/u);
  assert.equal(git(repository, "rev-list", "--count", "HEAD").trim(), before);
  assert.deepEqual(fs.readdirSync(temporaryRoot), [STATE_DIRECTORY_NAME]);
});

test("uses ANTHROPIC_MODEL before settings when detached from session state", (t) => {
  const repository = createRepository(t);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-environment-"));
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
  const configDirectory = path.join(temporaryDirectory, "config");
  const messageDirectory = path.join(temporaryDirectory, "messages");
  fs.mkdirSync(configDirectory);
  fs.mkdirSync(messageDirectory);
  fs.writeFileSync(path.join(configDirectory, "settings.json"), JSON.stringify({ model: "opus" }));
  fs.appendFileSync(path.join(repository, "file.txt"), "environment model\n");
  git(repository, "add", "file.txt");

  const environment = {
    ...process.env,
    ANTHROPIC_MODEL: "gpt-5.6-sol",
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    CLAUDE_COMMIT_COMMANDS_NODE: process.execPath,
    CLAUDE_CONFIG_DIR: configDirectory,
    CLAUDE_EFFORT: "xhigh",
    TEMP: toBashPath(messageDirectory),
    TMP: toBashPath(messageDirectory),
    TMPDIR: toBashPath(messageDirectory),
  };
  delete environment.CLAUDE_CODE_SESSION_ID;
  delete environment.CLAUDE_COMMIT_COMMANDS_STATE_FILE;

  const result = run("bash", [wrapper], {
    cwd: repository,
    env: environment,
    input: commitMessage(),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Model: gpt-5\.6-sol xhigh/u);
  assert.equal(
    git(repository, "log", "-1", "--format=%B").trimEnd(),
    renderedCommitMessage("gpt-5.6-sol", "xhigh").trimEnd(),
  );
  assert.deepEqual(fs.readdirSync(messageDirectory), []);
});

test("omits model attribution when no reliable model source exists", (t) => {
  const repository = createRepository(t);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-unavailable-"));
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
  const configDirectory = path.join(temporaryDirectory, "config");
  const messageDirectory = path.join(temporaryDirectory, "messages");
  fs.mkdirSync(configDirectory);
  fs.mkdirSync(messageDirectory);
  fs.writeFileSync(path.join(configDirectory, "settings.json"), "{}\n");
  fs.appendFileSync(path.join(repository, "file.txt"), "unavailable model\n");
  git(repository, "add", "file.txt");

  const environment = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    CLAUDE_COMMIT_COMMANDS_NODE: process.execPath,
    CLAUDE_CODE_SESSION_ID: randomUUID(),
    CLAUDE_CONFIG_DIR: configDirectory,
    CLAUDE_EFFORT: "xhigh",
    TMPDIR: toBashPath(messageDirectory),
  };
  delete environment.ANTHROPIC_MODEL;
  delete environment.CLAUDE_COMMIT_COMMANDS_STATE_FILE;

  const result = run("bash", [wrapper], {
    cwd: repository,
    env: environment,
    input: commitMessage(),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const message = git(repository, "log", "-1", "--format=%B");
  assert.doesNotMatch(message, /^Model:/mu);
  assert.doesNotMatch(message, /^Effort:/mu);
  assert.deepEqual(fs.readdirSync(messageDirectory), []);
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
