#!/usr/bin/env node
// Stable entry point for the vendored ekko-benchmark CLI: scan, agent, rules, profiles.
// The engine is offline, read-only and deterministic; it never runs commands of the scanned project.
import { main } from "./vendor/ekko-benchmark/lib/cli.js";

await main(process.argv.slice(2));
