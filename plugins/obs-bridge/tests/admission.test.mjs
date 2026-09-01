import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyScenePlan, inspectObs, rollbackReceipt } from "../mcp/operations.mjs";
import { TOOLS } from "../mcp/server.mjs";
import { MockObs } from "./mock-obs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = JSON.parse(readFileSync(path.join(root, "bridge", "profile.json"), "utf8"));

function fixture(t) {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "obs-bridge-admission-"));
  t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  const mock = new MockObs();
  return {
    options: {
      stateRoot,
      env: { CODEX_HOME: stateRoot, OBS_WEBSOCKET_PASSWORD: "never-persisted" },
      clientFactory: () => mock,
    },
  };
}

test("profile admits one official version-bound native protocol with typed read, write, readback, and rollback", () => {
  assert.equal(profile.schema, "bridge-profile/v1.2");
  assert.equal(profile.pluginVersion, "0.2.1");
  assert.equal(profile.controlSurface.kind, "native-protocol");
  assert.equal(profile.controlSurface.authority, "OBS Studio bundled obs-websocket protocol");
  assert.equal(profile.controlSurface.version, "OBS Studio 32.2.1 / obs-websocket 5.7.4 / RPC 1");
  assert.ok(profile.controlSurface.typedReads.length > 0);
  assert.ok(profile.controlSurface.typedWrites.length > 0);
  assert.equal(profile.controlSurface.independentReadback, true);
  assert.equal(profile.controlSurface.exactRollback, true);
  assert.equal(profile.certificationTiers[0], "api-contract-admission");
  for (const field of ["controllerOnly", "uiAutomation", "screenScraping", "rawPassthrough", "exportOnly"]) {
    assert.equal(profile.controlSurface[field], false, `${field} must remain rejected`);
  }
  for (const artifact of [...profile.application.identityArtifacts, ...profile.controlSurface.contractArtifacts]) {
    assert.equal(existsSync(artifact.path), true, artifact.label);
    assert.ok(statSync(artifact.path).size > 0, artifact.label);
  }
});

test("tool boundary is closed and excludes raw code, commands, payloads, credentials, and paths", () => {
  assert.deepEqual(TOOLS.map((tool) => tool.name), ["inspect", "apply_scene_plan", "rollback_receipt"]);
  const serialized = JSON.stringify(TOOLS);
  for (const forbidden of ["raw_rpc", "shell", "command", "code", "script", "password", "credential", "path", "requestType", "requestData"]) {
    assert.doesNotMatch(serialized, new RegExp(`\\b${forbidden}\\b`, "i"), forbidden);
  }
  for (const tool of TOOLS) assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
});

test("typed write is independently observed and exact receipt rollback restores the admitted state", async (t) => {
  const fx = fixture(t);
  const before = await inspectObs({}, fx.options);
  const applied = await applyScenePlan({
    planId: "api-admission-fixture",
    actions: [
      { type: "ensure_scene", sceneName: "Admission Fixture" },
      {
        type: "ensure_input",
        sceneName: "Admission Fixture",
        inputName: "Admission Color",
        inputKind: "color_source_v3",
        inputSettings: { color: 4278255360, width: 320, height: 240 },
        sceneItemEnabled: true,
      },
    ],
  }, fx.options);
  assert.equal(applied.status, "verified");
  assert.equal(applied.pluginVersion, "0.2.1");

  const changed = await inspectObs({}, fx.options);
  assert.equal(changed.scenes.some((scene) => scene.sceneName === "Admission Fixture"), true);
  assert.equal(changed.inputs.some((input) => input.inputName === "Admission Color"), true);

  const rollback = await rollbackReceipt({ receiptId: applied.receiptId }, fx.options);
  assert.equal(rollback.status, "rolled-back");
  assert.equal(rollback.rollback.status, "verified-restored");
  const restored = await inspectObs({}, fx.options);
  assert.deepEqual(restored.scenes, before.scenes);
  assert.deepEqual(restored.inputs, before.inputs);
  assert.deepEqual(restored.videoSettings, before.videoSettings);
});
