import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyTransaction, bindRun, captureViewport, closeOwnedEditor, enrollProject, inspectProject, rollbackReceipt, startPlaytest, stopPlaytest, unenrollProject, openProject } from "../mcp/operations.mjs";
import { Coordinator } from "../mcp/coordinator.mjs";
import { projectRevision } from "../mcp/state.mjs";
import { ownedProcess } from "../mcp/godot-process.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enginePath = "C:\\Users\\rizek\\Documents\\Codex\\2026-07-31\\ch\\work\\toolchains\\godot-4.7.1\\Godot_v4.7.1-stable_win64_console.exe";

test("Godot 4.7.1 loads the enrolled EditorPlugin headlessly without parse errors", async (t) => {
  const base = mkdtempSync(path.join(tmpdir(), "godot-bridge-addon-")); const projectRoot = path.join(base, "project"); cpSync(path.join(root, "tests", "fixture-project"), projectRoot, { recursive: true }); t.after(() => rmSync(base, { recursive: true, force: true }));
  await enrollProject({ projectRoot, enginePath }, { stateRoot: path.join(base, "state"), env: process.env });
  const result = spawnSync(enginePath, ["--headless", "--editor", "--path", projectRoot, "--quit-after", "3"], { encoding: "utf8", timeout: 30_000, windowsHide: true, env: { ...process.env, CODEX_HOME: path.join(base, "codex-home") } });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /SCRIPT ERROR|Parse Error|Failed to load script/i);
  assert.match(`${result.stdout}\n${result.stderr}`, /Codex Godot Bridge inactive/);
});

