import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyTransaction, rollbackReceipt, setupBridge } from "../mcp/operations.mjs";
import { sha256 } from "../mcp/state.mjs";

test("sealed transaction receipt restores exact board bytes", async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "kicad-workflow-")); const stateRoot = path.join(temporary, "state"); const boardPath = path.join(temporary, "fixture.kicad_pcb"); const pre = Buffer.from("kicad-pre"); writeFileSync(boardPath, pre);
  const revision = (bytes) => `sha256:${sha256(Buffer.concat([Buffer.from("revision:"), bytes]))}`;
  const observation = () => { const bytes = readFileSync(boardPath); return { ok: true, application: { name: "KiCad PCB Editor", version: "10.0.5", apiVersion: "10.0.1-0-g2db9e5a72b" }, board: { path: boardPath, sha256: sha256(bytes), memorySha256: sha256(Buffer.concat([Buffer.from("memory:"), bytes])) }, revision: revision(bytes), title: "Fixture", layers: [], counts: { footprints: 0, tracks: 0, vias: 0, texts: 0 }, footprints: [], texts: [], selection: [] }; };
  const fakeCall = (operation) => { if (operation === "apply") writeFileSync(boardPath, "kicad-post"); return observation(); };
  try {
    await setupBridge({ action: "enroll_root", rootPath: temporary }, { stateRoot, callKiCad: fakeCall }); writeFileSync(path.join(stateRoot, "owned-process.json"), JSON.stringify({ pid: process.pid, socketPath: "ipc://test", boardPath }));
    const before = observation(); writeFileSync(path.join(stateRoot, "synchronized-state.json"), JSON.stringify({ boardPath, savedSha256: before.board.sha256, memorySha256: before.board.memorySha256, revision: before.revision })); const applied = await applyTransaction({ boardPath, expectedRevision: before.revision, actions: [{ type: "set_title", title: "ArkheOS Proof" }] }, { stateRoot, callKiCad: fakeCall }); assert.notEqual(applied.observation.board.sha256, before.board.sha256);
    const post = readFileSync(boardPath); writeFileSync(boardPath, "foreign-drift");
    await assert.rejects(() => rollbackReceipt({ receiptId: applied.receiptId }, { stateRoot, callKiCad: fakeCall }), /post-state drifted/);
    writeFileSync(boardPath, post);
    const rolled = await rollbackReceipt({ receiptId: applied.receiptId }, { stateRoot, callKiCad: fakeCall }); assert.equal(rolled.exactBytes, true); assert.equal(sha256(readFileSync(boardPath)), sha256(pre));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
