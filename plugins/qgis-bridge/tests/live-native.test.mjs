import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("real QGIS 4.2.0 canary adds and styles a layer, renders a layout, and restores exact bytes", { timeout: 300_000 }, () => {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "live-canary.mjs")], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 290_000 });
  const result = JSON.parse(output); assert.equal(result.status, "passed"); assert.equal(result.application, "4.2.0"); assert.equal(result.versionInt, 40200); assert.equal(result.preSha256, result.restoredSha256); assert.ok(result.png.bytes > 0);
});

