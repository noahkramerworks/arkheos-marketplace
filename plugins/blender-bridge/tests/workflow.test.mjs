import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateTransaction } from "../mcp/operations.mjs";
import { checkpoint, restoreCheckpoint, revision } from "../mcp/state.mjs";

function valid() { return { projectFile: "C:\\fixture.blend", transactionId: "fixture:1", expectedRevision: `sha256:${"a".repeat(64)}`, actions: [{ type: "ensure_collection", name: "Fixture" }] }; }
test("transaction admission rejects stale-shaped, arbitrary, and oversized input", () => {
  assert.equal(validateTransaction(valid()), true);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ type: "execute_python", code: "x" }] }), /Unsupported action/);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ type: "set_transform", object: "x", rnaPath: "hide_viewport" }] }), /Forbidden action field/);
  assert.throws(() => validateTransaction({ ...valid(), actions: [{ type: "create_mesh", vertices: Array.from({ length: 17000 }, () => [0, 0, 0]) }] }), /50,000/);
  assert.throws(() => validateTransaction({ ...valid(), transactionId: "spaces are rejected" }), /transactionId/);
});
test("checkpoint restores exact bytes and external targets", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "blender-checkpoint-")); const state = path.join(base, "state"); const project = path.join(base, "fixture.blend"); const external = path.join(base, "texture.bin"); writeFileSync(project, "initial-blend"); writeFileSync(external, "initial-texture"); const before = revision(project); const cp = checkpoint(state, project, [external], "fixture"); writeFileSync(project, "changed"); writeFileSync(external, "changed"); restoreCheckpoint(state, cp.checkpointId); assert.equal(revision(project), before); assert.equal(readFileSync(external, "utf8"), "initial-texture");
});
