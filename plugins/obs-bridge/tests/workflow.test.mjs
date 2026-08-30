import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyScenePlan, inspectObs, rollbackReceipt } from "../mcp/operations.mjs";
import { MockObs } from "./mock-obs.mjs";

function fixture(t, options = {}) {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "obs-bridge-test-"));
  t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  const mock = new MockObs(options);
  return { stateRoot, mock, options: { stateRoot, env: { CODEX_HOME: stateRoot, OBS_WEBSOCKET_PASSWORD: "not-persisted" }, clientFactory: () => mock } };
}

const plan = {
  planId: "vertical-shell-primitives",
  actions: [
    { type: "ensure_scene", sceneName: "Bridge Canary" },
    { type: "ensure_input", sceneName: "Bridge Canary", inputName: "Bridge Color", inputKind: "color_source_v3", inputSettings: { color: 4278255360, width: 1080, height: 1920 }, sceneItemEnabled: true },
  ],
};

test("inspect records bounded native observations without secrets", async (t) => {
  const fx = fixture(t);
  const result = await inspectObs({}, fx.options);
  assert.equal(result.status, "observed");
  assert.equal(result.version.obsVersion, "32.2.1");
  const enrollment = readFileSync(path.join(fx.stateRoot, "enrollment.json"), "utf8");
  assert.doesNotMatch(enrollment, /not-persisted/);
  assert.match(enrollment, /ws:\/\/127\.0\.0\.1:4455/);
});

test("apply verifies resources, persists a receipt, and reuses matching state", async (t) => {
  const fx = fixture(t);
  const first = await applyScenePlan(plan, fx.options);
  assert.equal(first.status, "verified");
  assert.deepEqual(first.created.map((item) => item.type), ["scene", "input"]);
  assert.ok(existsSync(path.join(fx.stateRoot, "receipts", `${first.receiptId.slice(7)}.json`)));
  const second = await applyScenePlan(plan, fx.options);
  assert.equal(second.status, "verified");
  assert.equal(second.created.length, 0);
  assert.deepEqual(second.reused.map((item) => item.type), ["scene", "input"]);
});

test("readback failure rolls back only current resources", async (t) => {
  const fx = fixture(t, { hideCreatedInput: true });
  const result = await applyScenePlan(plan, fx.options);
  assert.equal(result.status, "rolled-back");
  assert.equal(result.rollback.status, "rolled-back");
  assert.deepEqual(fx.mock.scenes.map((scene) => scene.sceneName), ["Existing"]);
  assert.equal(fx.mock.inputs.length, 0);
});

test("explicit rollback is verified and idempotent across repeated effects", async (t) => {
  const fx = fixture(t);
  const applied = await applyScenePlan(plan, fx.options);
  const rolledBack = await rollbackReceipt({ receiptId: applied.receiptId }, fx.options);
  assert.equal(rolledBack.status, "rolled-back");
  assert.deepEqual(fx.mock.scenes.map((scene) => scene.sceneName), ["Existing"]);
  assert.equal(fx.mock.inputs.length, 0);
  const repeated = await rollbackReceipt({ receiptId: applied.receiptId }, fx.options);
  assert.equal(repeated.status, "rolled-back");
  assert.ok(repeated.effects.every((step) => step.status === "already-absent"));
});

test("rollback refuses to delete a created scene after foreign state appears", async (t) => {
  const fx = fixture(t);
  const applied = await applyScenePlan({ planId: "scene-only", actions: [{ type: "ensure_scene", sceneName: "Owned Scene" }] }, fx.options);
  fx.mock.inputs.push({ inputName: "Foreign", inputUuid: "foreign", inputKind: "image_source", unversionedInputKind: "image_source" });
  fx.mock.sceneItems.get("Owned Scene").push({ sourceName: "Foreign", inputKind: "image_source" });
  const result = await rollbackReceipt({ receiptId: applied.receiptId }, fx.options);
  assert.equal(result.status, "manual-recovery-required");
  assert.ok(fx.mock.scenes.some((scene) => scene.sceneName === "Owned Scene"));
});

test("plans reject credentials, unknown actions, duplicates, and type conflicts before mutation", async (t) => {
  const fx = fixture(t);
  await assert.rejects(applyScenePlan({ ...plan, password: "no" }, fx.options), /unknown field: password/);
  await assert.rejects(applyScenePlan({ planId: "x", actions: [{ type: "raw_rpc" }] }, fx.options), /unsupported/);
  await assert.rejects(applyScenePlan({ planId: "x", actions: [{ type: "ensure_scene", sceneName: "A" }, { type: "ensure_scene", sceneName: "A" }] }, fx.options), /duplicate/);
  fx.mock.inputs.push({ inputName: "Conflict", inputUuid: "conflict", inputKind: "image_source", unversionedInputKind: "image_source" });
  fx.mock.sceneItems.get("Existing").push({ sourceName: "Conflict", inputKind: "image_source" });
  const conflict = await applyScenePlan({ planId: "x", actions: [{ type: "ensure_input", sceneName: "Existing", inputName: "Conflict", inputKind: "browser_source", inputSettings: {}, sceneItemEnabled: true }] }, fx.options);
  assert.equal(conflict.status, "rolled-back");
  assert.equal(conflict.created.length, 0);
});
