import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("real Krita 5.3.3 canary creates and translates a paint layer, exports PNG, and restores exact bytes", { timeout: 300_000 }, () => {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "live-canary.mjs")], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 290_000 });
  const result = JSON.parse(output); assert.equal(result.status, "passed"); assert.match(result.application, /^5\.3\.3/); assert.equal(result.apiVersion, "PyKrita 5.3.3"); assert.equal(result.preSha256, result.restoredSha256); assert.equal(result.exactBytes, true); assert.ok(result.export.bytes > 0);
});
