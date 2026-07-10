import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  renderCommitBuffer,
  renderCommitFile,
} from "../scripts/render-commit-attribution.mjs";

const marker = "Generated with [Claude Code](https://claude.ai/code)";

function render(text, model, effort = null) {
  return renderCommitBuffer(Buffer.from(text, "utf8"), model, effort);
}

test("replaces only the last Model line after the final attribution marker", () => {
  const original = [
    "Document model behavior",
    "Model: domain object",
    "",
    marker,
    "Model: stale one",
    "Model: stale two",
    "",
    "Co-Authored-By: Claude <noreply@anthropic.com>",
    "",
  ].join("\n");
  const result = render(original, "gpt-5.6-sol");
  assert.equal(result.changed, true);
  assert.equal(
    result.buffer.toString("utf8"),
    original.replace("Model: stale two", "Model: gpt-5.6-sol"),
  );
});

test("uses the final marker and does not rewrite body Model lines", () => {
  const original = [
    marker,
    "Model: old attribution preserved because a later marker exists",
    "body",
    marker,
    "Model: active attribution",
  ].join("\n");
  const result = render(original, "Claude Opus 4.8");
  assert.equal(
    result.buffer.toString("utf8"),
    original.replace("Model: active attribution", "Model: Claude Opus 4.8"),
  );
});

test("combines effort into Model and removes legacy Effort lines", () => {
  const withoutEffort = [
    "Effort: body value",
    "",
    marker,
    "Model: stale",
    "",
    "Co-Authored-By: Claude <noreply@anthropic.com>",
    "",
  ].join("\n");
  const combined = render(withoutEffort, "gpt-5.6-sol", "xhigh").buffer.toString("utf8");
  assert.equal(
    combined,
    withoutEffort.replace("Model: stale", "Model: gpt-5.6-sol xhigh"),
  );
  assert.match(combined, /^Effort: body value$/mu);

  const existing = `${marker}\r\nModel: stale\r\nEffort: low\r\n`;
  assert.equal(
    render(existing, "Claude Sonnet 5", "high").buffer.toString("utf8"),
    `${marker}\r\nModel: Claude Sonnet 5 high\r\n`,
  );
  assert.equal(
    render(existing, "Claude Sonnet 5", null).buffer.toString("utf8"),
    `${marker}\r\nModel: Claude Sonnet 5\r\n`,
  );
  assert.equal(
    render(existing, null, null).buffer.toString("utf8"),
    `${marker}\r\n`,
  );

  assert.throws(
    () => render(`${marker}\nModel: old\n`, "safe", "xhigh\nInjected"),
    /effort is not safe/u,
  );
});

test("leaves messages byte-for-byte unchanged without a target attribution Model line", () => {
  for (const original of [
    "Subject\n\nModel: body only\n",
    `Subject\n\n${marker}\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n`,
  ]) {
    const input = Buffer.from(original);
    const result = renderCommitBuffer(input, "Claude Sonnet 5");
    assert.equal(result.changed, false);
    assert.equal(result.buffer, input);
    assert.deepEqual(result.buffer, Buffer.from(original));
  }
});

test("preserves LF and CRLF plus all non-target bytes", () => {
  const lf = `Subject\n\n${marker}\nModel:\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n`;
  assert.equal(render(lf, null).buffer.toString(), lf.replace("Model:\n", ""));

  const crlf = Buffer.from(
    `Subject\r\n\r\n${marker}\r\nModel: Claude Opus 4.8\r\n\r\nCo-Authored-By: Claude <noreply@anthropic.com>\r\n`,
  );
  const result = renderCommitBuffer(crlf, "gpt-5.6-sol");
  const expected = Buffer.from(crlf.toString().replace("Model: Claude Opus 4.8", "Model: gpt-5.6-sol"));
  assert.deepEqual(result.buffer, expected);
  assert.equal(result.buffer.filter((byte) => byte === 0x0d).length, crlf.filter((byte) => byte === 0x0d).length);
});

test("treats shell metacharacters as text and rejects control characters or NUL", () => {
  const dangerous = `model; $(touch should-not-run) ' " $PATH`;
  const result = render(`${marker}\nModel: old\n`, dangerous);
  assert.equal(result.buffer.toString(), `${marker}\nModel: ${dangerous}\n`);
  assert.throws(() => render(`${marker}\nModel: old\n`, "bad\ntrailer"), /not safe/u);
  assert.throws(
    () => renderCommitBuffer(Buffer.from(`${marker}\nModel: old\0\n`), "safe"),
    /NUL/u,
  );
});

test("writes changed files atomically and avoids writes when no target exists", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "commit-commands-render-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const messageFile = path.join(directory, "COMMIT_EDITMSG");
  fs.writeFileSync(messageFile, `${marker}\nModel: old\n`, { mode: 0o640 });

  const changed = renderCommitFile(messageFile, {
    resolution: {
      id: "gpt-5.6-sol",
      display: "gpt-5.6-sol",
      source: "test",
      confidence: "high",
      diagnostics: {},
    },
    effortResolution: {
      id: null,
      display: null,
      source: "unavailable",
      confidence: "none",
    },
  });
  assert.equal(changed.changed, true);
  assert.equal(fs.readFileSync(messageFile, "utf8"), `${marker}\nModel: gpt-5.6-sol\n`);

  fs.writeFileSync(messageFile, "No attribution\n", "utf8");
  const before = fs.statSync(messageFile).mtimeMs;
  const unchanged = renderCommitFile(messageFile, {
    resolution: {
      id: null,
      display: null,
      source: "unavailable",
      confidence: "none",
      diagnostics: {},
    },
    effortResolution: {
      id: null,
      display: null,
      source: "unavailable",
      confidence: "none",
    },
  });
  assert.equal(unchanged.changed, false);
  assert.equal(fs.statSync(messageFile).mtimeMs, before);
});
