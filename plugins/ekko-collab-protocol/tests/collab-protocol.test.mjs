import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildPlan, normalizeConfig, run } from "../scripts/init-protocol.mjs";
import { scanWorkspace } from "../scripts/vendor/ekko-benchmark/lib/static/scan.js";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = path.join(pluginRoot, "scripts", "vendor", "ekko-benchmark");

function workspace(t, files = {}, directories = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-collab-protocol-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of directories) fs.mkdirSync(path.join(root, directory), { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), content, "utf8");
  }
  return root;
}

function apply(config) {
  const plan = buildPlan(config);
  return { plan, output: run(["apply", "--config", writeConfig(config), "--expected", plan.digest]) };
}

const configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ekko-collab-protocol-config-"));
process.on("exit", () => fs.rmSync(configDirectory, { recursive: true, force: true }));
let configCounter = 0;
function writeConfig(config) {
  const file = path.join(configDirectory, `config-${configCounter += 1}.json`);
  fs.writeFileSync(file, JSON.stringify(config), "utf8");
  return file;
}

test("vendored ekko-benchmark matches its recorded hashes", () => {
  const record = JSON.parse(fs.readFileSync(path.join(vendorRoot, "VENDOR.json"), "utf8"));
  assert.equal(record.package, "@zaunekko/benchmark");
  const listed = new Set(Object.keys(record.files));
  for (const [relative, expected] of Object.entries(record.files)) {
    const actual = `sha256:${createHash("sha256").update(fs.readFileSync(path.join(vendorRoot, relative))).digest("hex")}`;
    assert.equal(actual, expected, relative);
  }
  const shipped = fs.readdirSync(path.join(vendorRoot, "lib"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `lib/${path.relative(path.join(vendorRoot, "lib"), path.join(entry.parentPath, entry.name)).split(path.sep).join("/")}`);
  for (const file of shipped) assert.ok(listed.has(file), `unrecorded vendored file ${file}`);
});

test("benchmark wrapper runs the vendored CLI offline", (t) => {
  const root = workspace(t, { "AGENTS.md": "# Rules\nOnly modify files in this repository.\n" });
  const result = spawnSync(process.execPath, [path.join(pluginRoot, "scripts", "benchmark.mjs"), "scan", root, "--format", "json"], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.kind, "static-readiness");
  assert.ok(Array.isArray(report.improvements.items));
});

const SCENARIOS = [
  {
    name: "zh single repository",
    files: { "package.json": JSON.stringify({ name: "x", engines: { node: ">=22" }, scripts: { test: "node --test", lint: "eslint ." } }), "src/index.js": "export {};\n" },
    directories: [".git"],
    config: { language: "zh", projectName: "示例", verifyCommands: ["npm test", "npm run lint"], modules: [{ path: "src", purpose: "应用代码" }, { path: "test", purpose: "测试" }], protectedPaths: ["dist"] }
  },
  {
    name: "en single repository with local commits allowed",
    files: { "package.json": JSON.stringify({ name: "x", engines: { node: ">=22" }, scripts: { test: "node --test" } }), "src/index.js": "export {};\n" },
    directories: [".git"],
    config: { language: "en", projectName: "example", verifyCommands: ["npm test"], commitPolicy: "allowed" }
  },
  {
    name: "zh docs-first project before development",
    files: {},
    directories: [".git"],
    config: { language: "zh", projectName: "新项目", verifyCommands: ["npm test"] }
  },
  {
    name: "en multi-repository coordination directory",
    files: {
      "backend/pom.xml": "<project><properties><java.version>17</java.version></properties></project>",
      "frontend/package.json": JSON.stringify({ name: "f", engines: { node: ">=22" }, scripts: { test: "vitest" } }),
      "frontend/AGENTS.md": "# Frontend\nRun npm test.\n"
    },
    directories: ["backend/.git", "frontend/.git"],
    config: {
      language: "en",
      projectName: "suite",
      layout: "multi-repo",
      repositories: [{ path: "backend", purpose: "API service" }, { path: "frontend", purpose: "web app" }],
      verifyCommands: [{ command: "mvn test", cwd: "backend" }, { command: "npm test", cwd: "frontend" }]
    }
  }
];

for (const scenario of SCENARIOS) {
  test(`initialized protocol passes every applicable benchmark rule: ${scenario.name}`, (t) => {
    const root = workspace(t, scenario.files, scenario.directories);
    apply(normalizeConfig({ ...scenario.config, root }));

    const report = scanWorkspace(root);
    const open = report.results.filter((result) => result.status === "partial" || result.status === "fail");
    assert.deepEqual(open.map((result) => `${result.id}:${result.status}`), []);
    assert.equal(report.staticReadiness.score, 100);
    assert.equal(report.staticReadiness.core.status, "clear");
    assert.ok(!report.reviewItems.some((item) => item.id === "stale-markers"), "templates must not contain placeholder markers");
  });
}

test("apply refuses a stale digest and never overwrites existing files", (t) => {
  const root = workspace(t, { "AGENTS.md": "# Team rules\nkeep me\n" }, [".git"]);
  const config = normalizeConfig({ root, language: "en", projectName: "x", verifyCommands: ["npm test"] });
  const configFile = writeConfig(config);

  assert.throws(() => run(["apply", "--config", configFile, "--expected", "sha256:stale"]), /digest mismatch/);
  assert.equal(fs.existsSync(path.join(root, "CLAUDE.md")), false);

  const plan = buildPlan(config);
  assert.equal(plan.entries.find((entry) => entry.path === "AGENTS.md").action, "SKIP");
  const output = run(["apply", "--config", configFile, "--expected", plan.digest]);
  assert.match(output, /SKIPPED AGENTS\.md/);
  assert.match(output, /CREATED docs\/STATUS\.md/);
  assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), "# Team rules\nkeep me\n");

  const again = buildPlan(config);
  assert.notEqual(again.digest, plan.digest);
  assert.ok(again.entries.every((entry) => entry.action === "SKIP"));
});

