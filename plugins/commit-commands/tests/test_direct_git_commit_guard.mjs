import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  DIRECT_COMMIT_REASON,
  PLAYWRIGHT_COMMIT_REASON,
  containsCommitCreatingGitCommand,
  containsDirectGitCommit,
  containsPlaywrightCommitExecution,
  evaluateHookInput,
} from "../scripts/deny-direct-git-commit.mjs";

const pluginRoot = path.resolve(import.meta.dirname, "..");
const guardScript = path.join(pluginRoot, "scripts", "deny-direct-git-commit.mjs");
const hooksPath = path.join(pluginRoot, "hooks", "hooks.json");

function hookInput(command) {
  return {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command },
  };
}

function playwrightHookInput(code) {
  return {
    hook_event_name: "PreToolUse",
    tool_name: "mcp__plugin_playwright_playwright__browser_run_code_unsafe",
    tool_input: { code },
  };
}

function runGuard(input) {
  return spawnSync(process.execPath, [guardScript], {
    encoding: "utf8",
    input: typeof input === "string" ? input : JSON.stringify(input),
  });
}

const blockedCommands = [
  "git commit",
  "git commit -m 'message'",
  "git -C /tmp/repository commit --amend",
  "git -C '/tmp/path with spaces' --no-pager commit -F message.txt",
  "git -c user.name=Test commit -m message",
  "git --git-dir=.git --work-tree=. commit -m message",
  "repository=/tmp/repository && git -C \"$repository\" commit -m message",
  "git status && git commit -m message",
  "env TESTING=1 git commit -m message",
  "command git commit -m message",
  "exec git commit -m message",
  "exec -a git-process git commit -m message",
  "coproc git commit -m message",
  "git.exe commit -m message",
  "/usr/bin/git commit -m message",
  String.raw`"D:\env\Git\cmd\git.exe" commit -m message`,
  "timeout 30 git commit -m message",
  "nice -n 5 git commit -m message",
  "nohup git commit -m message",
  "stdbuf -oL git commit -m message",
  "xargs -n 1 git commit -m message",
  "sudo -u test git commit -m message",
  "time -p git commit -m message",
  "bash -lc 'git commit -m message'",
  "bash --rcfile /dev/null -lc 'git commit -m message'",
  "bash -O extglob -c 'git commit -m message'",
  "eval 'git commit -m message'",
  "echo `git commit -m message`",
  "echo \"$(git commit -m message)\"",
  String.raw`echo "$(git -C "$(pwd)" commit -m message)"`,
  String.raw`echo "$(env X="$(printf y)" git commit -m message)"`,
  "echo \"$((1 + $(git commit -m message)))\"",
  "echo '<<EOF'\ngit commit -m message",
  "cat <<EOF\n$(git commit -m message)\nEOF",
  "cat <<EOF\n`git commit -m message`\nEOF",
  "cat <<EOF\n'$(git commit -m message)'\nEOF",
  "# <<EOF\ngit commit -m message\nEOF",
  "true # <<EOF\ngit commit -m message\nEOF",
  ": $((1 << 2))\ngit commit -m message",
  "((1 << 2))\ngit commit -m message",
  "for ((index = 0; index << 1; index += 1)); do :; done\ngit commit -m message",
  "echo $[1 << 2]\ngit commit -m message",
  "values=(zero one two three four)\nprintf '%s\\n' ${values[1 << 2]}\ngit commit -m message",
  "values[1<<2]=four\ngit commit -m message",
  "printf '%s\\n' word[\ngit commit -m message",
  "printf '%s\\n' \"start\n<<EOF\nend\"\ngit commit -m message\nEOF",
  "printf '%s\\n' 'start\n<<EOF\nend'\ngit commit -m message\nEOF",
  "printf '%s\\n' ${value:-\n1 << 2\n}\ngit commit -m message",
  "cat <<< hello\ngit commit -m message",
  "if git status; then git commit -m message; fi",
];

