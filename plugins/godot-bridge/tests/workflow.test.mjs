import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyTransaction, enrollProject, rollbackReceipt, unenrollProject } from "../mcp/operations.mjs";
import { enrollmentFile, projectRevision, sha256 } from "../mcp/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enginePath = "C:\\Users\\rizek\\Documents\\Codex\\2026-07-31\\ch\\work\\toolchains\\godot-4.7.1\\Godot_v4.7.1-stable_win64_console.exe";

function fixture(t) {
  const base = mkdtempSync(path.join(tmpdir(), "godot-bridge-workflow-")); const projectRoot = path.join(base, "project"); const stateRoot = path.join(base, "state");
  cpSync(path.join(root, "tests", "fixture-project"), projectRoot, { recursive: true }); t.after(() => rmSync(base, { recursive: true, force: true }));
  const fake = {
    start: async () => {}, isConnected: () => true,
    dispatch: async (rootPath, operation, input) => {
      if (operation === "apply_transaction") {
        for (const action of input.actions) if (action.type === "script.write") { const target = path.join(rootPath, action.path.slice(6)); writeFileSync(target, action.content); }
        return { status: "verified", verification: { actions: input.actions.length } };
      }
      if (operation === "prepare_external_restore") return { status: "verified", prepared: true, scenePaths: input.targets.filter((target) => target.endsWith(".tscn")) };
      if (operation === "reload_project") return { status: "verified", reloaded: true };
      return { status: "observed" };
    },
  };
  return { base, projectRoot, stateRoot, options: { stateRoot, coordinator: fake, runProjects: new Map() } };
}

test("enrollment is idempotent and unenrollment removes only owned addon files", async (t) => {
  const fx = fixture(t); const prior = readFileSync(path.join(fx.projectRoot, "project.godot"), "utf8");
  const first = await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options); assert.equal(first.status, "enrolled");
  assert.ok(existsSync(path.join(fx.projectRoot, "addons", "codex_godot_bridge", "bridge_plugin.gd")));
  assert.equal((await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options)).status, "already-enrolled");
  const removed = await unenrollProject({ projectRoot: fx.projectRoot }, { ...fx.options, coordinator: { isConnected: () => false } }); assert.equal(removed.status, "unenrolled");
  assert.equal(readFileSync(path.join(fx.projectRoot, "project.godot"), "utf8"), prior);
});

test("re-enrollment upgrades only recorded addon bytes and preserves original ownership", async (t) => {
  const fx = fixture(t); const first = await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options);
  const recordFile = enrollmentFile(fx.stateRoot, fx.projectRoot);
  const legacyBytes = Buffer.from('[plugin]\nversion="0.1.3"\n');
  const target = path.join(fx.projectRoot, "addons", "codex_godot_bridge", "plugin.cfg");
  writeFileSync(target, legacyBytes);
  const legacy = structuredClone(first.enrollment);
  legacy.pluginVersion = "0.1.3";
  const pluginRecord = legacy.addonFiles.find((item) => item.relative.endsWith("plugin.cfg"));
  pluginRecord.sha256 = `sha256:${sha256(legacyBytes)}`; pluginRecord.bytes = legacyBytes.length;
  writeFileSync(recordFile, `${JSON.stringify(legacy, null, 2)}\n`);
  const upgraded = await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options);
  assert.equal(upgraded.status, "upgraded"); assert.equal(upgraded.enrollment.pluginVersion, "0.2.0");
  assert.equal(upgraded.enrollment.priorProjectGodotBase64, first.enrollment.priorProjectGodotBase64);
  assert.equal(upgraded.enrollment.addonWasEnabled, first.enrollment.addonWasEnabled);
  assert.equal(upgraded.enrollment.addonUpgradeHistory.at(-1).fromPluginVersion, "0.1.3");
  assert.match(readFileSync(target, "utf8"), /version="0\.2\.0"/);
  assert.equal((await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options)).status, "already-enrolled");
});

