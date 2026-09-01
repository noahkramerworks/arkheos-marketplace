#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { applyTransaction, bridgeStatus, exportArtifact, inspectBoard, rollbackReceipt, runtime, setupBridge } from "./operations.mjs";

const closed = { type: "object", additionalProperties: false };
const boardPath = { type: "string", pattern: "^[A-Za-z]:\\\\.*\\.kicad_pcb$" };
const expectedRevision = { type: "string", pattern: "^sha256:[a-f0-9]{64}$" };
const transaction = JSON.parse(readFileSync(new URL("../schemas/transaction.schema.json", import.meta.url), "utf8")); delete transaction.$schema; delete transaction.$id;

export const TOOLS = [
  { name: "bridge_status", description: "Inspect exact KiCad 10.0.5, IPC schema, pinned Python runtime, enrollment, owned process, and native connection identity.", inputSchema: { ...closed, properties: {} } },
  { name: "setup_bridge", description: "Prepare the offline IPC client, enroll a root, launch one enrolled board in an isolated profile, or close only the owned clean process.", inputSchema: { ...closed, properties: { action: { enum: ["prepare_runtime", "enroll_root", "launch_board", "close_owned_process"] }, rootPath: { type: "string", pattern: "^[A-Za-z]:\\\\.+" }, boardPath }, required: ["action"] } },
  { name: "inspect_board", description: "Read bounded native application, board, revision, dirty, layer, count, title, text, footprint, and selection state.", inputSchema: { ...closed, properties: {} } },
  { name: "apply_transaction", description: "Apply one closed clean revision-guarded board transaction with checkpoint, independent IPC/file readback, and immutable receipt.", inputSchema: transaction },
  { name: "export_artifact", description: "Render the clean exact open board to a bridge-owned PNG or JPEG through the separately bound KiCad 10.0.5 CLI surface.", inputSchema: { ...closed, properties: { boardPath, expectedRevision, format: { enum: ["png", "jpeg"] } }, required: ["boardPath", "expectedRevision", "format"] } },
  { name: "rollback_receipt", description: "Restore one receipt's exact board checkpoint and verify native revert, original revision, and original bytes.", inputSchema: { ...closed, properties: { receiptId: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" } }, required: ["receiptId"] } }
];
const handlers = { bridge_status: bridgeStatus, setup_bridge: setupBridge, inspect_board: inspectBoard, apply_transaction: applyTransaction, export_artifact: exportArtifact, rollback_receipt: rollbackReceipt };
function error(id, code, message) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message: String(message).slice(0, 2000) } }; }

export async function handleRpc(message, options = runtime) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return error(message?.id, -32600, "Invalid Request");
  if (message.method.startsWith("notifications/")) return null;
  if (message.method === "initialize") return { jsonrpc: "2.0", id: message.id, result: { protocolVersion: message.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "kicad-bridge", title: "KiCad Bridge", version: "0.1.0" } } };
  if (message.method === "ping") return { jsonrpc: "2.0", id: message.id, result: {} };
  if (message.method === "tools/list") return { jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } };
  if (message.method !== "tools/call") return error(message.id, -32601, "Method not found");
  const handler = handlers[message.params?.name]; if (!handler) return error(message.id, -32602, "Unknown tool");
  try { const result = await handler(message.params?.arguments || {}, options); return { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false } }; }
  catch (cause) { const result = { status: "rejected", error: String(cause.message).slice(0, 2000) }; return { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: true } }; }
}

export async function startStdio(options = runtime) {
  let buffer = ""; process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { buffer += chunk; while (buffer.includes("\n")) { const index = buffer.indexOf("\n"); const line = buffer.slice(0, index).replace(/\r$/, ""); buffer = buffer.slice(index + 1); if (!line.trim()) continue; void (async () => { let response; try { response = await handleRpc(JSON.parse(line), options); } catch (cause) { response = error(null, -32700, cause.message); } if (response) process.stdout.write(`${JSON.stringify(response)}\n`); })(); } });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startStdio();