test("show prints a planned file and plan reports the digest", (t) => {
  const root = workspace(t, {}, [".git"]);
  const configFile = writeConfig({ root, language: "zh", projectName: "x" });

  assert.match(run(["plan", "--config", configFile]), /CREATE AGENTS\.md[\s\S]*Plan digest: sha256:[0-9a-f]{64}/);
  assert.match(run(["plan", "--config", configFile]), /WARNING: no verification commands/);
  assert.match(run(["show", "--config", configFile, "--path", "AGENTS.md"]), /^# AGENTS\.md\n/);
});

test("rejects invalid configuration and paths outside the project", (t) => {
  const root = workspace(t);
  assert.throws(() => normalizeConfig({ root, language: "fr", projectName: "x" }), /language/);
  assert.throws(() => normalizeConfig({ root, language: "zh", projectName: "x", extra: true }), /unknown field 'extra'/);
  assert.throws(() => normalizeConfig({ root, language: "zh", projectName: "x", statusFile: "../STATUS.md" }), /relative path inside the project/);
  assert.throws(() => normalizeConfig({ root, language: "zh", projectName: "x", adrDir: "C:/adr" }), /relative path inside the project/);
  assert.throws(() => normalizeConfig({ root, language: "zh", projectName: "x", layout: "multi-repo" }), /repositories/);
  assert.throws(() => normalizeConfig({ root, language: "zh", projectName: "x", verifyCommands: ["npm `rm`"] }), /backticks/);
  assert.throws(() => buildPlan(normalizeConfig({ root: path.join(root, "missing"), language: "zh", projectName: "x" })), /does not exist/);
});

test("refuses to write through a symbolic link", (t) => {
  const root = workspace(t, {}, ["outside"]);
  try {
    fs.symlinkSync(path.join(root, "outside"), path.join(root, "docs"), "junction");
  } catch (error) {
    t.skip(`symbolic links are unavailable here (${error.code})`);
    return;
  }
  const config = normalizeConfig({ root, language: "en", projectName: "x" });
  assert.throws(() => buildPlan(config), /symbolic link/);
  assert.equal(fs.readdirSync(path.join(root, "outside")).length, 0);
});
