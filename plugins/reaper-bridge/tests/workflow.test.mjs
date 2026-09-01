import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyTransaction } from "../mcp/operations.mjs";

const identity = { applicationVersion: "7.79", bridgeVersion: "0.2.0", apiVersion: "0x20E", sdkCommit: "490ded57668727fba21482fabc50ba9853a457bb" };

test("transactions stop closed on dirty or stale native observations", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "reaper-bridge-workflow-")); const projectPath = path.join(temp, "fixture.rpp"); writeFileSync(projectPath, "fixture");
  const dirty = { stateRoot: temp, coordinator: { dispatch: async () => ({ ok: true, ...identity, dirty: true, projectPath, revision: 3 }) } };
  await assert.rejects(() => applyTransaction({ projectPath, expectedRevision: 3, actions: [{ type: "create_track", index: 0 }] }, dirty), /dirty/);
  const stale = { stateRoot: temp, coordinator: { dispatch: async () => ({ ok: true, ...identity, dirty: false, projectPath, revision: 4 }) } };
  await assert.rejects(() => applyTransaction({ projectPath, expectedRevision: 3, actions: [{ type: "create_track", index: 0 }] }, stale), /Stale revision/);
  await assert.rejects(() => applyTransaction({ projectPath, expectedRevision: 4, actions: [{ type: "add_stock_fx", index: 0, fx: "ForeignPlugin" }] }, stale), /stock FX/);
  await assert.rejects(() => applyTransaction({ projectPath, expectedRevision: 4, actions: [{ type: "create_track", index: 0, command: "40001" }] }, stale), /Unsupported action fields/);
  rmSync(temp, { recursive: true, force: true });
});
