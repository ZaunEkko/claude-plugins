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

const pluginRoot = path.resolve(import.meta.dirname, "..");
const wrapper = path.join(pluginRoot, "scripts", "commit-with-dynamic-attribution.sh");
const commandFile = path.join(pluginRoot, "commands", "commit-push-pr.md");
const marker = "Generated with [Claude Code](https://claude.ai/code)";

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function git(repository, ...args) {
  const result = run("git", args, { cwd: repository });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function toBashPath(value) {
  return value.replaceAll("\\", "/");
}

test("commit-push-pr uses the shared wrapper before local push and stubbed PR creation", (t) => {
  const command = fs.readFileSync(commandFile, "utf8");
  const wrapperStep = command.indexOf("commit-with-dynamic-attribution.sh");
  const pushStep = command.indexOf("Only after the wrapper reports a successful commit");
  const prStep = command.indexOf("Only after the push succeeds");
  assert.ok(wrapperStep >= 0 && wrapperStep < pushStep && pushStep < prStep);

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "commit-push-pr-flow-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const repository = path.join(fixture, "repository");
  const remote = path.join(fixture, "remote.git");
  const bin = path.join(fixture, "bin");
  const messages = path.join(fixture, "messages");
  fs.mkdirSync(repository);
  fs.mkdirSync(bin);
  fs.mkdirSync(messages);

  git(repository, "init", "--quiet");
  git(repository, "config", "user.name", "Commit Push PR Test");
  git(repository, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(repository, "file.txt"), "initial\n");
  git(repository, "add", "file.txt");
  git(repository, "commit", "--quiet", "-m", "initial");
  git(repository, "checkout", "--quiet", "-b", "feature/fixture");
  fs.mkdirSync(remote);
  git(remote, "init", "--quiet", "--bare");
  git(repository, "remote", "add", "origin", remote);

  const sessionId = randomUUID();
  const transcriptPath = path.join(fixture, "session.jsonl");
  fs.writeFileSync(
    transcriptPath,
    `${JSON.stringify({ type: "assistant", message: { model: "gpt-5.6-sol" } })}\n`,
  );
  const stateFile = captureSessionStart(
    { session_id: sessionId, transcript_path: transcriptPath },
    { tmpDirectory: messages },
  );
  t.after(() => captureSessionEnd({ session_id: sessionId }, { tmpDirectory: messages }));

  fs.appendFileSync(path.join(repository, "file.txt"), "changed\n");
  git(repository, "add", "file.txt");
  const environment = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    CLAUDE_COMMIT_COMMANDS_NODE: process.execPath,
    CLAUDE_CODE_SESSION_ID: sessionId,
    CLAUDE_COMMIT_COMMANDS_STATE_FILE: stateFile,
    CLAUDE_EFFORT: "high",
    TEMP: toBashPath(messages),
    TMP: toBashPath(messages),
    TMPDIR: toBashPath(messages),
  };

  const commit = run("bash", [wrapper], {
    cwd: repository,
    env: environment,
    input: `test: commit push pr flow\n\n${marker}\nModel: stale\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n`,
  });
  assert.equal(commit.status, 0, commit.stderr || commit.stdout);
  assert.match(commit.stdout, /Model: gpt-5\.6-sol high/u);
  assert.doesNotMatch(commit.stdout, /^Effort:/mu);
  assert.ok(
    git(repository, "log", "-1", "--format=%B").includes(
      `${marker}\n\nModel: gpt-5.6-sol high`,
    ),
  );

  git(repository, "push", "--quiet", "--set-upstream", "origin", "HEAD");
  const localHead = git(repository, "rev-parse", "HEAD");
  const remoteHead = git(remote, "rev-parse", "refs/heads/feature/fixture");
  assert.equal(remoteHead, localHead);

  const ghLog = path.join(fixture, "gh-arguments.txt");
  const ghStub = path.join(bin, "gh");
  fs.writeFileSync(
    ghStub,
    "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > \"$GH_LOG\"\nprintf '%s\\n' 'https://example.invalid/pull/1'\n",
    { mode: 0o755 },
  );
  fs.chmodSync(ghStub, 0o755);
  const gh = run("bash", ["-c", "gh pr create --title 'Fixture PR' --body 'Local-only verification'"], {
    cwd: repository,
    env: {
      ...environment,
      PATH: `${toBashPath(bin)}:${process.env.PATH}`,
      GH_LOG: toBashPath(ghLog),
    },
  });
  assert.equal(gh.status, 0, gh.stderr || gh.stdout);
  assert.equal(gh.stdout.trim(), "https://example.invalid/pull/1");
  assert.deepEqual(fs.readFileSync(ghLog, "utf8").trim().split("\n"), [
    "pr",
    "create",
    "--title",
    "Fixture PR",
    "--body",
    "Local-only verification",
  ]);
  assert.deepEqual(fs.readdirSync(messages), [STATE_DIRECTORY_NAME]);
});
