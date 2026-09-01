import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../mcp/server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedSkills = ["edit", "export", "index", "inspect", "render", "rollback", "setup"];
const expectedTools = ["inspect_installation", "install_extension", "remove_extension", "enroll_project", "unenroll_project", "open_project", "close_owned_blender", "inspect_project", "apply_transaction", "start_render", "inspect_render", "capture_render", "stop_render", "capture_viewport", "export_artifact", "rollback_receipt"];
test("package shape and identities are exact", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, ".codex-plugin", "plugin.json")));
  assert.equal(manifest.name, "blender-bridge"); assert.equal(manifest.version, "0.2.0"); assert.equal(manifest.license, "GPL-3.0-or-later");
  assert.deepEqual(readdirSync(path.join(root, "skills")).sort(), expectedSkills);
  assert.deepEqual(TOOLS.map((item) => item.name), expectedTools);
  for (const file of ["LICENSE", ".mcp.json", "bridge/profile.json", "references/api-admission.md", "tests/api-admission.mjs", "tests/api_admission_driver.py", "blender-extension/blender_manifest.toml", "blender-extension/bridge_runtime.py", "schemas/transaction.schema.json"]) assert.ok(existsSync(path.join(root, file)), file);
});
test("source exposes no arbitrary execution surface", () => {
  const server = readFileSync(path.join(root, "mcp", "server.mjs"), "utf8");
  assert.doesNotMatch(server, /execute_python|raw_bpy|rna_set|ui_click|driver_expression/);
  const profile = JSON.parse(readFileSync(path.join(root, "bridge", "profile.json")));
  assert.equal(profile.schema, "bridge-profile/v1.2"); assert.equal(profile.adapter, "hybrid-extension-batch"); assert.equal(profile.certificationTiers.length, 6);
  assert.equal(profile.controlSurface.kind, "documented-application-api"); assert.equal(profile.controlSurface.independentReadback, true); assert.equal(profile.controlSurface.exactRollback, true);
  assert.deepEqual(profile.release.targets.map((item) => item.selector), ["blender-bridge@personal", "blender-bridge@arkheos"]);
});
