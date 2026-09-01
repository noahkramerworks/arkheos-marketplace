import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyTransaction, rollbackReceipt, setupBridge } from "../mcp/operations.mjs";
import { sha256 } from "../mcp/state.mjs";

const identity = { ok: true, applicationVersion: "4.2.0", applicationName: "4.2.0-Belém do Pará", versionInt: 40200, bridgeVersion: "0.1.0", apiVersion: "PyQGIS 4.2.0 / 40200" };
test("sealed transaction receipt restores exact project bytes", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "qgis-workflow-")); const stateRoot = path.join(temp, "state"); const projectPath = path.join(temp, "fixture.qgs"); const pre = Buffer.from("qgis-pre"); writeFileSync(projectPath, pre);
  let phase = "before"; const revision = (name) => `sha256:${sha256(Buffer.from(name))}`;
  const coordinator = { dispatch: async (operation) => {
    if (operation === "apply") { phase = "after"; writeFileSync(projectPath, "qgis-post"); }
    if (operation === "reload") phase = "before";
    const bytes = readFileSync(projectPath); return { ...identity, project: { path: projectPath, sha256: sha256(bytes), title: "Fixture" }, dirty: false, revision: revision(phase), crs: "EPSG:4326", layers: [], layouts: phase === "after" ? ["ArkheOS_Map"] : [] };
  } };
  try {
    const runtime = { stateRoot, coordinator }; await setupBridge({ action: "enroll_root", rootPath: temp }, runtime);
    const applied = await applyTransaction({ projectPath, expectedRevision: revision("before"), actions: [{ type: "ensure_layout", name: "ArkheOS_Map" }] }, runtime);
    assert.deepEqual(applied.observation.layouts, ["ArkheOS_Map"]);
    const rolled = await rollbackReceipt({ receiptId: applied.receiptId }, runtime); assert.equal(rolled.exactBytes, true); assert.equal(sha256(readFileSync(projectPath)), sha256(pre));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

