import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTransaction, rollbackReceipt } from "../mcp/operations.mjs";
import { TOOLS } from "../mcp/server.mjs";
import { sha256 } from "../mcp/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const identity = { applicationVersion: "7.79", bridgeVersion: "0.2.0", apiVersion: "0x20E", sdkCommit: "490ded57668727fba21482fabc50ba9853a457bb" };

test("profile admits one official version-bound native API with typed read, write, readback, and rollback", () => {
  const profile = JSON.parse(readFileSync(path.join(root, "bridge", "profile.json"), "utf8"));
  assert.equal(profile.schema, "bridge-profile/v1.2");
  assert.equal(profile.pluginVersion, "0.2.0");
  assert.equal(profile.controlSurface.kind, "documented-application-api");
  assert.match(profile.controlSurface.authority, /REAPER 7\.79 C\/C\+\+ extension plug-in API/);
  assert.match(profile.controlSurface.version, /0x20E.*490ded57668727fba21482fabc50ba9853a457bb/);
  assert.equal(profile.controlSurface.typedReads.length > 0, true);
  assert.equal(profile.controlSurface.typedWrites.length > 0, true);
  assert.equal(profile.controlSurface.independentReadback, true);
  assert.equal(profile.controlSurface.exactRollback, true);
  for (const rejected of ["controllerOnly", "uiAutomation", "screenScraping", "rawPassthrough", "exportOnly"]) assert.equal(profile.controlSurface[rejected], false, rejected);
  assert.equal(profile.certificationTiers[0], "api-contract-admission");
  assert.deepEqual(profile.release.targets.map((target) => target.selector), ["reaper-bridge@personal", "reaper-bridge@arkheos"]);
  for (const artifact of [...profile.application.identityArtifacts, ...profile.controlSurface.contractArtifacts]) assert.equal(existsSync(artifact.path), true, artifact.path);
});

test("native extension binds the pinned official SDK and rejects version drift at connection admission", () => {
  const source = readFileSync(path.join(root, "native", "src", "reaper_codex_bridge.cpp"), "utf8");
  const coordinator = readFileSync(path.join(root, "mcp", "coordinator.mjs"), "utf8");
  const provenance = JSON.parse(readFileSync(path.join(root, "native", "vendor", "reaper-sdk", "PROVENANCE.json"), "utf8"));
  assert.equal(provenance.commit, identity.sdkCommit);
  for (const token of ["REAPERAPI_MINIMAL", "REAPERAPI_WANT_EnumProjects", "REAPERAPI_WANT_GetProjectStateChangeCount", "REAPERAPI_WANT_InsertTrackAtIndex", "REAPERAPI_WANT_Undo_DoUndo2", "REAPER_PLUGIN_VERSION", "BRIDGE_VERSION = \"0.2.0\""]) assert.equal(source.includes(token), true, token);
  for (const token of [identity.applicationVersion, identity.bridgeVersion, identity.apiVersion, identity.sdkCommit, "invalid or unsupported native identity"]) assert.equal(coordinator.includes(token), true, token);
  assert.equal(/ReaScript|ShellExecute|CreateProcess/.test(source), false);
});

test("tool schemas and runtime actions reject raw code, commands, payloads, credentials, and extra action fields", async () => {
  assert.deepEqual(TOOLS.map((tool) => tool.name), ["inspect_installation", "install_extension", "remove_extension", "launch_reaper", "close_owned_reaper", "inspect_project", "apply_transaction", "render_master", "rollback_receipt"]);
  const serialized = JSON.stringify(TOOLS.map((tool) => tool.inputSchema)).toLowerCase();
  for (const blocked of ["commandid", "command_id", "script", "code", "raw_rpc", "payload", "credential", "token", "shell"]) assert.equal(serialized.includes(`\"${blocked}\"`), false, blocked);
  const transaction = TOOLS.find((tool) => tool.name === "apply_transaction").inputSchema;
  assert.equal(transaction.additionalProperties, false);
  assert.equal(transaction.properties.actions.items.oneOf.every((variant) => variant.additionalProperties === false), true);
  const temp = mkdtempSync(path.join(os.tmpdir(), "reaper-admission-reject-"));
  const projectPath = path.join(temp, "fixture.rpp"); writeFileSync(projectPath, "pre");
  try {
    await assert.rejects(() => applyTransaction({ projectPath, expectedRevision: 1, actions: [{ type: "create_track", index: 0, script: "anything" }] }, { stateRoot: temp, coordinator: { dispatch: async () => { throw new Error("unexpected dispatch"); } } }), /Unsupported action fields/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("typed write is independently observed and exact receipt rollback restores saved-project bytes", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "reaper-admission-write-"));
  const projectPath = path.join(temp, "fixture.rpp"); const preBytes = Buffer.from("<REAPER_PROJECT 0.1\n>\n"); writeFileSync(projectPath, preBytes);
  let phase = "before";
  const coordinator = {
    dispatch: async (operation) => {
      if (operation === "inspect") return { ok: true, ...identity, dirty: false, projectPath, revision: phase === "before" ? 1 : 2, trackCount: phase === "before" ? 0 : 1, tracks: phase === "before" ? [] : [{ index: 0, name: "Admission" }] };
      if (operation === "save") { phase = "after"; writeFileSync(projectPath, "<REAPER_PROJECT 0.1\n  <TRACK Admission>\n>\n"); return { ok: true }; }
      if (operation === "undo_save") { phase = "before"; writeFileSync(projectPath, preBytes); return { ok: true }; }
      return { ok: true };
    },
  };
  try {
    const runtime = { stateRoot: temp, coordinator };
    const applied = await applyTransaction({ projectPath, expectedRevision: 1, actions: [{ type: "create_track", index: 0, name: "Admission" }] }, runtime);
    const observed = readFileSync(projectPath);
    assert.match(observed.toString("utf8"), /Admission/);
    assert.equal(applied.observation.trackCount, 1);
    assert.equal(applied.readback.projectSha256, sha256(observed));
    const rolled = await rollbackReceipt({ receiptId: applied.receiptId }, runtime);
    assert.equal(rolled.exactBytes, true);
    assert.equal(sha256(readFileSync(projectPath)), sha256(preBytes));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
