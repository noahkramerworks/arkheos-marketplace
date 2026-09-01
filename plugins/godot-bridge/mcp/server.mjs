#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Coordinator } from "./coordinator.mjs";
import { buildExport, inspectExport } from "./export.mjs";
import { applyTransaction, bindRun, captureViewport, closeOwnedEditor, enrollProject, inspectInstallation, inspectPlaytest, inspectProject, openProject, rollbackReceipt, startPlaytest, stopPlaytest, unenrollProject } from "./operations.mjs";
import { resolveStateRoot } from "./state.mjs";

const closed = { type: "object", additionalProperties: false };
const projectRoot = { type: "string", description: "Absolute project directory containing project.godot." };
const revision = { type: "string", pattern: "^sha256:[a-f0-9]{64}$" };
const transactionInputSchema = JSON.parse(readFileSync(new URL("../schemas/transaction.schema.json", import.meta.url), "utf8"));
delete transactionInputSchema.$schema; delete transactionInputSchema.$id;

export const TOOLS = [
  { name: "inspect_installation", description: "Inspect an exact Godot executable and report version and identity without mutation.", inputSchema: { ...closed, properties: { enginePath: { type: "string" } } } },
  { name: "enroll_project", description: "Install the owned Godot addon into one project and record exact ownership.", inputSchema: { ...closed, properties: { projectRoot, enginePath: { type: "string" } }, required: ["projectRoot", "enginePath"] } },
  { name: "unenroll_project", description: "Remove only hash-matching owned addon files and restore addon enablement.", inputSchema: { ...closed, properties: { projectRoot }, required: ["projectRoot"] } },
  { name: "open_project", description: "Open an enrolled Godot project in editor or headless-editor mode and retain process ownership.", inputSchema: { ...closed, properties: { projectRoot, mode: { enum: ["editor", "headless"] } }, required: ["projectRoot", "mode"] } },
  { name: "close_owned_editor", description: "Stop only the Godot editor process launched and owned by this bridge.", inputSchema: { ...closed, properties: { projectRoot }, required: ["projectRoot"] } },
  { name: "inspect_project", description: "Return bounded native project, scene, script, resource, diagnostics, import, and playtest state.", inputSchema: { ...closed, properties: { projectRoot, include: { type: "array", items: { type: "string" }, maxItems: 20 }, cursor: { type: "string" } }, required: ["projectRoot"] } },
  { name: "inspect_export", description: "Inspect a named Godot export preset, engine, templates, target, and exact project revision without exporting.", inputSchema: { ...closed, properties: { projectRoot, presetName: { type: "string", minLength: 1, maxLength: 160 } }, required: ["projectRoot", "presetName"] } },
  { name: "apply_transaction", description: "Apply one closed revision-guarded Godot transaction, verify readback, and seal a receipt.", inputSchema: transactionInputSchema },
  { name: "start_playtest", description: "Start a revision-bound bridge-owned Godot playtest and return a run identity.", inputSchema: { ...closed, properties: { projectRoot, expectedRevision: revision, scenePath: { type: "string", pattern: "^res://" } }, required: ["projectRoot", "expectedRevision"] } },
  { name: "inspect_playtest", description: "Read bounded logs, debugger events, and status for one bridge-owned playtest.", inputSchema: { ...closed, properties: { runId: { type: "string" }, cursor: { type: "string" } }, required: ["runId"] } },
  { name: "capture_viewport", description: "Capture a PNG from the native Godot viewport for one bridge-owned run.", inputSchema: { ...closed, properties: { runId: { type: "string" } }, required: ["runId"] } },
  { name: "stop_playtest", description: "Idempotently stop one bridge-owned Godot playtest.", inputSchema: { ...closed, properties: { runId: { type: "string" } }, required: ["runId"] } },
  { name: "build_export", description: "Build one revision-bound staged Windows x86-64 embedded-PCK export into an external directory and seal an artifact receipt.", inputSchema: { ...closed, properties: { projectRoot, expectedRevision: revision, presetName: { type: "string", minLength: 1, maxLength: 160 }, outputDirectory: { type: "string", minLength: 3 }, artifactBasename: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$" } }, required: ["projectRoot", "expectedRevision", "presetName", "outputDirectory", "artifactBasename"] } },
  { name: "rollback_receipt", description: "Restore exact pre-state from one verified immutable bridge receipt and verify revision identity.", inputSchema: { ...closed, properties: { receiptId: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" } }, required: ["receiptId"] } },
];

const defaultRuntime = { stateRoot: resolveStateRoot(), runProjects: new Map() };
defaultRuntime.coordinator = new Coordinator({ stateRoot: defaultRuntime.stateRoot });

function handlers(options) {
  return {
    inspect_installation: inspectInstallation,
    enroll_project: enrollProject,
    unenroll_project: unenrollProject,
    open_project: openProject,
    close_owned_editor: closeOwnedEditor,
    inspect_project: inspectProject,
    inspect_export: inspectExport,
    apply_transaction: applyTransaction,
    start_playtest: async (args, runtime) => bindRun(await startPlaytest(args, runtime), args.projectRoot, runtime),
    inspect_playtest: inspectPlaytest,
    capture_viewport: captureViewport,
    stop_playtest: stopPlaytest,
    build_export: buildExport,
    rollback_receipt: rollbackReceipt,
  };
}

function errorResponse(id, code, message) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message: String(message).slice(0, 2000) } }; }

export async function handleRpc(message, options = defaultRuntime) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return errorResponse(message?.id, -32600, "Invalid Request");
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return null;
  if (message.method === "initialize") return { jsonrpc: "2.0", id: message.id, result: { protocolVersion: typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "godot-bridge", title: "Godot Bridge", version: "0.2.0" } } };
  if (message.method === "ping") return { jsonrpc: "2.0", id: message.id, result: {} };
  if (message.method === "tools/list") return { jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } };
  if (message.method !== "tools/call") return errorResponse(message.id, -32601, "Method not found");
  const name = message.params?.name;
  const handler = handlers(options)[name];
  if (!handler) return errorResponse(message.id, -32602, `Unknown tool: ${name || "missing"}`);
  try {
    if (options.coordinator) await options.coordinator.start();
    const result = await handler(message.params?.arguments || {}, options);
    const content = [];
    if (result?.pngBase64) content.push({ type: "image", data: result.pngBase64, mimeType: "image/png" });
    content.push({ type: "text", text: JSON.stringify(result) });
    const isError = ["rejected", "rolled-back", "manual-recovery-required"].includes(result?.status) && result?.classification !== "explicit-rollback";
    return { jsonrpc: "2.0", id: message.id, result: { content, structuredContent: result, isError } };
  } catch (error) {
    const rejected = { status: "rejected", error: String(error.message).slice(0, 2000) };
    return { jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(rejected) }], structuredContent: rejected, isError: true } };
  }
}

export async function startStdio(options = defaultRuntime) {
  if (options.coordinator) await options.coordinator.start();
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      void (async () => {
        let response;
        try { response = await handleRpc(JSON.parse(line), options); }
        catch (error) { response = errorResponse(null, -32700, `Parse error: ${error.message}`); }
        if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
      })();
    }
  });
  const cleanup = () => void options.coordinator?.close();
  process.once("exit", cleanup); process.once("SIGINT", cleanup); process.once("SIGTERM", cleanup);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startStdio();
