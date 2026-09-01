import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Coordinator } from "../mcp/coordinator.mjs";
import { applyTransaction, closeOwnedEditor, enrollProject, inspectProject, openProject, rollbackReceipt, unenrollProject } from "../mcp/operations.mjs";
import { projectRevision, stableStringify } from "../mcp/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enginePath = "C:\\Users\\rizek\\Documents\\Codex\\2026-07-31\\ch\\work\\toolchains\\godot-4.7.1\\Godot_v4.7.1-stable_win64_console.exe";
const driverPath = path.join(root, "tests", "api_admission_driver.gd");

function digest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex");
}

function nativeReadback(projectRoot) {
  const result = spawnSync(enginePath, ["--headless", "--path", projectRoot, "--script", driverPath, "--", "res://admission.tscn"], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const line = `${result.stdout}\n${result.stderr}`.split(/\r?\n/).find((item) => item.startsWith("GODOT_BRIDGE_ADMISSION:"));
  assert.ok(line, `Missing fixed native observation: ${result.stdout}\n${result.stderr}`);
  return JSON.parse(line.slice("GODOT_BRIDGE_ADMISSION:".length));
}

const base = mkdtempSync(path.join(tmpdir(), "godot-bridge-admission-"));
const projectRoot = path.join(base, "project");
const stateRoot = path.join(base, "state");
cpSync(path.join(root, "tests", "fixture-project"), projectRoot, { recursive: true });
const originalProject = readFileSync(path.join(projectRoot, "project.godot"));
const coordinator = new Coordinator({ stateRoot, timeoutMs: 30_000 });
const runtime = { stateRoot, coordinator, runProjects: new Map(), env: process.env };

try {
  await coordinator.start();
  const engine = (await enrollProject({ projectRoot, enginePath }, runtime)).enrollment.engine;
  const preRevision = projectRevision(projectRoot);
  await openProject({ projectRoot, mode: "headless" }, runtime);
  const deadline = Date.now() + 20_000;
  while (!coordinator.isConnected(projectRoot) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(coordinator.isConnected(projectRoot), true, "Godot admission addon did not connect");
  const before = await inspectProject({ projectRoot }, runtime);
  assert.equal(before.connected, true);

  const receipt = await applyTransaction({
    projectRoot,
    transactionId: "api-admission-scene-write",
    expectedRevision: before.revision,
    scenePath: "res://admission.tscn",
    actions: [
      { type: "scene.create", path: "res://admission.tscn", rootType: "Node2D", rootName: "AdmissionRoot", alias: "Root" },
      { type: "node.create", parent: { $type: "Alias", alias: "Root" }, nodeType: "Node2D", name: "Marker", alias: "Marker" },
      { type: "node.set_property", target: { $type: "Alias", alias: "Marker" }, property: "position", value: { $type: "Vector2", value: [42, 24] } },
      { type: "scene.save" },
    ],
  }, runtime);
  assert.equal(receipt.status, "verified", JSON.stringify(receipt));
  assert.notEqual(receipt.postRevision, receipt.preRevision);
  await closeOwnedEditor({ projectRoot }, runtime);

  const changedObservation = nativeReadback(projectRoot);
  assert.deepEqual(changedObservation, {
    exists: true,
    loadable: true,
    markerName: "Marker",
    markerPosition: [42, 24],
    markerType: "Node2D",
    rootName: "AdmissionRoot",
    rootType: "Node2D",
    scenePath: "res://admission.tscn",
  });

  const rolled = await rollbackReceipt({ receiptId: receipt.receiptId }, runtime);
  assert.equal(rolled.status, "rolled-back", JSON.stringify(rolled));
  const restoredObservation = nativeReadback(projectRoot);
  assert.deepEqual(restoredObservation, { exists: false, scenePath: "res://admission.tscn" });
  const restoredRevision = projectRevision(projectRoot);
  assert.equal(restoredRevision, preRevision);

  const unenrolled = await unenrollProject({ projectRoot }, runtime);
  assert.equal(unenrolled.status, "unenrolled");
  assert.deepEqual(readFileSync(path.join(projectRoot, "project.godot")), originalProject);

  console.log(JSON.stringify({
    schema: "godot-bridge/api-admission/v1",
    status: "admitted",
    application: { version: engine.version, executable: engine.enginePath, sha256: engine.sha256 },
    controlSurface: "Godot Engine 4.7 EditorPlugin and EditorInterface APIs",
    readProbe: { capability: "inspect-project-state", observationDigest: digest(before) },
    writeProbe: { capability: "apply-project-transaction", receiptId: receipt.receiptId, observationDigest: digest(changedObservation) },
    independentObservationDigest: digest(changedObservation),
    exactRollback: { preSha256: preRevision.slice(7), restoredSha256: restoredRevision.slice(7), observationDigest: digest(restoredObservation) },
    weakBoundaryFlags: { controllerOnly: false, uiAutomation: false, screenScraping: false, rawPassthrough: false, exportOnly: false },
  }, null, 2));
} finally {
  try { await closeOwnedEditor({ projectRoot }, runtime); } catch {}
  await coordinator.close();
  rmSync(base, { recursive: true, force: true });
}
