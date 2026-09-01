import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Coordinator } from "../mcp/coordinator.mjs";
import { applyTransaction, rollbackReceipt } from "../mcp/operations.mjs";
import { sha256, stateRoot } from "../mcp/state.mjs";

test("live REAPER canary proves native readback, mutation, independent RPP evidence, and exact rollback", { timeout: 60000 }, async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "reaper-bridge-native-")); const projectPath = path.join(temp, "canary.rpp");
  const coordinator = new Coordinator({ stateRoot: stateRoot(), timeoutMs: 15000 }); await coordinator.start();
  const child = spawn("C:/Program Files/REAPER (x64)/reaper.exe", ["-newinst"], { stdio: "ignore" }); const runtime = { stateRoot: stateRoot(), coordinator };
  try {
    let observation;
    for (let i = 0; i < 50; i++) { await new Promise((resolve) => setTimeout(resolve, 200)); if (!coordinator.connection()) continue; observation = await coordinator.dispatch("inspect", {}); if (observation.ok && !observation.projectPath) await coordinator.dispatch("save_as", { projectPath }); observation = await coordinator.dispatch("inspect", {}); if (observation.ok && path.resolve(observation.projectPath || "").toLowerCase() === projectPath.toLowerCase() && !observation.dirty) break; }
    assert.equal(path.resolve(observation.projectPath).toLowerCase(), projectPath.toLowerCase()); assert.equal(observation.trackCount, 0);
    const pre = sha256(readFileSync(projectPath)); const applied = await applyTransaction({ projectPath, expectedRevision: observation.revision, actions: [{ type: "create_track", index: 0, name: "Codex Native Canary" }] }, runtime);
    assert.match(readFileSync(projectPath, "utf8"), /Codex Native Canary/); const rolled = await rollbackReceipt({ receiptId: applied.receiptId }, runtime);
    assert.equal(rolled.exactBytes, true); assert.equal(sha256(readFileSync(projectPath)), pre);
  } finally { try { process.kill(child.pid); } catch {} await coordinator.close(); rmSync(temp, { recursive: true, force: true }); }
});

