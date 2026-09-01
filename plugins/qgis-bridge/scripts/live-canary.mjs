#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Coordinator } from "../mcp/coordinator.mjs";
import { applyTransaction, exportArtifact, QGIS_PYTHON, qgisEnvironment, rollbackReceipt, runtime as baseRuntime, setupBridge } from "../mcp/operations.mjs";
import { fileSha256, waitFor } from "../mcp/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); const temp = mkdtempSync(path.join(os.tmpdir(), "qgis-bridge-canary-"));
const projectPath = path.join(temp, "fixture.qgs"); const geoJsonPath = path.join(temp, "layer.geojson"); const coordinator = new Coordinator({ stateRoot: baseRuntime.stateRoot, timeoutMs: 60_000 }); const runtime = { ...baseRuntime, coordinator }; let launched = false;
try {
  await coordinator.start(); await setupBridge({ action: "install_extension" }, runtime); const installedAdapter = path.join(baseRuntime.stateRoot, "profile", "python", "plugins", "arkheos_qgis_bridge", "extension.py");
  execFileSync(QGIS_PYTHON, [installedAdapter, "--create-fixture", projectPath], { encoding: "utf8", windowsHide: true, timeout: 60_000, env: qgisEnvironment() }); copyFileSync(path.join(root, "fixtures", "layer.geojson"), geoJsonPath);
  const preSha256 = fileSha256(projectPath); await setupBridge({ action: "enroll_root", rootPath: temp }, runtime); const processResult = await setupBridge({ action: "launch_project", projectPath }, runtime); launched = true;
  await waitFor(() => coordinator.connection(), 60_000, 200); const before = processResult.observation;
  if (before.project.sha256 !== preSha256 || before.dirty || before.layers.length || before.layouts.length) throw new Error("initial native fixture observation is not exact and clean");
  const applied = await applyTransaction({ projectPath, expectedRevision: before.revision, actions: [
    { type: "add_geojson_layer", sourcePath: geoJsonPath, name: "ArkheOS Transit" },
    { type: "set_single_symbol", layerId: "@last_created", color: "#A8E10C", width: 1.2 },
    { type: "ensure_layout", name: "ArkheOS_Proof" }
  ] }, runtime);
  const layer = applied.observation.layers.find((item) => item.owned); if (!layer || layer.renderer.color.toUpperCase() !== "#A8E10C" || !applied.observation.layouts.includes("ArkheOS_Proof")) throw new Error("native layer/style/layout readback failed");
  const png = await exportArtifact({ projectPath, expectedRevision: applied.observation.revision, layoutName: "ArkheOS_Proof", format: "png" }, runtime);
  const rolled = await rollbackReceipt({ receiptId: applied.receiptId }, runtime); if (!rolled.exactBytes || rolled.restoredSha256 !== preSha256 || fileSha256(projectPath) !== preSha256) throw new Error("exact native restoration failed");
  await setupBridge({ action: "close_owned_process" }, runtime); launched = false;
  process.stdout.write(`${JSON.stringify({ status: "passed", application: before.applicationVersion, applicationName: before.applicationName, versionInt: before.versionInt, pid: processResult.pid, projectPath, preSha256, postSha256: applied.readback.projectSha256, receiptId: applied.receiptId, restoredSha256: rolled.restoredSha256, png: { path: png.outputPath, sha256: png.sha256, bytes: png.bytes } }, null, 2)}\n`);
} finally {
  if (launched) { try { await setupBridge({ action: "close_owned_process" }, runtime); } catch {} }
  await coordinator.close(); try { rmSync(temp, { recursive: true, force: true }); } catch {}
}

