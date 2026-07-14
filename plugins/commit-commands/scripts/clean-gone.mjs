#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PLAN_VERSION = 1;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function defaultRunGit(args, options = {}) {
  return spawnSync("git", args, {
    cwd: options.cwd,
    encoding: options.encoding ?? "buffer",
    env: { ...process.env, LC_ALL: "C", LANG: "C", ...options.env },
  });
}

function git(runGit, args, { cwd, allowStatus = [] } = {}) {
  const result = runGit(args, { cwd });
  const allowed = new Set([0, ...allowStatus]);
  if (!allowed.has(result.status)) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8").trim()
      : String(result.stderr ?? "").trim();
    throw new Error(`git ${args[0]} failed${stderr ? `: ${stderr}` : ""}`);
  }
  return result;
}

function stdoutBuffer(result) {
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "", "utf8");
}

function stdoutText(result) {
  return stdoutBuffer(result).toString("utf8").trim();
}

function splitRecords(buffer) {
  return buffer.toString("utf8").split("\n").filter(Boolean).map((line) => {
    const fields = line.split("\0");
    if (fields.at(-1) === "") {
      fields.pop();
    }
    return fields;
  });
}

function listBranches(runGit, cwd) {
  const result = git(runGit, [
    "for-each-ref",
    "--format=%(refname)%00%(objectname)%00%(upstream)%00",
    "refs/heads",
  ], { cwd });
  return splitRecords(stdoutBuffer(result)).map(([ref, oid, upstream]) => ({
    ref,
    name: ref.slice("refs/heads/".length),
    oid,
    upstream,
  })).sort((left, right) => left.ref.localeCompare(right.ref));
}

function listRefs(runGit, cwd) {
  const result = git(runGit, [
    "for-each-ref",
    "--format=%(refname)%00%(objectname)%00%(*objectname)%00%(objecttype)%00",
    "refs/heads",
    "refs/remotes",
    "refs/tags",
  ], { cwd });
  return splitRecords(stdoutBuffer(result)).map(([ref, oid, peeledOid, objectType]) => ({
    ref,
    oid,
    peeledOid,
    objectType,
  })).sort((left, right) => left.ref.localeCompare(right.ref));
}

export function parseWorktreePorcelain(buffer) {
  const records = [];
  let record = null;
  for (const rawField of buffer.toString("utf8").split("\0")) {
    if (rawField === "") {
      if (record) {
        records.push(record);
        record = null;
      }
      continue;
    }
    const separator = rawField.indexOf(" ");
    const key = separator < 0 ? rawField : rawField.slice(0, separator);
    const value = separator < 0 ? "" : rawField.slice(separator + 1);
    if (key === "worktree") {
      if (record) {
        records.push(record);
      }
      record = {
        path: value,
        head: null,
        branch: null,
        bare: false,
        detached: false,
        locked: false,
        lockReason: null,
        prunable: false,
        pruneReason: null,
      };
      continue;
    }
    if (!record) {
      throw new Error(`malformed worktree record: ${key} precedes worktree`);
    }
    if (key === "HEAD") {
      record.head = value;
    } else if (key === "branch") {
      record.branch = value;
    } else if (key === "bare") {
      record.bare = true;
    } else if (key === "detached") {
      record.detached = true;
    } else if (key === "locked") {
      record.locked = true;
      record.lockReason = value || null;
    } else if (key === "prunable") {
      record.prunable = true;
      record.pruneReason = value || null;
    }
  }
  if (record) {
    records.push(record);
  }
  return records;
}