for (const command of blockedCommands) {
  test(`detects direct commit: ${command}`, () => {
    assert.equal(containsDirectGitCommit(command), true);
  });
}

const allowedCommands = [
  "git status",
  "git push origin main",
  "git commit-tree HEAD^{tree}",
  "git help commit",
  "git --help commit",
  String.raw`"D:\env\Git\cmd\git.exe" --version`,
  "printf '%s\\n' 'git commit -m message'",
  "echo git commit",
  "git log --grep='git commit'",
  "bash -lc 'git status'",
  "timeout 30 git status",
  String.raw`echo "$(printf '%s' "$(git status)")"`,
  "echo \"$((1 + $(git status >/dev/null; printf 1)))\"",
  "echo '`git commit -m message`'",
  "echo '$(git commit -m message)'",
  "cat <<< 'git commit -m message'",
  "cat <<EOF\ngit commit -m documentation\nEOF",
  "cat <<EOF\n\\$(git commit -m literal)\nEOF",
  "cat <<\\EOF\n$(git commit -m literal)\nEOF",
  "cat <<E\"OF\"\n$(git commit -m literal)\nEOF",
  "'/tmp/commit-with-dynamic-attribution.sh' <<'EOF'\ngit commit -m message\necho \"$(git commit -m nested)\"\nEOF",
];

for (const command of allowedCommands) {
  test(`allows non-commit command: ${command}`, () => {
    assert.equal(containsDirectGitCommit(command), false);
  });
}

test("classifies Git commands that can create commits in unsafe process contexts", () => {
  for (const command of [
    "git commit -m message",
    "git merge --no-ff feature/topic",
    "git cherry-pick abc123",
    "git revert abc123",
    "git rebase main",
    "git am patch.mbox",
    "git pull origin main",
    "git commit-tree HEAD^{tree}",
  ]) {
    assert.equal(containsCommitCreatingGitCommand(command), true, command);
  }
  for (const command of [
    "git status",
    "git merge --no-commit --no-ff feature/topic",
    "git merge --ff-only feature/topic",
    "git merge --squash feature/topic",
    "git pull --ff-only origin main",
    "git pull --no-commit origin main",
    "git cherry-pick --no-commit abc123",
    "git revert -n abc123",
  ]) {
    assert.equal(containsCommitCreatingGitCommand(command), false, command);
  }
});

const blockedPlaywrightCode = [
  `async () => {
    const { execFile } = require("node:child_process");
    execFile("git", ["commit", "-m", "message"]);
  }`,
  `async () => {
    const { exec } = require("child_process");
    exec("git -C repository commit -m message");
  }`,
  `async () => {
    const { spawn } = require("node:child_process");
    spawn("git", ["merge", "--no-ff", "feature/topic"]);
  }`,
  `async () => {
    const childProcess = require("node:child_process");
    childProcess.execFile("git", ["cherry-pick", "abc123"]);
  }`,
  `async () => {
    const path = require("node:path");
    const { execFile } = require("node:child_process");
    execFile("bash", [path.join(process.env.CLAUDE_PLUGIN_ROOT, "scripts", "commit-with-dynamic-attribution.sh")]);
  }`,
  `async () => {
    const path = require("node:path");
    const { execFile } = require("node:child_process");
    execFile("git", ["merge", "--no-ff", "--no-commit", "feature/topic"]);
    execFile("C:\\\\Program Files\\\\Git\\\\bin\\\\bash.exe", [
      path.join(process.env.CLAUDE_PLUGIN_ROOT, "scripts", "commit-with-dynamic-attribution.sh"),
    ]);
  }`,
  `async () => {
    const { execFile } = require("node:child_process");
    execFile("git", ["merge", "--no-ff", "feature/first"]);
    execFile("git", ["merge", "--no-commit", "feature/second"]);
  }`,
];

for (const code of blockedPlaywrightCode) {
  test("blocks commit creation through Playwright unsafe process execution", () => {
    assert.equal(containsPlaywrightCommitExecution(code), true);
  });
}

