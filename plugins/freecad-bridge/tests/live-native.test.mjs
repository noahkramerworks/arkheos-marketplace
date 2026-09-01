import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("real FreeCAD 1.1.3 canary changes a parametric feature, exports STEP/STL, and restores exact bytes", { timeout: 300_000 }, () => {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "live-canary.mjs")], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 290_000 });
  const result = JSON.parse(output); assert.equal(result.status, "passed"); assert.equal(result.application, "1.1.3"); assert.equal(result.preSha256, result.restoredSha256); assert.ok(result.step.bytes > 0); assert.ok(result.stl.bytes > 0);
});
