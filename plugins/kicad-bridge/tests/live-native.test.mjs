import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("real KiCad 10.0.5 canary proves IPC, save, export, and exact rollback", { timeout: 300_000 }, () => {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "live-canary.mjs")], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 300_000 }); const result = JSON.parse(output); assert.equal(result.status, "passed"); assert.equal(result.application.version, "10.0.5"); assert.equal(result.preSha256, result.restoredSha256); assert.ok(result.render.bytes > 100);
});
