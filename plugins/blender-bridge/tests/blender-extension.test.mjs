import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blender = process.env.BLENDER_ENGINE_PATH || "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe";
test("Blender validates the native extension manifest", () => { const result = spawnSync(blender, ["--command", "extension", "validate"], { cwd: path.join(root, "blender-extension"), encoding: "utf8", timeout: 60000 }); assert.equal(result.status, 0, result.stderr || result.stdout); assert.match(result.stdout + result.stderr, /Success parsing TOML/); });
