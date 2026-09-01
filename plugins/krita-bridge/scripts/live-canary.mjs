#!/usr/bin/env node
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Coordinator } from "../mcp/coordinator.mjs";
import { applyTransaction, exportArtifact, inspectDocument, rollbackReceipt, setupBridge } from "../mcp/operations.mjs";
import { fileSha256 } from "../mcp/state.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(sourceRoot, "fixtures", "fixture.kra");
if (!existsSync(fixture)) throw new Error("source-owned Krita fixture is missing");

const workRoot = mkdtempSync(path.join(os.tmpdir(), "krita-bridge-canary-"));
const stateRoot = mkdtempSync(path.join(os.tmpdir(), "krita-bridge-state-"));
const documentPath = path.join(workRoot, "canary.kra");
copyFileSync(fixture, documentPath);
const preSha256 = fileSha256(documentPath);
const runtime = { stateRoot, coordinator: new Coordinator({ stateRoot, timeoutMs: 60_000 }), ownedProcess: null };
let result;

try {
  await runtime.coordinator.start();
  await setupBridge({ action: "enroll_root", rootPath: workRoot }, runtime);
  const launched = await setupBridge({ action: "launch_document", documentPath }, runtime);
  const before = await inspectDocument({}, runtime);
  const applied = await applyTransaction({
    documentPath,
    expectedRevision: before.revision,
    actions: [
      { type: "create_paint_layer", name: "ArkheOS_Canary" },
      { type: "translate_owned_layer", layerId: "@last_created", dx: 24, dy: -12 },
    ],
  }, runtime);
  const readback = await inspectDocument({}, runtime);
  const layer = readback.layers.find((item) => item.name === "ArkheOS_Canary");
  if (!layer?.owned || layer.position.x !== 24 || layer.position.y !== -12 || readback.revision !== applied.observation.revision) throw new Error("independent native layer readback failed");
  const exported = await exportArtifact({ documentPath, expectedRevision: readback.revision, format: "png" }, runtime);
  const rollback = await rollbackReceipt({ receiptId: applied.receiptId }, runtime);
  const restored = await inspectDocument({}, runtime);
  if (!rollback.exactBytes || fileSha256(documentPath) !== preSha256 || restored.revision !== before.revision || restored.layers.some((item) => item.name === "ArkheOS_Canary")) throw new Error("exact restoration proof failed");
  result = {
    status: "passed",
    application: launched.observation.applicationName,
    apiVersion: launched.observation.apiVersion,
    pid: launched.pid,
    preSha256,
    postSha256: applied.readback.documentSha256,
    receiptId: applied.receiptId,
    export: { sha256: exported.sha256, bytes: exported.bytes },
    restoredSha256: rollback.restoredSha256,
    exactBytes: rollback.exactBytes,
  };
} finally {
  try { await setupBridge({ action: "close_owned_process" }, runtime); } catch {}
  await runtime.coordinator.close();
  try { rmSync(workRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch {}
  try { rmSync(stateRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch {}
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
