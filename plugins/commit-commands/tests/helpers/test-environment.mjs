import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function environmentKey(environment, name) {
  return Object.keys(environment).find((key) => key.toLowerCase() === name.toLowerCase()) ?? name;
}

function findGitBashDirectory(environment) {
  const result = spawnSync("where.exe", ["git"], {
    encoding: "utf8",
    env: environment,
    windowsHide: true,
  });
  if (result.status !== 0) {
    return null;
  }

  for (const executable of result.stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean)) {
    let directory = path.dirname(executable);
    for (let depth = 0; depth < 5; depth += 1) {
      for (const candidate of [
        path.join(directory, "bin"),
        path.join(directory, "usr", "bin"),
      ]) {
        if (fs.existsSync(path.join(candidate, "bash.exe"))) {
          return candidate;
        }
      }

      const parent = path.dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
  }

  return null;
}

export function withGitBashPath(environment = process.env) {
  const resolved = { ...environment };
  if (process.platform !== "win32") {
    return resolved;
  }

  const gitBashDirectory = findGitBashDirectory(resolved);
  if (!gitBashDirectory) {
    return resolved;
  }

  const pathKey = environmentKey(resolved, "PATH");
  resolved[pathKey] = [gitBashDirectory, resolved[pathKey]].filter(Boolean).join(path.delimiter);
  return resolved;
}
