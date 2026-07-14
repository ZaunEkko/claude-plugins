import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyPlan,
  buildPlan,
  parseWorktreePorcelain,
  planDigest,
} from "../scripts/clean-gone.mjs";

const pluginRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(pluginRoot, "scripts", "clean-gone.mjs");
const commandFile = path.join(pluginRoot, "commands", "clean_gone.md");

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function git(repository, ...args) {
  const result = run("git", args, { cwd: repository });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function createFixture(t) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "clean-gone-test-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const repository = path.join(fixture, "repository");
  const remote = path.join(fixture, "remote.git");
  fs.mkdirSync(repository);
  fs.mkdirSync(remote);
  git(repository, "init", "--quiet", "--initial-branch=main");
  git(repository, "config", "user.name", "Clean Gone Test");
  git(repository, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(repository, "file.txt"), "initial\n");
  git(repository, "add", "file.txt");
  git(repository, "commit", "--quiet", "-m", "initial");
  git(remote, "init", "--quiet", "--bare");
  git(repository, "remote", "add", "origin", remote);
  git(repository, "push", "--quiet", "--set-upstream", "origin", "main");
  return { fixture, repository, remote };
}

function createGoneBranch(repository, branch, { uniqueCommit = false } = {}) {
  git(repository, "branch", branch, "main");
  if (uniqueCommit) {
    git(repository, "checkout", "--quiet", branch);
    fs.appendFileSync(path.join(repository, "file.txt"), `${branch}\n`);
    git(repository, "add", "file.txt");
    git(repository, "commit", "--quiet", "-m", `commit ${branch}`);
    git(repository, "checkout", "--quiet", "main");
  }
  git(repository, "push", "--quiet", "--set-upstream", "origin", branch);
  git(repository, "push", "--quiet", "origin", "--delete", branch);
}

function candidate(plan, branch) {
  return plan.candidates.find((entry) => entry.branch === branch);
}

function cli(repository, ...args) {
  return run(process.execPath, [script, ...args], { cwd: repository });
}

function digestFrom(output) {
  const match = output.match(/^Plan digest: (sha256:[0-9a-f]{64})$/mu);
  assert.ok(match, output);
  return match[1];
}

function failingGit(match) {
  return (args, options = {}) => {
    if (match(args)) {
      return { status: 91, stdout: Buffer.alloc(0), stderr: Buffer.from("injected failure\n") };
    }
    return spawnSync("git", args, {
      cwd: options.cwd,
      encoding: options.encoding ?? "buffer",
      env: { ...process.env, LC_ALL: "C", LANG: "C", ...options.env },
    });
  };
}

test("parses NUL-delimited worktree records without splitting unusual paths", () => {
  const records = parseWorktreePorcelain(Buffer.from(
    "worktree /tmp/path with spaces\nand newline\0" +
    "HEAD 0123456789012345678901234567890123456789\0" +
    "branch refs/heads/feature/a+b.(test)\0" +
    "locked maintenance\0\0",
  ));
  assert.deepEqual(records, [{
    path: "/tmp/path with spaces\nand newline",
    head: "0123456789012345678901234567890123456789",
    branch: "refs/heads/feature/a+b.(test)",
    bare: false,
    detached: false,
    locked: true,
    lockReason: "maintenance",
    prunable: false,
    pruneReason: null,
  }]);
});

test("selects an exact missing remote upstream and ignores display-text lookalikes", (t) => {
  const { repository } = createFixture(t);
  const gone = "feature/a+b.(test)";
  createGoneBranch(repository, gone);
  git(repository, "branch", "feature/a+b");
  git(repository, "branch", "feature/subject-only");
  git(repository, "checkout", "--quiet", "feature/subject-only");
  git(repository, "commit", "--quiet", "--allow-empty", "-m", "contains [gone] text");
  git(repository, "checkout", "--quiet", "main");

  const plan = buildPlan({ cwd: repository });
  assert.equal(candidate(plan, gone).action, "delete");
  assert.equal(candidate(plan, "feature/a+b"), undefined);
  assert.equal(candidate(plan, "feature/subject-only"), undefined);
  assert.deepEqual(plan.candidates.map((entry) => entry.branch), [gone]);
});

