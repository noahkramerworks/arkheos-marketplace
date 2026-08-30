#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { applyScenePlan, inspectObs, rollbackReceipt } from "./operations.mjs";

const objectSchema = { type: "object", additionalProperties: false };
const endpointProperty = { type: "string", description: "Optional loopback ws:// or wss:// OBS endpoint. Credentials are forbidden." };

export const TOOLS = [
  {
    name: "inspect",
    description: "Inspect OBS versions, capabilities, scenes, inputs, and video settings without changing OBS.",
    inputSchema: { ...objectSchema, properties: { endpoint: endpointProperty } },
  },
  {
    name: "apply_scene_plan",
    description: "Apply a reversible plan limited to ensuring scenes and inputs, verify native state, and seal a receipt.",
    inputSchema: {
      ...objectSchema,
      properties: {
        endpoint: endpointProperty,
        planId: { type: "string", minLength: 1, maxLength: 160 },
        actions: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            oneOf: [
              { type: "object", additionalProperties: false, properties: { type: { const: "ensure_scene" }, sceneName: { type: "string" } }, required: ["type", "sceneName"] },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  type: { const: "ensure_input" },
                  sceneName: { type: "string" },
                  inputName: { type: "string" },
                  inputKind: { type: "string" },
                  inputSettings: { type: "object" },
                  sceneItemEnabled: { type: "boolean" },
                },
                required: ["type", "sceneName", "inputName", "inputKind", "inputSettings", "sceneItemEnabled"],
              },
            ],
          },
        },
      },
      required: ["planId", "actions"],
    },
  },
  {
    name: "rollback_receipt",
    description: "Remove only resources created by one verified OBS Bridge receipt and verify restoration.",
    inputSchema: { ...objectSchema, properties: { endpoint: endpointProperty, receiptId: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" } }, required: ["receiptId"] },
  },
];

const handlers = { inspect: inspectObs, apply_scene_plan: applyScenePlan, rollback_receipt: rollbackReceipt };

function errorResponse(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message: String(message).slice(0, 2000) } };
}

export async function handleRpc(message, options = {}) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return errorResponse(message?.id, -32600, "Invalid Request");
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return null;
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "obs-bridge", title: "OBS Bridge", version: "0.1.2" },
      },
    };
  }
  if (message.method === "ping") return { jsonrpc: "2.0", id: message.id, result: {} };
  if (message.method === "tools/list") return { jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } };
  if (message.method !== "tools/call") return errorResponse(message.id, -32601, "Method not found");
  const toolName = message.params?.name;
  const handler = handlers[toolName];
  if (!handler) return errorResponse(message.id, -32602, `Unknown tool: ${toolName || "missing"}`);
  try {
    const result = await handler(message.params?.arguments || {}, options);
    const isError = ["rolled-back", "manual-recovery-required"].includes(result.status) && result.classification !== "explicit-rollback";
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        isError,
      },
    };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        content: [{ type: "text", text: JSON.stringify({ status: "rejected", error: error.message }) }],
        structuredContent: { status: "rejected", error: error.message },
        isError: true,
      },
    };
  }
}

export function startStdio() {
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
        try {
          response = await handleRpc(JSON.parse(line));
        } catch (error) {
          response = errorResponse(null, -32700, `Parse error: ${error.message}`);
        }
        if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
      })();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startStdio();
