#!/usr/bin/env node
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTransaction, exportArtifact, rollbackReceipt, runtime, setupBridge } from "../mcp/operations.mjs";
import { fileSha256 } from "../mcp/state.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(path.join(os.tmpdir(), "kicad-bridge-canary-")); const boardPath = path.join(temporary, "fixture.kicad_pcb"); let launched = false;
try {
  copyFileSync(path.join(sourceRoot, "fixtures", "minimal.kicad_pcb"), boardPath); const preSha256 = fileSha256(boardPath);
  await setupBridge({ action: "prepare_runtime" }, runtime); await setupBridge({ action: "enroll_root", rootPath: temporary }, runtime); const opened = await setupBridge({ action: "launch_board", boardPath }, runtime); launched = true;
  const before = opened.observation; if (before.application.version !== "10.0.5" || before.board.sha256 !== preSha256 || before.dirty || before.counts.texts !== 0) throw new Error(`Initial native fixture observation is not exact and clean: ${JSON.stringify(before)}`);
  const applied = await applyTransaction({ boardPath, expectedRevision: before.revision, actions: [
    { type: "create_text", value: "ARKHEOS_BRIDGE:Native canary", xMm: 35, yMm: 32, layer: "Cmts.User" },
    { type: "move_owned_text", textId: "@last_created", dxMm: 10, dyMm: 8 },
    { type: "set_title", title: "ArkheOS KiCad Native Proof" }
  ] }, runtime);
  const owned = applied.observation.texts.find((item) => item.owned); if (!owned || owned.xMm !== 45 || owned.yMm !== 40 || applied.observation.title !== "ArkheOS KiCad Native Proof") throw new Error(`Native typed write/readback failed: ${JSON.stringify(applied.observation)}`);
  const rendered = await exportArtifact({ boardPath, expectedRevision: applied.observation.revision, format: "png" }, runtime);
  const rolled = await rollbackReceipt({ receiptId: applied.receiptId }, runtime); if (!rolled.exactBytes || rolled.restoredSha256 !== preSha256 || fileSha256(boardPath) !== preSha256) throw new Error("Exact native restoration failed");
  await setupBridge({ action: "close_owned_process" }, runtime); launched = false;
  process.stdout.write(`${JSON.stringify({ status: "passed", application: before.application, pid: opened.pid, socketPath: opened.socketPath, boardPath, preSha256, postSha256: applied.observation.board.sha256, receiptId: applied.receiptId, restoredSha256: rolled.restoredSha256, render: { path: rendered.outputPath, sha256: rendered.sha256, bytes: rendered.bytes } }, null, 2)}\n`);
} finally {
  if (launched) { try { await setupBridge({ action: "close_owned_process" }, runtime); } catch {} }
  try { rmSync(temporary, { recursive: true, force: true }); } catch {}
}
