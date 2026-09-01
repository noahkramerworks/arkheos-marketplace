#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Coordinator } from "./coordinator.mjs";
import { applyTransaction, bridgeStatus, exportArtifact, inspectProject, rollbackReceipt, runtime, setupBridge } from "./operations.mjs";

const closed = { type: "object", additionalProperties: false };
const projectPath = { type: "string", pattern: "^[A-Za-z]:\\\\.*\\.(qgs|qgz)$" };
const expectedRevision = { type: "string", pattern: "^sha256:[a-f0-9]{64}$" };
const transaction = JSON.parse(readFileSync(new URL("../schemas/transaction.schema.json", import.meta.url), "utf8")); delete transaction.$schema; delete transaction.$id;
export const TOOLS = [
  { name: "bridge_status", description: "Inspect exact QGIS 4.2.0, PyQGIS runtime, owned extension identity, process, and native connection.", inputSchema: { ...closed, properties: {} } },
  { name: "setup_bridge", description: "Install/remove the owned extension, enroll one user-profile root, launch an enrolled project, or close only the owned clean process.", inputSchema: { ...closed, properties: { action: { enum: ["install_extension", "remove_extension", "enroll_root", "launch_project", "close_owned_process"] }, rootPath: { type: "string", pattern: "^[A-Za-z]:\\\\.+" }, projectPath }, required: ["action"] } },
  { name: "inspect_project", description: "Read bounded native project, revision, dirty, CRS, layer, renderer, and layout state.", inputSchema: { ...closed, properties: {} } },
  { name: "apply_transaction", description: "Apply one closed clean revision-guarded layer/layout transaction with checkpoint, independent readback, and immutable receipt.", inputSchema: transaction },
  { name: "export_artifact", description: "Export a clean exact-revision owned layout to bridge-owned PNG or PDF through PyQGIS.", inputSchema: { ...closed, properties: { projectPath, expectedRevision, layoutName: { type: "string", pattern: "^ArkheOS_[A-Za-z0-9_-]{1,48}$" }, format: { enum: ["png", "pdf"] } }, required: ["projectPath", "expectedRevision", "layoutName", "format"] } },
  { name: "rollback_receipt", description: "Restore one receipt's exact QGIS project checkpoint and verify native reload plus original bytes.", inputSchema: { ...closed, properties: { receiptId: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" } }, required: ["receiptId"] } }
];
const handlers = { bridge_status: bridgeStatus, setup_bridge: setupBridge, inspect_project: inspectProject, apply_transaction: applyTransaction, export_artifact: exportArtifact, rollback_receipt: rollbackReceipt };
const defaultRuntime = { ...runtime }; defaultRuntime.coordinator = new Coordinator({ stateRoot: defaultRuntime.stateRoot });
function error(id, code, message) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message: String(message).slice(0, 2000) } }; }
export async function handleRpc(message, options = defaultRuntime) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return error(message?.id, -32600, "Invalid Request");
  if (message.method.startsWith("notifications/")) return null;
  if (message.method === "initialize") return { jsonrpc: "2.0", id: message.id, result: { protocolVersion: message.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "qgis-bridge", title: "QGIS Bridge", version: "0.1.1" } } };
  if (message.method === "ping") return { jsonrpc: "2.0", id: message.id, result: {} };
  if (message.method === "tools/list") return { jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } };
  if (message.method !== "tools/call") return error(message.id, -32601, "Method not found");
  const handler = handlers[message.params?.name]; if (!handler) return error(message.id, -32602, "Unknown tool");
  try { await options.coordinator.start(); const result = await handler(message.params?.arguments || {}, options); return { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false } }; }
  catch (cause) { const result = { status: "rejected", error: String(cause.message).slice(0, 2000) }; return { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: true } }; }
}
export async function startStdio(options = defaultRuntime) {
  await options.coordinator.start(); let buffer = ""; process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { buffer += chunk; while (buffer.includes("\n")) { const index = buffer.indexOf("\n"); const line = buffer.slice(0, index).replace(/\r$/, ""); buffer = buffer.slice(index + 1); if (!line.trim()) continue; void (async () => { let response; try { response = await handleRpc(JSON.parse(line), options); } catch (cause) { response = error(null, -32700, cause.message); } if (response) process.stdout.write(`${JSON.stringify(response)}\n`); })(); } });
  const cleanup = () => void options.coordinator.close(); process.once("exit", cleanup); process.once("SIGINT", cleanup); process.once("SIGTERM", cleanup);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startStdio();