test("plans and applies deletion for a clean linked worktree with spaces and Unicode", (t) => {
  const { fixture, repository } = createFixture(t);
  const branch = "feature/safe+cleanup";
  createGoneBranch(repository, branch);
  const worktree = path.join(fixture, "linked worktree 测试");
  git(repository, "worktree", "add", "--quiet", worktree, branch);

  const planned = cli(repository, "plan");
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  assert.match(planned.stdout, /DELETE "feature\/safe\+cleanup"/u);
  const digest = digestFrom(planned.stdout);

  const applied = cli(repository, "apply", "--expected", digest);
  assert.equal(applied.status, 0, applied.stderr || applied.stdout);
  assert.equal(fs.existsSync(worktree), false);
  assert.notEqual(run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    cwd: repository,
  }).status, 0);
});

test("skips dirty, untracked, locked, current, and unpreserved candidates", (t) => {
  const { fixture, repository } = createFixture(t);
  const dirtyBranch = "feature/dirty";
  const untrackedBranch = "feature/untracked";
  const lockedBranch = "feature/locked";
  const currentBranch = "feature/current";
  const uniqueBranch = "feature/unique";
  for (const branch of [dirtyBranch, untrackedBranch, lockedBranch, currentBranch]) {
    createGoneBranch(repository, branch);
  }
  createGoneBranch(repository, uniqueBranch, { uniqueCommit: true });

  const dirtyPath = path.join(fixture, "dirty worktree");
  const untrackedPath = path.join(fixture, "untracked worktree");
  const lockedPath = path.join(fixture, "locked worktree");
  const currentPath = path.join(fixture, "current worktree");
  git(repository, "worktree", "add", "--quiet", dirtyPath, dirtyBranch);
  git(repository, "worktree", "add", "--quiet", untrackedPath, untrackedBranch);
  git(repository, "worktree", "add", "--quiet", lockedPath, lockedBranch);
  git(repository, "worktree", "add", "--quiet", currentPath, currentBranch);
  fs.appendFileSync(path.join(dirtyPath, "file.txt"), "dirty\n");
  fs.writeFileSync(path.join(untrackedPath, "new.txt"), "untracked\n");
  git(repository, "worktree", "lock", "--reason", "do not remove", lockedPath);

  const plan = buildPlan({ cwd: currentPath });
  assert.equal(candidate(plan, dirtyBranch).reason, "dirty-worktree");
  assert.equal(candidate(plan, untrackedBranch).reason, "untracked-worktree");
  assert.equal(candidate(plan, lockedBranch).reason, "locked-worktree");
  assert.equal(candidate(plan, currentBranch).reason, "current-worktree");
  assert.equal(candidate(plan, uniqueBranch).reason, "unpreserved-commits");
});

test("accepts retained branch, remote, lightweight tag, and annotated tag witnesses", (t) => {
  const { repository } = createFixture(t);
  const branchWitness = "feature/preserved-by-branch";
  createGoneBranch(repository, branchWitness, { uniqueCommit: true });
  git(repository, "branch", "keep/branch", branchWitness);

  const remoteWitness = "feature/preserved-by-remote";
  createGoneBranch(repository, remoteWitness, { uniqueCommit: true });
  git(repository, "update-ref", "refs/remotes/archive/remote-witness", remoteWitness);

  const lightTag = "feature/preserved-by-light-tag";
  createGoneBranch(repository, lightTag, { uniqueCommit: true });
  git(repository, "tag", "keep-light", lightTag);

  const annotatedTag = "feature/preserved-by-annotated-tag";
  createGoneBranch(repository, annotatedTag, { uniqueCommit: true });
  git(repository, "tag", "-a", "keep-annotated", "-m", "keep", annotatedTag);

  const plan = buildPlan({ cwd: repository });
  for (const branch of [branchWitness, remoteWitness, lightTag, annotatedTag]) {
    assert.equal(candidate(plan, branch).action, "delete", branch);
    assert.ok(candidate(plan, branch).witnesses.length > 0, branch);
  }
});

