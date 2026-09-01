import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyTransaction, rollbackReceipt, setupBridge } from "../mcp/operations.mjs";
import { sha256 } from "../mcp/state.mjs";

const identity = { ok: true, applicationVersion: "5.3.3", applicationName: "5.3.3", versionInt: 50303, bridgeVersion: "0.1.0", apiVersion: "PyKrita 5.3.3" };
test("sealed transaction receipt restores exact document bytes", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "krita-workflow-")); const stateRoot = path.join(temp, "state"); const documentPath = path.join(temp, "fixture.kra"); const pre = Buffer.from("krita-pre"); writeFileSync(documentPath, pre);
  let phase = "before"; const revision = (name) => `sha256:${sha256(Buffer.from(name))}`;
  const coordinator = { dispatch: async (operation) => {
    if (operation === "apply") { phase = "after"; writeFileSync(documentPath, "krita-post"); }
    if (operation === "reload") phase = "before";
    const bytes = readFileSync(documentPath); return { ...identity, document: { path: documentPath, sha256: sha256(bytes), name: "Fixture", width: 320, height: 200, colorModel: "RGBA", colorDepth: "U8", colorProfile: "sRGB" }, dirty: false, revision: revision(phase), layers: phase === "after" ? [{ name: "ArkheOS_Test", owned: true }] : [] };
  } };
  try {
    const runtime = { stateRoot, coordinator }; await setupBridge({ action: "enroll_root", rootPath: temp }, runtime);
    const applied = await applyTransaction({ documentPath, expectedRevision: revision("before"), actions: [{ type: "create_paint_layer", name: "ArkheOS_Test" }] }, runtime);
    assert.equal(applied.observation.layers[0].owned, true);
    const rolled = await rollbackReceipt({ receiptId: applied.receiptId }, runtime); assert.equal(rolled.exactBytes, true); assert.equal(sha256(readFileSync(documentPath)), sha256(pre));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