const allowedPlaywrightCode = [
  `async (page) => page.getByText("git commit documentation").click()`,
  `async () => {
    const { execFile } = require("node:child_process");
    execFile("git", ["status", "--short"]);
  }`,
  `async () => {
    const { execFile } = require("node:child_process");
    execFile("git", ["merge", "--no-commit", "--no-ff", "feature/topic"]);
  }`,
  `async () => {
    const { spawn } = require("node:child_process");
    spawn("git", ["merge", "--ff-only", "feature/topic"]);
  }`,
  `async () => {
    const { spawn } = require("node:child_process");
    spawn("git", ["merge", "--squash", "feature/topic"]);
  }`,
  `async () => {
    const { execFile } = require("node:child_process");
    execFile("git", ["pull", "--ff-only", "origin", "main"]);
  }`,
  `async (page) => {
    // require("node:child_process").exec("git commit -m ignored");
    return page.title();
  }`,
];

for (const code of allowedPlaywrightCode) {
  test("allows Playwright code that cannot create a Git commit", () => {
    assert.equal(containsPlaywrightCommitExecution(code), false);
  });
}

test("returns the structured PreToolUse deny decision", () => {
  assert.deepEqual(evaluateHookInput(hookInput("git -C repository commit -m message")), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: DIRECT_COMMIT_REASON,
    },
  });
});

test("returns the Playwright-specific deny decision", () => {
  const input = playwrightHookInput(blockedPlaywrightCode[0]);
  assert.deepEqual(evaluateHookInput(input), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: PLAYWRIGHT_COMMIT_REASON,
    },
  });
});

test("returns no decision for allowed calls and other hook events", () => {
  assert.equal(evaluateHookInput(hookInput("git status")), null);
  assert.equal(evaluateHookInput(playwrightHookInput(allowedPlaywrightCode[0])), null);
  assert.equal(evaluateHookInput({ ...hookInput("git commit"), tool_name: "Read" }), null);
  assert.equal(evaluateHookInput({ ...hookInput("git commit"), hook_event_name: "PostToolUse" }), null);
});

test("CLI writes only the structured deny JSON and exits successfully", () => {
  const result = runGuard(hookInput("git commit -m message"));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), evaluateHookInput(hookInput("git commit -m message")));
});

test("CLI denies Playwright unsafe commit execution", () => {
  const input = playwrightHookInput(blockedPlaywrightCode.at(-1));
  const result = runGuard(input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), evaluateHookInput(input));
});

test("CLI stays silent for an allowed Git command", () => {
  const result = runGuard(hookInput("git status"));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("CLI fails closed with exit 2 for malformed hook input", () => {
  const malformedJson = runGuard("{");
  assert.equal(malformedJson.status, 2);
  assert.equal(malformedJson.stdout, "");
  assert.match(malformedJson.stderr, /direct git commit guard error/u);

  const missingCommand = runGuard({ hook_event_name: "PreToolUse", tool_name: "Bash" });
  assert.equal(missingCommand.status, 2);
  assert.equal(missingCommand.stdout, "");
  assert.match(missingCommand.stderr, /tool_input\.command/u);

  const missingCode = runGuard({
    hook_event_name: "PreToolUse",
    tool_name: "mcp__plugin_playwright_playwright__browser_run_code_unsafe",
  });
  assert.equal(missingCode.status, 2);
  assert.equal(missingCode.stdout, "");
  assert.match(missingCode.stderr, /tool_input\.code/u);
});

test("hooks.json runs one guard for Bash and Playwright unsafe calls", () => {
  const configuration = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
  const groups = configuration.hooks.PreToolUse;
  assert.equal(groups.length, 1);
  assert.equal(groups[0].matcher, "Bash|mcp__.*playwright.*__browser_run_code_unsafe");
  assert.deepEqual(groups[0].hooks, [
    {
      args: ["${CLAUDE_PLUGIN_ROOT}/scripts/deny-direct-git-commit.mjs"],
      command: "node",
      timeout: 10,
      type: "command",
    },
  ]);
});
