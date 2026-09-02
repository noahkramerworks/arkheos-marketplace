import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportArtifact, validateTransaction } from "../mcp/operations.mjs";
import { checkpoint, restoreCheckpoint, revision } from "../mcp/state.mjs";

function valid() { return { projectFile: "C:\\fixture.blend", transactionId: "fixture:1", expectedRevision: `sha256:${"a".repeat(64)}`, actions: [{ type: "ensure_collection", name: "Fixture" }] }; }
test("transaction admission rejects stale-shaped, arbitrary, and oversized input", () => {
  assert.equal(validateTransaction(valid()), true);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ type: "execute_python", code: "x" }] }), /admitted shape/);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ type: "set_transform", object: "x", rnaPath: "hide_viewport" }] }), /admitted shape/);
  const vertices = Array.from({ length: 16000 }, () => [0, 0, 0]); const face = Array.from({ length: 1000 }, (_, index) => index);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ type: "create_mesh", name: "Mesh", dataName: "Data", vertices, faces: [face, face, face] }] }), /50,000/);
  assert.throws(() => validateTransaction({ ...valid(), transactionId: "spaces are rejected" }), /invalid format/);
});
test("pose actions and legacy keyframes enforce semantic bounds", () => {
  const pose = { type: "write_pose_action", armature: "Rig", name: "Walk", frameStart: 1, frameEnd: 20, writeMode: "reject", defaultInterpolation: "BEZIER", keys: [
    { bone: "Root", frame: 1, location: [0, 0, 0], rotationQuaternion: [1, 0, 0, 0], scale: [1, 1, 1] },
    { bone: "Root", frame: 20, location: [0, 0, 1], interpolation: "LINEAR" },
  ] };
  assert.equal(validateTransaction({ ...valid(), actions: [pose] }), true);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ ...pose, keys: [...pose.keys, { bone: "Root", frame: 20, scale: [1, 1, 1] }] }] }), /unique/);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ ...pose, keys: [{ bone: "Root", frame: 21, location: [0, 0, 0] }] }] }), /outside/);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ ...pose, keys: [{ bone: "Root", frame: 1, rotationQuaternion: [1, 1, 0, 0] }] }] }), /unit length/);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ ...pose, keys: [{ bone: "Root", frame: 1, scale: [1, 0, 1] }] }] }), /admitted shape/);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ type: "insert_keyframe", object: "Cube", frame: 1, property: "hide_viewport" }] }), /admitted shape/);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ type: "insert_keyframe", object: "Cube", frame: 1, property: "location", index: 3 }] }), /invalid for location/);
});
test("GLB extras remain format-scoped", async () => {
  await assert.rejects(() => exportArtifact({ projectFile: "C:\\fixture.blend", expectedRevision: `sha256:${"a".repeat(64)}`, outputPath: "C:\\fixture.usd", format: "usd", options: { extras: true } }, { stateRoot: "C:\\state" }), /only for GLB/);
});
test("checkpoint restores exact bytes and external targets", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "blender-checkpoint-")); const state = path.join(base, "state"); const project = path.join(base, "fixture.blend"); const external = path.join(base, "texture.bin"); writeFileSync(project, "initial-blend"); writeFileSync(external, "initial-texture"); const before = revision(project); const cp = checkpoint(state, project, [external], "fixture"); writeFileSync(project, "changed"); writeFileSync(external, "changed"); restoreCheckpoint(state, cp.checkpointId); assert.equal(revision(project), before); assert.equal(readFileSync(external, "utf8"), "initial-texture");
});
