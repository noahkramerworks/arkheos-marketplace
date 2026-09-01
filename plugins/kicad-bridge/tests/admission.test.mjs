import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTransaction } from "../mcp/operations.mjs";
import { TOOLS } from "../mcp/server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("profile binds KiCad 10.0.5 to the complete v1.2 API gate", () => {
  const profile = JSON.parse(readFileSync(path.join(root, "bridge", "profile.json"), "utf8")); assert.equal(profile.schema, "bridge-profile/v1.2"); assert.equal(profile.controlSurface.kind, "documented-application-api"); assert.equal(profile.controlSurface.exposure, "direct-native-endpoint"); assert.match(profile.controlSurface.version, /10\.0\.5.*0\.7\.1/);
  assert.ok(profile.controlSurface.typedReads.length); assert.ok(profile.controlSurface.typedWrites.length); assert.equal(profile.controlSurface.independentReadback, true); assert.equal(profile.controlSurface.exactRollback, true);
  for (const key of ["controllerOnly", "uiAutomation", "screenScraping", "rawPassthrough", "exportOnly"]) assert.equal(profile.controlSurface[key], false, key);
  assert.equal(profile.certificationTiers[0], "api-contract-admission"); assert.deepEqual(profile.release.targets.map((item) => item.selector), ["kicad-bridge@personal", "kicad-bridge@arkheos"]);
  for (const artifact of [...profile.application.identityArtifacts, ...profile.controlSurface.contractArtifacts]) assert.equal(existsSync(artifact.path), true, artifact.path);
});
test("tool schemas and runtime reject raw execution and extra fields", async () => {
  assert.equal(TOOLS.length, 6); for (const tool of TOOLS) assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
  const schemas = JSON.stringify(TOOLS.map((tool) => tool.inputSchema)).toLowerCase(); for (const blocked of ["script", "code", "command", "shell", "payload", "raw_rpc", "python"]) assert.equal(schemas.includes(`\"${blocked}\"`), false, blocked);
  await assert.rejects(() => applyTransaction({ boardPath: "C:\\fixture.kicad_pcb", expectedRevision: `sha256:${"0".repeat(64)}`, actions: [{ type: "set_title", title: "Proof", code: "x" }] }, { stateRoot: path.join(root, ".state") }), /forbidden|unsupported fields/);
  const client = readFileSync(path.join(root, "kicad-adapter", "adapter", "client.py"), "utf8"); assert.equal(/\beval\s*\(|\bexec\s*\(|subprocess|os\.system/.test(client), false);
});