function normalizePath(value) {
  const resolved = path.resolve(value);
  let normalized = resolved;
  try {
    normalized = fs.realpathSync.native(resolved);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function listWorktrees(runGit, cwd) {
  const result = git(runGit, ["worktree", "list", "--porcelain", "-z"], { cwd });
  const records = parseWorktreePorcelain(stdoutBuffer(result));
  if (records.length === 0) {
    throw new Error("git worktree list returned no worktrees");
  }
  return records.map((record) => ({ ...record, normalizedPath: normalizePath(record.path) }));
}

function inspectDirtyState(runGit, worktreePath) {
  const result = git(runGit, [
    "-C",
    worktreePath,
    "status",
    "--porcelain=v2",
    "-z",
    "--untracked-files=all",
    "--ignore-submodules=none",
  ]);
  const entries = stdoutBuffer(result).toString("utf8").split("\0").filter(Boolean);
  return {
    tracked: entries.some((entry) => !entry.startsWith("? ")),
    untracked: entries.some((entry) => entry.startsWith("? ")),
  };
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function planDigest(plan) {
  const canonical = JSON.stringify(stableValue(plan));
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function refCommitOid(runGit, cwd, ref) {
  const result = git(runGit, ["rev-parse", "--verify", `${ref}^{commit}`], { cwd, allowStatus: [128] });
  return result.status === 0 ? stdoutText(result) : null;
}

function isAncestor(runGit, cwd, ancestor, descendant) {
  const result = git(runGit, ["merge-base", "--is-ancestor", ancestor, descendant], {
    cwd,
    allowStatus: [1],
  });
  return result.status === 0;
}

function repositoryIdentity(runGit, cwd) {
  const bare = stdoutText(git(runGit, ["rev-parse", "--is-bare-repository"], { cwd }));
  if (bare !== "false") {
    throw new Error("clean-gone requires a non-bare repository");
  }
  const currentWorktree = stdoutText(git(runGit, ["rev-parse", "--show-toplevel"], { cwd }));
  const commonDir = stdoutText(git(runGit, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ], { cwd }));
  return {
    commonDir: normalizePath(commonDir),
    currentWorktree: normalizePath(currentWorktree),
  };
}

function preservationRefs(runGit, cwd, refs, candidateRefs) {
  const retained = [];
  for (const ref of refs) {
    if (candidateRefs.has(ref.ref)) {
      continue;
    }
    const commitOid = ref.peeledOid || (ref.objectType === "commit" ? ref.oid : refCommitOid(runGit, cwd, ref.ref));
    if (commitOid) {
      retained.push({ ref: ref.ref, oid: commitOid });
    }
  }
  return retained.sort((left, right) => left.ref.localeCompare(right.ref));
}

export function buildPlan({ cwd = process.cwd(), runGit = defaultRunGit } = {}) {
  const repository = repositoryIdentity(runGit, cwd);
  const branches = listBranches(runGit, cwd);
  const refs = listRefs(runGit, cwd);
  const existingRefs = new Set(refs.map((entry) => entry.ref));
  const worktrees = listWorktrees(runGit, cwd);
  const mainWorktree = worktrees[0].normalizedPath;
  const missingRemoteBranches = branches.filter((branch) =>
    branch.upstream.startsWith("refs/remotes/") && !existingRefs.has(branch.upstream));
  const candidateRefs = new Set(missingRemoteBranches.map((branch) => branch.ref));
  const retainedRefs = preservationRefs(runGit, cwd, refs, candidateRefs);
  const worktreesByBranch = new Map();
  for (const worktree of worktrees) {
    if (!worktree.branch) {
      continue;
    }
    if (worktreesByBranch.has(worktree.branch)) {
      throw new Error(`multiple worktrees claim ${worktree.branch}`);
    }
    worktreesByBranch.set(worktree.branch, worktree);
  }

  const candidates = missingRemoteBranches.map((branch) => {
    const worktree = worktreesByBranch.get(branch.ref) ?? null;
    let dirty = { tracked: false, untracked: false };
    if (worktree && !worktree.prunable) {
      if (worktree.head !== branch.oid) {
        throw new Error(`worktree HEAD does not match ${branch.ref}`);
      }
      dirty = inspectDirtyState(runGit, worktree.path);
    }
    const witnesses = retainedRefs.filter((entry) => isAncestor(runGit, cwd, branch.oid, entry.oid));
    let reason = null;
    if (worktree?.normalizedPath === mainWorktree) {
      reason = "main-worktree";
    } else if (worktree?.normalizedPath === repository.currentWorktree) {
      reason = "current-worktree";
    } else if (worktree?.locked) {
      reason = "locked-worktree";
    } else if (worktree?.prunable) {
      reason = "prunable-worktree";
    } else if (dirty.tracked) {
      reason = "dirty-worktree";
    } else if (dirty.untracked) {
      reason = "untracked-worktree";
    } else if (witnesses.length === 0) {
      reason = "unpreserved-commits";
    }
    return {
      action: reason ? "skip" : "delete",
      branch: branch.name,
      branchRef: branch.ref,
      oid: branch.oid,
      upstream: branch.upstream,
      reason,
      witnesses,
      worktree: worktree ? {
        path: worktree.path,
        normalizedPath: worktree.normalizedPath,
        head: worktree.head,
        locked: worktree.locked,
        lockReason: worktree.lockReason,
        prunable: worktree.prunable,
        pruneReason: worktree.pruneReason,
        dirtyTracked: dirty.tracked,
        dirtyUntracked: dirty.untracked,
      } : null,
    };
  }).sort((left, right) => left.branchRef.localeCompare(right.branchRef));

  return {
    version: PLAN_VERSION,
    repository: {
      commonDir: repository.commonDir,
      currentWorktree: repository.currentWorktree,
      mainWorktree,
    },
    refs: refs.map(({ ref, oid, peeledOid, objectType }) => ({ ref, oid, peeledOid, objectType })),
    worktrees: worktrees.map((worktree) => ({
      path: worktree.path,
      normalizedPath: worktree.normalizedPath,
      head: worktree.head,
      branch: worktree.branch,
      bare: worktree.bare,
      detached: worktree.detached,
      locked: worktree.locked,
      lockReason: worktree.lockReason,
      prunable: worktree.prunable,
      pruneReason: worktree.pruneReason,
    })),
    candidates,
  };
}

function candidateSummary(candidate) {
  const branch = JSON.stringify(candidate.branch);
  if (candidate.action === "skip") {
    return `SKIP ${branch} (${candidate.reason})`;
  }
  const operations = candidate.worktree
    ? `remove worktree ${JSON.stringify(candidate.worktree.path)}, then delete branch`
    : "delete branch";
  const witness = candidate.witnesses.map((entry) => entry.ref).join(", ");
  return `DELETE ${branch}: ${operations}; preserved by ${witness}`;
}

export function formatPlan(plan) {
  const lines = ["commit-commands clean-gone plan:"];
  if (plan.candidates.length === 0) {
    lines.push("No local branches have a missing remote-tracking upstream.");
  } else {
    lines.push(...plan.candidates.map(candidateSummary));
  }
  lines.push(`Plan digest: ${planDigest(plan)}`);
  return lines.join("\n");
}

function verifyCandidate(runGit, cwd, candidate) {
  const oid = refCommitOid(runGit, cwd, candidate.branchRef);
  if (oid !== candidate.oid) {
    throw new Error(`branch changed before deletion: ${candidate.branch}`);
  }
  const current = listBranches(runGit, cwd).find((branch) => branch.ref === candidate.branchRef);
  if (!current || current.upstream !== candidate.upstream) {
    throw new Error(`upstream changed before deletion: ${candidate.branch}`);
  }
  const upstreamExists = git(runGit, ["show-ref", "--verify", "--quiet", candidate.upstream], {
    cwd,
    allowStatus: [1],
  });
  if (upstreamExists.status === 0) {
    throw new Error(`upstream exists again: ${candidate.upstream}`);
  }
  for (const witness of candidate.witnesses) {
    if (refCommitOid(runGit, cwd, witness.ref) !== witness.oid ||
        !isAncestor(runGit, cwd, candidate.oid, witness.oid)) {
      throw new Error(`preservation witness changed: ${witness.ref}`);
    }
  }
  if (candidate.worktree) {
    const worktree = listWorktrees(runGit, cwd)
      .find((entry) => entry.branch === candidate.branchRef);
    if (!worktree || worktree.path !== candidate.worktree.path || worktree.head !== candidate.oid ||
        worktree.locked || worktree.prunable) {
      throw new Error(`worktree changed before deletion: ${candidate.branch}`);
    }
    const dirty = inspectDirtyState(runGit, worktree.path);
    if (dirty.tracked || dirty.untracked) {
      throw new Error(`worktree became dirty before deletion: ${candidate.branch}`);
    }
  }
}

export function applyPlan(plan, { cwd = process.cwd(), runGit = defaultRunGit } = {}) {
  const completed = [];
  for (const candidate of plan.candidates.filter((entry) => entry.action === "delete")) {
    try {
      verifyCandidate(runGit, cwd, candidate);
      if (candidate.worktree) {
        git(runGit, ["worktree", "remove", "--", candidate.worktree.path], { cwd });
        completed.push({ operation: "remove-worktree", path: candidate.worktree.path });
      }
      git(runGit, ["branch", "-D", "--", candidate.branch], { cwd });
      completed.push({ operation: "delete-branch", branch: candidate.branch, oid: candidate.oid });
    } catch (error) {
      error.completedOperations = completed;
      throw error;
    }
  }
  return completed;
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "plan") {
    return { command: "plan" };
  }
  if (argv.length === 3 && argv[0] === "apply" && argv[1] === "--expected" &&
      DIGEST_PATTERN.test(argv[2])) {
    return { command: "apply", expected: argv[2] };
  }
  throw new Error("usage: clean-gone.mjs plan | clean-gone.mjs apply --expected sha256:<digest>");
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const plan = buildPlan();
  const digest = planDigest(plan);
  if (options.command === "plan") {
    console.log(formatPlan(plan));
    return;
  }
  if (digest !== options.expected) {
    throw new Error(`repository state changed; expected ${options.expected}, current ${digest}; rerun plan`);
  }
  const completed = applyPlan(plan);
  if (completed.length === 0) {
    console.log("commit-commands: no safe gone branches required cleanup");
    return;
  }
  for (const operation of completed) {
    if (operation.operation === "remove-worktree") {
      console.log(`Removed worktree ${JSON.stringify(operation.path)}`);
    } else {
      console.log(`Deleted branch ${JSON.stringify(operation.branch)} at ${operation.oid}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`commit-commands: clean-gone failed: ${error.message}`);
    if (error.completedOperations?.length) {
      console.error(`commit-commands: completed before failure: ${JSON.stringify(error.completedOperations)}`);
    }
    process.exitCode = 1;
  }
}
