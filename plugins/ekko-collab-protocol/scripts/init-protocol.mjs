#!/usr/bin/env node
// Deterministic, confirmation-gated initialization of a software project's Coding Agent protocol.
//   node init-protocol.mjs plan  --config <file>
//   node init-protocol.mjs show  --config <file> --path <relative-path>
//   node init-protocol.mjs apply --config <file> --expected <sha256:...>
// Existing files are never overwritten; they are reported as SKIP so the caller can merge by hand.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { renderProtocol } from "./lib/protocol-templates.mjs";

class UsageError extends Error {}

const LANGUAGES = new Set(["zh", "en"]);
const LAYOUTS = new Set(["single-repo", "multi-repo"]);
const COMMIT_POLICIES = new Set(["ask", "allowed"]);
const CONFIG_KEYS = new Set([
  "root", "language", "projectName", "layout", "entrypoint", "claudePointer", "statusFile", "changesDir",
  "adrDir", "verifyCommands", "modules", "repositories", "commitPolicy", "protectedPaths"
]);

function text(value, label, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || value.trim() === "" || /[\r\n`]/.test(value)) {
    throw new UsageError(`${label} must be a single-line, non-empty string without backticks.`);
  }
  return value.trim();
}

function relativePath(value, label) {
  const raw = text(value, label).replaceAll("\\", "/").replace(/\/+$/, "");
  if (path.isAbsolute(raw) || /^[A-Za-z]:/.test(raw) || raw.split("/").some((part) => part === ".." || part === "")) {
    throw new UsageError(`${label} must be a relative path inside the project without '..'.`);
  }
  return raw.replace(/^\.\//, "");
}

function list(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new UsageError(`${label} must be an array.`);
  return value;
}

function mapEntries(value, label) {
  return list(value, label).map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new UsageError(`${label}[${index}] must be an object.`);
    const dir = relativePath(entry.path, `${label}[${index}].path`);
    return { path: `${dir}/`, purpose: text(entry.purpose, `${label}[${index}].purpose`) };
  });
}

export function normalizeConfig(raw, cwd = process.cwd()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new UsageError("config must be a JSON object.");
  const unknown = Object.keys(raw).find((key) => !CONFIG_KEYS.has(key));
  if (unknown) throw new UsageError(`config contains unknown field '${unknown}'.`);
  if (!LANGUAGES.has(raw.language)) throw new UsageError("language must be 'zh' or 'en'.");
  const layout = raw.layout ?? "single-repo";
  if (!LAYOUTS.has(layout)) throw new UsageError("layout must be 'single-repo' or 'multi-repo'.");
  const commitPolicy = raw.commitPolicy ?? "ask";
  if (!COMMIT_POLICIES.has(commitPolicy)) throw new UsageError("commitPolicy must be 'ask' or 'allowed'.");
  if (raw.claudePointer !== undefined && typeof raw.claudePointer !== "boolean") throw new UsageError("claudePointer must be a boolean.");
  const repositories = mapEntries(raw.repositories, "repositories");
  if (layout === "multi-repo" && repositories.length === 0) throw new UsageError("multi-repo layout needs at least one entry in repositories.");
  const config = {
    root: path.resolve(cwd, typeof raw.root === "string" && raw.root.trim() !== "" ? raw.root : "."),
    language: raw.language,
    projectName: text(raw.projectName, "projectName"),
    layout,
    entrypoint: relativePath(raw.entrypoint ?? "AGENTS.md", "entrypoint"),
    claudePointer: raw.claudePointer ?? true,
    statusFile: relativePath(raw.statusFile ?? "docs/STATUS.md", "statusFile"),
    changesDir: relativePath(raw.changesDir ?? "docs/changes", "changesDir"),
    adrDir: relativePath(raw.adrDir ?? "docs/adr", "adrDir"),
    verifyCommands: list(raw.verifyCommands, "verifyCommands").map((entry, index) => typeof entry === "string"
      ? { command: text(entry, `verifyCommands[${index}]`) }
      : {
          command: text(entry?.command, `verifyCommands[${index}].command`),
          ...(entry?.cwd === undefined ? {} : { cwd: `${relativePath(entry.cwd, `verifyCommands[${index}].cwd`)}/` })
        }),
    modules: mapEntries(raw.modules, "modules"),
    repositories,
    commitPolicy,
    protectedPaths: list(raw.protectedPaths, "protectedPaths").map((entry, index) => {
      const value = relativePath(entry, `protectedPaths[${index}]`);
      return value.includes(".") && !value.includes("/") ? value : `${value}/`;
    })
  };
  if (!config.entrypoint.endsWith(".md") || config.entrypoint.includes("/")) throw new UsageError("entrypoint must be a root-level Markdown file such as AGENTS.md.");
  if (!config.statusFile.endsWith(".md")) throw new UsageError("statusFile must be a Markdown file.");
  return config;
}

function rootDirectory(root) {
  let stat;
  try {
    stat = fs.lstatSync(root);
  } catch {
    throw new UsageError(`project root does not exist: ${root}`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new UsageError(`project root must be a real directory: ${root}`);
  return fs.realpathSync(root);
}

/** Classifies each target as CREATE or SKIP; any symlink on the way or path escaping the root aborts. */
function classify(root, relative) {
  const absolute = path.resolve(root, relative);
  const fromRoot = path.relative(root, absolute);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) throw new UsageError(`refusing path outside the project: ${relative}`);
  let current = root;
  for (const segment of fromRoot.split(path.sep)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch {
      return { absolute, action: "CREATE" };
    }
    if (stat.isSymbolicLink()) throw new UsageError(`refusing to write through a symbolic link: ${path.relative(root, current)}`);
  }
  return { absolute, action: "SKIP" };
}

export function buildPlan(config) {
  const root = rootDirectory(config.root);
  const entries = renderProtocol(config).map((file) => ({ ...file, ...classify(root, file.path) }));
  const digest = `sha256:${createHash("sha256").update(JSON.stringify({
    root,
    files: entries.map(({ path: file, action, content }) => ({ path: file, action, content }))
  })).digest("hex")}`;
  return { root, entries, digest };
}

function formatPlan(plan, config) {
  const out = [`Project root: ${plan.root}`, `Language: ${config.language} · Layout: ${config.layout} · Commit policy: ${config.commitPolicy}`, ""];
  for (const entry of plan.entries) {
    out.push(`${entry.action.padEnd(6)} ${entry.path}${entry.action === "SKIP" ? "  (exists; never overwritten, merge by hand if needed)" : `  (${entry.content.split("\n").length - 1} lines)`}`);
  }
  if (config.verifyCommands.length === 0) out.push("", "WARNING: no verification commands; the protocol will ask to add them once the project has build or test commands.");
  out.push("", `Plan digest: ${plan.digest}`);
  return `${out.join("\n")}\n`;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new UsageError(`${name} requires a value.`);
  return value;
}

function loadConfig(args) {
  const file = option(args, "--config");
  if (!file) throw new UsageError("--config <file> is required.");
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new UsageError(`cannot read config '${file}': ${error instanceof Error ? error.message : String(error)}`);
  }
  return normalizeConfig(raw);
}

export function run(args) {
  const [command, ...rest] = args;
  const config = loadConfig(rest);
  const plan = buildPlan(config);
  if (command === "plan") return formatPlan(plan, config);
  if (command === "show") {
    const wanted = relativePath(option(rest, "--path"), "--path");
    const entry = plan.entries.find((candidate) => candidate.path === wanted);
    if (!entry) throw new UsageError(`'${wanted}' is not part of the plan.`);
    return entry.content;
  }
  if (command === "apply") {
    const expected = option(rest, "--expected");
    if (expected !== plan.digest) {
      throw new UsageError(`plan digest mismatch (expected ${expected ?? "none"}, current ${plan.digest}); rerun plan and confirm again.`);
    }
    const written = [];
    for (const entry of plan.entries.filter((candidate) => candidate.action === "CREATE")) {
      fs.mkdirSync(path.dirname(entry.absolute), { recursive: true });
      fs.writeFileSync(entry.absolute, entry.content, { encoding: "utf8", flag: "wx" });
      written.push(entry.path);
    }
    const skipped = plan.entries.filter((candidate) => candidate.action === "SKIP").map((candidate) => candidate.path);
    return `${[...written.map((file) => `CREATED ${file}`), ...skipped.map((file) => `SKIPPED ${file}`)].join("\n")}\n`;
  }
  throw new UsageError("command must be plan, show or apply.");
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/").replace(/^(?=[A-Za-z]:)/, "/")}` || process.argv[1]?.endsWith("init-protocol.mjs")) {
  try {
    process.stdout.write(run(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof UsageError || (error && typeof error === "object" && "code" in error && error.code === "EEXIST")) {
      process.stderr.write(`init-protocol: ${error.message}\n`);
      process.exit(2);
    }
    throw error;
  }
}
