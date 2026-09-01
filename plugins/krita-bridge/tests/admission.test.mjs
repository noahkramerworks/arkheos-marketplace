import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTransaction } from "../mcp/operations.mjs";
import { TOOLS } from "../mcp/server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("profile binds Krita 5.3.3 to the complete v1.2 API gate", () => {
  const profile = JSON.parse(readFileSync(path.join(root, "bridge", "profile.json"), "utf8"));
  assert.equal(profile.schema, "bridge-profile/v1.2"); assert.equal(profile.controlSurface.kind, "documented-application-api"); assert.match(profile.controlSurface.version, /PyKrita 5\.3\.3/);
  assert.ok(profile.controlSurface.typedReads.length); assert.ok(profile.controlSurface.typedWrites.length); assert.equal(profile.controlSurface.independentReadback, true); assert.equal(profile.controlSurface.exactRollback, true);
  for (const key of ["controllerOnly", "uiAutomation", "screenScraping", "rawPassthrough", "exportOnly"]) assert.equal(profile.controlSurface[key], false, key);
  assert.equal(profile.certificationTiers[0], "api-contract-admission"); assert.deepEqual(profile.release.targets.map((item) => item.selector), ["krita-bridge@personal", "krita-bridge@arkheos"]);
  for (const artifact of [...profile.application.identityArtifacts, ...profile.controlSurface.contractArtifacts]) assert.equal(existsSync(artifact.path), true, artifact.path);
});
test("tool schemas and runtime reject raw execution and extra fields", async () => {
  assert.equal(TOOLS.length, 6); for (const tool of TOOLS) assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
  const schemas = JSON.stringify(TOOLS.map((tool) => tool.inputSchema)).toLowerCase();
  for (const blocked of ["script", "code", "command", "shell", "payload", "filter", "actionid", "rawpixels", "raw_rpc"]) assert.equal(schemas.includes(`\"${blocked}\"`), false, blocked);
  await assert.rejects(() => applyTransaction({ documentPath: "C:\\Users\\rizek\\Documents\\x.kra", expectedRevision: `sha256:${"0".repeat(64)}`, actions: [{ type: "create_paint_layer", name: "ArkheOS_Test", code: "x" }] }, { stateRoot: path.join(root, ".state"), coordinator: { dispatch: async () => { throw new Error("unexpected dispatch"); } } }), /forbidden|unsupported fields/);
  const source = readFileSync(path.join(root, "krita-extension", "adapter", "extension.py"), "utf8");
  assert.equal(/\b(?:eval|exec)\s*\(|subprocess|os\.system|\.(?:trigger|action)\s*\(/.test(source), false);
});