test("candidate branches do not preserve one another", (t) => {
  const { repository } = createFixture(t);
  const parent = "feature/candidate-parent";
  const child = "feature/candidate-child";
  createGoneBranch(repository, parent, { uniqueCommit: true });
  git(repository, "branch", child, parent);
  git(repository, "checkout", "--quiet", child);
  fs.appendFileSync(path.join(repository, "file.txt"), "child\n");
  git(repository, "add", "file.txt");
  git(repository, "commit", "--quiet", "-m", "child");
  git(repository, "checkout", "--quiet", "main");
  git(repository, "push", "--quiet", "--set-upstream", "origin", child);
  git(repository, "push", "--quiet", "origin", "--delete", child);

  const plan = buildPlan({ cwd: repository });
  assert.equal(candidate(plan, parent).reason, "unpreserved-commits");
  assert.equal(candidate(plan, child).reason, "unpreserved-commits");
});

test("plan digest is deterministic and apply rejects changed state", (t) => {
  const { repository } = createFixture(t);
  const branch = "feature/digest";
  createGoneBranch(repository, branch);
  const first = buildPlan({ cwd: repository });
  const second = buildPlan({ cwd: repository });
  assert.equal(planDigest(first), planDigest(second));

  git(repository, "tag", "state-change");
  const result = cli(repository, "apply", "--expected", planDigest(first));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /repository state changed/u);
  assert.equal(git(repository, "show-ref", "--verify", `refs/heads/${branch}`).length > 0, true);
});

test("apply requires a valid expected digest", (t) => {
  const { repository } = createFixture(t);
  const branch = "feature/no-confirmation";
  createGoneBranch(repository, branch);
  const result = cli(repository, "apply");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage:/u);
  assert.equal(git(repository, "show-ref", "--verify", `refs/heads/${branch}`).length > 0, true);
});

test("worktree removal failure keeps the branch", (t) => {
  const { fixture, repository } = createFixture(t);
  const branch = "feature/remove-failure";
  createGoneBranch(repository, branch);
  const worktree = path.join(fixture, "remove failure");
  git(repository, "worktree", "add", "--quiet", worktree, branch);
  const plan = buildPlan({ cwd: repository });

  assert.throws(() => applyPlan(plan, {
    cwd: repository,
    runGit: failingGit((args) => args[0] === "worktree" && args[1] === "remove"),
  }), /git worktree failed/u);
  assert.equal(fs.existsSync(worktree), true);
  assert.equal(git(repository, "show-ref", "--verify", `refs/heads/${branch}`).length > 0, true);
});

test("branch deletion failure reports the removed worktree and leaves the branch", (t) => {
  const { fixture, repository } = createFixture(t);
  const branch = "feature/branch-failure";
  createGoneBranch(repository, branch);
  const worktree = path.join(fixture, "branch failure");
  git(repository, "worktree", "add", "--quiet", worktree, branch);
  const plan = buildPlan({ cwd: repository });

  let error;
  try {
    applyPlan(plan, {
      cwd: repository,
      runGit: failingGit((args) => args[0] === "branch" && args[1] === "-D"),
    });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error);
  assert.deepEqual(error.completedOperations, [{
    operation: "remove-worktree",
    path: candidate(plan, branch).worktree.path,
  }]);
  assert.equal(fs.existsSync(worktree), false);
  assert.equal(git(repository, "show-ref", "--verify", `refs/heads/${branch}`).length > 0, true);
});

test("command delegates planning and apply with explicit confirmation", () => {
  const command = fs.readFileSync(commandFile, "utf8");
  const planStep = command.indexOf("clean-gone.mjs\" plan");
  const confirmationStep = command.indexOf("AskUserQuestion", planStep);
  const applyStep = command.indexOf("clean-gone.mjs\" apply --expected");
  assert.ok(planStep >= 0 && planStep < confirmationStep && confirmationStep < applyStep);
  assert.doesNotMatch(command, /git branch -v\s*\||git worktree remove --force|git branch -D/u);

  const source = fs.readFileSync(script, "utf8");
  assert.doesNotMatch(source, /shell:\s*true|\["fetch"|\["remote",\s*"prune"|worktree",\s*"remove",\s*"--force"/u);
});
