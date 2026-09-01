#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Coordinator } from "../mcp/coordinator.mjs";
import { applyTransaction, exportArtifact, inspectDocument, rollbackReceipt, runtime as baseRuntime, setupBridge } from "../mcp/operations.mjs";
import { fileSha256, waitFor } from "../mcp/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const freecadCmd = process.env.FREECAD_CMD_EXE || "C:\\Program Files\\FreeCAD 1.1\\bin\\FreeCADCmd.exe";
const temp = mkdtempSync(path.join(os.tmpdir(), "freecad-bridge-canary-"));
const documentPath = path.join(temp, "fixture.FCStd");
const coordinator = new Coordinator({ stateRoot: baseRuntime.stateRoot, timeoutMs: 60_000 });
const runtime = { ...baseRuntime, coordinator };
let launched = false;

try {
  execFileSync(freecadCmd, [path.join(root, "fixtures", "create_fixture.py")], { encoding: "utf8", windowsHide: true, timeout: 60_000, env: { ...process.env, ARKHEOS_FREECAD_FIXTURE: documentPath } });
  const preSha256 = fileSha256(documentPath);
  await coordinator.start();
  await setupBridge({ action: "install_extension" }, runtime);
  await setupBridge({ action: "enroll_root", rootPath: temp }, runtime);
  const processResult = await setupBridge({ action: "launch_document", documentPath }, runtime); launched = true;
  await waitFor(() => coordinator.connection(), 60_000, 250);
  const before = await inspectDocument({}, runtime);
  if (before.document?.sha256 !== preSha256 || before.dirty) throw new Error("initial native fixture observation is not exact and clean");
  const applied = await applyTransaction({ documentPath, expectedRevision: before.revision, actions: [{ type: "set_dimension", objectName: "ArkheOS_Box", property: "Length", value: 24 }] }, runtime);
  if (applied.observation.features.find((item) => item.name === "ArkheOS_Box")?.dimensions?.Length !== 24) throw new Error("native parametric readback failed");
  const step = await exportArtifact({ documentPath, expectedRevision: applied.observation.revision, format: "step" }, runtime);
  const stl = await exportArtifact({ documentPath, expectedRevision: applied.observation.revision, format: "stl" }, runtime);
  const rolled = await rollbackReceipt({ receiptId: applied.receiptId }, runtime);
  if (!rolled.exactBytes || rolled.restoredSha256 !== preSha256 || fileSha256(documentPath) !== preSha256) throw new Error("exact native restoration failed");
  await setupBridge({ action: "close_owned_process" }, runtime); launched = false;
  const result = { status: "passed", application: before.applicationVersion, buildRevision: before.buildRevision, pid: processResult.pid, documentPath, preSha256, postSha256: applied.readback.documentSha256, receiptId: applied.receiptId, restoredSha256: rolled.restoredSha256, step: { path: step.outputPath, sha256: step.sha256, bytes: step.bytes }, stl: { path: stl.outputPath, sha256: stl.sha256, bytes: stl.bytes } };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  if (launched) {
    try { await setupBridge({ action: "close_owned_process" }, runtime); } catch {}
  }
  await coordinator.close();
  try { rmSync(temp, { recursive: true, force: true }); } catch {}
}
