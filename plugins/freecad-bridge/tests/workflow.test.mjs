import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyTransaction, rollbackReceipt, setupBridge } from "../mcp/operations.mjs";
import { sha256 } from "../mcp/state.mjs";

const identity = { ok: true, applicationVersion: "1.1.3", bridgeVersion: "0.1.0", apiVersion: "FreeCAD Python API 1.1.3", buildRevision: "20260725 (fixture)" };
test("sealed transaction receipt restores exact document bytes", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "freecad-workflow-")); const stateRoot = path.join(temp, "state"); const documentPath = path.join(temp, "fixture.FCStd"); const pre = Buffer.from("freecad-pre"); writeFileSync(documentPath, pre);
  let phase = "before"; const revision = (name) => `sha256:${sha256(Buffer.from(name))}`;
  const coordinator = { dispatch: async (operation) => {
    if (operation === "apply") { phase = "after"; writeFileSync(documentPath, "freecad-post"); }
    if (operation === "reload") phase = "before";
    const bytes = readFileSync(documentPath); return { ...identity, document: { path: documentPath, sha256: sha256(bytes) }, dirty: false, revision: revision(phase), features: [{ name: "ArkheOS_Box", owned: true, dimensions: { Length: phase === "before" ? 10 : 24 } }] };
  } };
  try {
    const runtime = { stateRoot, coordinator }; await setupBridge({ action: "enroll_root", rootPath: temp }, runtime);
    const applied = await applyTransaction({ documentPath, expectedRevision: revision("before"), actions: [{ type: "set_dimension", objectName: "ArkheOS_Box", property: "Length", value: 24 }] }, runtime);
    assert.equal(applied.observation.features[0].dimensions.Length, 24);
    const rolled = await rollbackReceipt({ receiptId: applied.receiptId }, runtime); assert.equal(rolled.exactBytes, true); assert.equal(sha256(readFileSync(documentPath)), sha256(pre));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