test("live native canary creates, inspects, plays, captures, stops, and rolls back an empty project", { timeout: 120_000 }, async (t) => {
  const base = mkdtempSync(path.join(tmpdir(), "godot-bridge-live-")); const projectRoot = path.join(base, "project"); const stateRoot = path.join(base, "state");
  cpSync(path.join(root, "tests", "fixture-project"), projectRoot, { recursive: true });
  const originalProjectGodot = readFileSync(path.join(projectRoot, "project.godot"));
  const coordinator = new Coordinator({ stateRoot, timeoutMs: 30_000 }); await coordinator.start();
  const runtime = { stateRoot, coordinator, runProjects: new Map(), env: process.env };
  t.after(async () => { try { await closeOwnedEditor({ projectRoot }, runtime); } catch {} await coordinator.close(); rmSync(base, { recursive: true, force: true }); });
  await enrollProject({ projectRoot, enginePath }, runtime);
  let baseline = projectRevision(projectRoot);
  await openProject({ projectRoot, mode: "editor" }, runtime);
  const deadline = Date.now() + 20_000;
  while (!coordinator.isConnected(projectRoot) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(coordinator.isConnected(projectRoot), true, `Godot addon did not connect: ${JSON.stringify(ownedProcess(projectRoot))}`);
  const observed = await inspectProject({ projectRoot }, runtime); assert.equal(observed.connected, true); baseline = observed.revision;
  const assetSource = path.join(base, "seed.svg");
  writeFileSync(assetSource, '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#fff"/></svg>\n');
  const assetReceipt = await applyTransaction({
    projectRoot, transactionId: "live-asset-import", expectedRevision: baseline,
    actions: [{ type: "asset.import", sourcePath: assetSource, targetPath: "res://assets/seed.svg" }],
  }, runtime);
  assert.equal(assetReceipt.status, "verified", JSON.stringify(assetReceipt));
  assert.notEqual(assetReceipt.postRevision, assetReceipt.preRevision);
  assert.equal(assetReceipt.checkpoints[0].postExisted, true);
  assert.match(assetReceipt.checkpoints[0].postSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(readFileSync(path.join(projectRoot, "assets", "seed.svg")), readFileSync(assetSource));
  assert.equal((await rollbackReceipt({ receiptId: assetReceipt.receiptId }, runtime)).status, "rolled-back");
  assert.equal(projectRevision(projectRoot), baseline);
  const receipt = await applyTransaction({
    projectRoot, transactionId: "live-canary", expectedRevision: baseline, scenePath: "res://main.tscn",
    actions: [
      { type: "scene.create", path: "res://main.tscn", rootType: "Node2D", rootName: "Main", alias: "Root" },
      { type: "script.write", path: "res://main.gd", content: "extends Node2D\nfunc _on_timeout() -> void:\n\tpass\n" },
      { type: "script.attach", target: { $type: "Alias", alias: "Root" }, scriptPath: "res://main.gd" },
      { type: "node.create", parent: { $type: "Alias", alias: "Root" }, nodeType: "ColorRect", name: "Backdrop", alias: "Backdrop" },
      { type: "node.set_property", target: { $type: "Alias", alias: "Backdrop" }, property: "color", value: { $type: "Color", value: [0.1, 0.4, 0.8, 1.0] } },
      { type: "node.set_property", target: { $type: "Alias", alias: "Backdrop" }, property: "size", value: { $type: "Vector2", value: [640, 360] } },
      { type: "node.create", parent: { $type: "Alias", alias: "Root" }, nodeType: "Timer", name: "Pulse", alias: "Pulse" },
      { type: "signal.connect", source: { $type: "Alias", alias: "Pulse" }, signal: "timeout", target: { $type: "Alias", alias: "Root" }, method: "_on_timeout" },
      { type: "project.input_action.ensure", name: "move_left", deadzone: 0.5 },
      { type: "scene.save" },
    ],
  }, runtime);
  assert.equal(receipt.status, "verified", JSON.stringify(receipt));
  const after = await inspectProject({ projectRoot }, runtime); assert.equal(after.scene?.tree?.name, "Main");
  const mainSceneBeforeScriptEdit = readFileSync(path.join(projectRoot, "main.tscn"));
  const scriptOnly = await applyTransaction({
    projectRoot, transactionId: "live-script-only", expectedRevision: after.revision, scenePath: "res://main.tscn",
    actions: [{ type: "script.write", path: "res://main.gd", content: "extends Node2D\nfunc _on_timeout() -> void:\n\tpass\n# bridge script-only edit\n" }],
  }, runtime);
  assert.equal(scriptOnly.status, "verified", JSON.stringify(scriptOnly));
  assert.equal(scriptOnly.nativeReadback.verification.sceneMutated, false);
  assert.equal(scriptOnly.nativeReadback.verification.closedBeforeWrite, false);
  assert.deepEqual(readFileSync(path.join(projectRoot, "main.tscn")), mainSceneBeforeScriptEdit, "script-only transaction rewrote an unchanged open scene");
  assert.equal((await rollbackReceipt({ receiptId: scriptOnly.receiptId }, runtime)).status, "rolled-back");

  const restoredAfterScript = await inspectProject({ projectRoot }, runtime);
  assert.equal(restoredAfterScript.revision, after.revision);
  const openSceneEdit = await applyTransaction({
    projectRoot, transactionId: "live-open-scene-edit", expectedRevision: restoredAfterScript.revision, scenePath: "res://main.tscn",
    actions: [{ type: "node.set_property", target: ".", property: "position", value: { $type: "Vector2", value: [12, 34] } }],
  }, runtime);
  assert.equal(openSceneEdit.status, "verified", JSON.stringify(openSceneEdit));
  assert.equal(openSceneEdit.nativeReadback.verification.sceneWasOpen, true);
  assert.equal(openSceneEdit.nativeReadback.verification.closedBeforeWrite, true);
  assert.equal(openSceneEdit.nativeReadback.verification.reopenedAfterWrite, true);
  assert.equal((await rollbackReceipt({ receiptId: openSceneEdit.receiptId }, runtime)).status, "rolled-back");
  const restoredAfterScene = await inspectProject({ projectRoot }, runtime);
  assert.equal(restoredAfterScene.revision, after.revision);
  assert.equal(restoredAfterScene.scene?.tree?.name, "Main");
  const started = bindRun(await startPlaytest({ projectRoot, expectedRevision: after.revision, scenePath: "res://main.tscn" }, runtime), projectRoot, runtime); assert.equal(started.status, "started");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const capture = await captureViewport({ runId: started.runId }, runtime);
  assert.equal(capture.status, "captured", JSON.stringify(capture));
  assert.equal(capture.source, "game-debugger");
  assert.equal(capture.width, 640);
  assert.equal(capture.height, 360);
  assert.deepEqual(Buffer.from(capture.pngBase64, "base64").subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal((await stopPlaytest({ runId: started.runId }, runtime)).status, "stopped");
  const rolled = await rollbackReceipt({ receiptId: receipt.receiptId }, runtime); assert.equal(rolled.status, "rolled-back", JSON.stringify(rolled)); assert.equal(projectRevision(projectRoot), baseline);
  const restoredRevision = projectRevision(projectRoot);
  const firstLaunch = ownedProcess(projectRoot).launchId;
  const closed = await closeOwnedEditor({ projectRoot }, runtime); assert.equal(closed.running, false); assert.equal(coordinator.isConnected(projectRoot), false);
  const reopened = await openProject({ projectRoot, mode: "editor" }, runtime); assert.equal(reopened.status, "started"); assert.notEqual(reopened.launchId, firstLaunch);
  const reconnectDeadline = Date.now() + 20_000;
  while (!coordinator.isConnected(projectRoot) && Date.now() < reconnectDeadline) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(coordinator.isConnected(projectRoot), true, `Reopened Godot addon did not connect: ${JSON.stringify(ownedProcess(projectRoot))}`);
  assert.equal(ownedProcess(projectRoot).launchId, reopened.launchId);
  const reclosed = await closeOwnedEditor({ projectRoot }, runtime); assert.equal(reclosed.running, false); assert.equal(coordinator.isConnected(projectRoot), false);
  const unenrolled = await unenrollProject({ projectRoot }, runtime); assert.equal(unenrolled.status, "unenrolled"); assert.equal(unenrolled.exactProjectGodotRestored, true);
  assert.deepEqual(readFileSync(path.join(projectRoot, "project.godot")), originalProjectGodot);
  assert.equal(existsSync(path.join(projectRoot, "main.gd.uid")), false);
  assert.equal(existsSync(path.join(projectRoot, ".godot")), false);
  assert.equal(existsSync(path.join(projectRoot, "addons")), false);
  console.log(JSON.stringify({
    schema: "godot-bridge/live-editor-canary/v1",
    status: "verified",
    operation: "create and change an isolated scene, playtest, capture native viewport, then restore exact project state",
    receiptId: receipt.receiptId,
    preRevision: receipt.preRevision,
    postRevision: receipt.postRevision,
    viewportSha256: capture.sha256,
    restoredRevision,
    exactRestoration: restoredRevision === baseline,
    exactUnenrollment: unenrolled.exactProjectGodotRestored,
  }));
});
