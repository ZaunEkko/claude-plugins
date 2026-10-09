#!/usr/bin/env node
// Copies a built ekko-benchmark into scripts/vendor/ekko-benchmark and records file hashes.
// Usage: node scripts/sync-benchmark.mjs <path-to-ekko-benchmark-checkout>
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = path.join(pluginRoot, "scripts", "vendor", "ekko-benchmark");

function fail(message) {
  process.stderr.write(`sync-benchmark: ${message}\n`);
  process.exit(2);
}

function listJs(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`refusing symbolic link ${absolute}`);
    if (entry.isDirectory()) return listJs(absolute, base);
    return entry.name.endsWith(".js") ? [path.relative(base, absolute).split(path.sep).join("/")] : [];
  });
}

const source = process.argv[2];
if (!source) fail("pass the ekko-benchmark checkout path.");
const sourceRoot = path.resolve(source);
const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
if (manifest.name !== "@zaunekko/benchmark") fail(`unexpected package ${manifest.name}`);
const distRoot = path.join(sourceRoot, "dist");
if (!fs.existsSync(path.join(distRoot, "cli.js"))) fail("dist/cli.js is missing; run `npm run build` in ekko-benchmark first.");

fs.rmSync(vendorRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(vendorRoot, "lib"), { recursive: true });

const files = {};
const hash = (content) => `sha256:${createHash("sha256").update(content).digest("hex")}`;
for (const relative of listJs(distRoot).sort()) {
  // Source maps are not shipped, so drop the dangling references.
  const content = fs.readFileSync(path.join(distRoot, relative), "utf8").replace(/\r\n/g, "\n").replace(/\n\/\/# sourceMappingURL=.*\n?$/, "\n");
  const target = path.join(vendorRoot, "lib", relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  files[`lib/${relative}`] = hash(content);
}
const license = fs.readFileSync(path.join(sourceRoot, "LICENSE"), "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(path.join(vendorRoot, "LICENSE"), license);
files.LICENSE = hash(license);
const packageJson = `${JSON.stringify({ name: "ekko-benchmark-vendored", private: true, type: "module" }, null, 2)}\n`;
fs.writeFileSync(path.join(vendorRoot, "package.json"), packageJson);
files["package.json"] = hash(packageJson);

const record = { package: manifest.name, version: manifest.version, license: manifest.license, files };
fs.writeFileSync(path.join(vendorRoot, "VENDOR.json"), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`Vendored ${manifest.name}@${manifest.version}: ${Object.keys(files).length} files.\n`);