test("transaction seals verified receipt and explicit rollback restores exact revision", async (t) => {
  const fx = fixture(t); await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options);
  const before = projectRevision(fx.projectRoot);
  const receipt = await applyTransaction({ projectRoot: fx.projectRoot, transactionId: "write-player", expectedRevision: before, actions: [{ type: "script.write", path: "res://player.gd", content: "extends Node\n" }] }, fx.options);
  assert.equal(receipt.status, "verified"); assert.ok(existsSync(path.join(fx.projectRoot, "player.gd")));
  const rolled = await rollbackReceipt({ receiptId: receipt.receiptId }, fx.options); assert.equal(rolled.status, "rolled-back");
  assert.equal(projectRevision(fx.projectRoot), before); assert.equal(existsSync(path.join(fx.projectRoot, "player.gd")), false);
  const repeated = await rollbackReceipt({ receiptId: receipt.receiptId }, fx.options); assert.equal(repeated.status, "already-restored");
});

test("automatically restored failure receipts are idempotently already restored", async (t) => {
  const fx = fixture(t); await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options);
  const before = projectRevision(fx.projectRoot);
  const failing = { ...fx.options, coordinator: {
    start: async () => {}, isConnected: () => true,
    dispatch: async (rootPath, operation, input) => {
      if (operation === "apply_transaction") { writeFileSync(path.join(rootPath, "failed.gd"), "broken\n"); throw new Error("native rejection"); }
      if (operation === "prepare_external_restore") {
        assert.equal(existsSync(path.join(rootPath, "failed.gd")), true, "restore preparation must happen before checkpoint bytes are restored");
        return { status: "verified", prepared: true, scenePaths: input.targets.filter((target) => target.endsWith(".tscn")) };
      }
      if (operation === "reload_project") assert.equal(existsSync(path.join(rootPath, "failed.gd")), false, "reload must happen after checkpoint bytes are restored");
      return { status: "verified", reloaded: true };
    },
  } };
  const receipt = await applyTransaction({ projectRoot: fx.projectRoot, transactionId: "auto-restore", expectedRevision: before, actions: [{ type: "script.write", path: "res://failed.gd", content: "extends Node\n" }] }, failing);
  assert.equal(receipt.status, "rolled-back"); assert.equal(receipt.rollback.status, "verified-restored");
  assert.equal(projectRevision(fx.projectRoot), before); assert.equal(existsSync(path.join(fx.projectRoot, "failed.gd")), false);
  assert.equal((await rollbackReceipt({ receiptId: receipt.receiptId }, failing)).status, "already-restored");
});

test("stale revisions and changed owned addon files fail closed", async (t) => {
  const fx = fixture(t); await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options);
  await assert.rejects(applyTransaction({ projectRoot: fx.projectRoot, transactionId: "stale", expectedRevision: `sha256:${"0".repeat(64)}`, actions: [{ type: "script.write", path: "res://x.gd", content: "extends Node\n" }] }, fx.options), /Stale/);
  writeFileSync(path.join(fx.projectRoot, "addons", "codex_godot_bridge", "plugin.cfg"), "changed\n");
  await assert.rejects(enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options), /changed/);
  await assert.rejects(unenrollProject({ projectRoot: fx.projectRoot }, { ...fx.options, coordinator: { isConnected: () => false } }), /changed/);
});

test("project revision tracks source assets and ignores generated import sidecars", (t) => {
  const fx = fixture(t); const before = projectRevision(fx.projectRoot);
  writeFileSync(path.join(fx.projectRoot, "icon.svg"), "<svg/>\n");
  const withAsset = projectRevision(fx.projectRoot); assert.notEqual(withAsset, before);
  writeFileSync(path.join(fx.projectRoot, "icon.svg.import"), "generated\n");
  assert.equal(projectRevision(fx.projectRoot), withAsset);
});
