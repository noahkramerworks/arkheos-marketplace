#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Coordinator } from "./coordinator.mjs";
import { applyTransaction, closeOwnedReaper, inspectInstallation, inspectProject, installExtension, launchReaper, removeExtension, renderMaster, rollbackReceipt, runtime } from "./operations.mjs";

const closed = { type: "object", additionalProperties: false };
const projectPath = { type: "string", pattern: "^[A-Za-z]:\\\\.*\\.rpp$" };
const transactionSchema = JSON.parse(readFileSync(new URL("../schemas/transaction.schema.json", import.meta.url), "utf8")); delete transactionSchema.$schema; delete transactionSchema.$id;
export const TOOLS = [
  { name: "inspect_installation", description: "Inspect exact REAPER executable, registration marker, extension identity, and connection without reading license contents.", inputSchema: { ...closed, properties: {} } },
  { name: "install_extension", description: "Install the exact packaged bridge-owned native REAPER extension; foreign content stops closed.", inputSchema: { ...closed, properties: {} } },
  { name: "remove_extension", description: "Remove only hash-matching bridge-owned extension content.", inputSchema: { ...closed, properties: {} } },
  { name: "launch_reaper", description: "Launch a bridge-owned new REAPER instance, optionally on an absolute saved project.", inputSchema: { ...closed, properties: { projectPath } } },
  { name: "close_owned_reaper", description: "Close only a bridge-owned REAPER PID after native dirty-state refusal.", inputSchema: { ...closed, properties: {} } },
  { name: "inspect_project", description: "Read bounded native application, project, revision, dirty, track, and FX state.", inputSchema: { ...closed, properties: {} } },
  { name: "apply_transaction", description: "Apply one closed saved-project transaction with revision gate, checkpoint, native readback, and receipt.", inputSchema: transactionSchema },
  { name: "render_master", description: "Invoke one revision-bound master render using existing explicit project settings and verify an exact output artifact.", inputSchema: { ...closed, properties: { projectPath, expectedRevision: { type: "integer", minimum: 0 }, outputPath: { type: "string" } }, required: ["projectPath", "expectedRevision", "outputPath"] } },
  { name: "rollback_receipt", description: "Undo one sealed transaction and verify restored project bytes equal its immutable checkpoint.", inputSchema: { ...closed, properties: { receiptId: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" } }, required: ["receiptId"] } }
];

const handlers = { inspect_installation: inspectInstallation, install_extension: installExtension, remove_extension: removeExtension, launch_reaper: launchReaper, close_owned_reaper: closeOwnedReaper, inspect_project: inspectProject, apply_transaction: applyTransaction, render_master: renderMaster, rollback_receipt: rollbackReceipt };
const defaultRuntime = { ...runtime }; defaultRuntime.coordinator = new Coordinator({ stateRoot: defaultRuntime.stateRoot });
function rpcError(id, code, message) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message: String(message).slice(0, 2000) } }; }
export async function handleRpc(message, options = defaultRuntime) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return rpcError(message?.id, -32600, "Invalid Request");
  if (message.method.startsWith("notifications/")) return null;
  if (message.method === "initialize") return { jsonrpc: "2.0", id: message.id, result: { protocolVersion: message.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "reaper-bridge", title: "REAPER Bridge", version: "0.2.0" } } };
  if (message.method === "ping") return { jsonrpc: "2.0", id: message.id, result: {} };
  if (message.method === "tools/list") return { jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } };
  if (message.method !== "tools/call") return rpcError(message.id, -32601, "Method not found");
  const handler = handlers[message.params?.name]; if (!handler) return rpcError(message.id, -32602, "Unknown tool");
  try {
    await options.coordinator.start(); const result = await handler(message.params?.arguments || {}, options);
    return { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false } };
  } catch (error) {
    const result = { status: "rejected", error: String(error.message).slice(0, 2000) };
    return { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: true } };
  }
}
export async function startStdio(options = defaultRuntime) {
  await options.coordinator.start(); let buffer = ""; process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { buffer += chunk; while (buffer.includes("\n")) { const index = buffer.indexOf("\n"); const line = buffer.slice(0, index).replace(/\r$/, ""); buffer = buffer.slice(index + 1); if (!line.trim()) continue; void (async () => { let response; try { response = await handleRpc(JSON.parse(line), options); } catch (error) { response = rpcError(null, -32700, error.message); } if (response) process.stdout.write(`${JSON.stringify(response)}\n`); })(); } });
  const cleanup = () => void options.coordinator.close(); process.once("exit", cleanup); process.once("SIGINT", cleanup); process.once("SIGTERM", cleanup);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startStdio();
