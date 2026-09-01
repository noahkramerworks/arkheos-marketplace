import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { API_VERSION, APPLICATION_VERSION, BRIDGE_VERSION, Coordinator, PROTOCOL, SDK_COMMIT } from "../mcp/coordinator.mjs";
import { handleRpc, TOOLS } from "../mcp/server.mjs";

test("MCP handshake and tool catalog are deterministic", async () => {
  const coordinator = { start: async () => {}, close: async () => {} }; const runtime = { stateRoot: "unused", coordinator };
  const initialized = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, runtime);
  assert.equal(initialized.result.serverInfo.name, "reaper-bridge");
  const listed = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, runtime); assert.deepEqual(listed.result.tools.map((tool) => tool.name), TOOLS.map((tool) => tool.name));
  const unknown = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "raw_rpc", arguments: {} } }, runtime); assert.equal(unknown.error.code, -32602);
});

test("coordinator rejects unauthenticated and malformed native connections", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "reaper-bridge-protocol-")); const coordinator = new Coordinator({ stateRoot: temp }); await coordinator.start();
  try {
    assert.equal((await fetch(`${coordinator.endpoint}/v1/connect`, { method: "POST", body: "{}" })).status, 401);
    const malformed = await fetch(`${coordinator.endpoint}/v1/connect`, { method: "POST", headers: { authorization: `Bearer ${coordinator.token}`, "content-type": "application/json" }, body: JSON.stringify({ protocol: "wrong", pid: 4 }) }); assert.equal(malformed.status, 400);
    const wrongVersion = await fetch(`${coordinator.endpoint}/v1/connect`, { method: "POST", headers: { authorization: `Bearer ${coordinator.token}`, "content-type": "application/json" }, body: JSON.stringify({ protocol: PROTOCOL, pid: 4, applicationVersion: APPLICATION_VERSION, bridgeVersion: "0.1.0", apiVersion: API_VERSION, sdkCommit: SDK_COMMIT }) }); assert.equal(wrongVersion.status, 400);
    const accepted = await fetch(`${coordinator.endpoint}/v1/connect`, { method: "POST", headers: { authorization: `Bearer ${coordinator.token}`, "content-type": "application/json" }, body: JSON.stringify({ protocol: PROTOCOL, pid: 4, applicationVersion: APPLICATION_VERSION, bridgeVersion: BRIDGE_VERSION, apiVersion: API_VERSION, sdkCommit: SDK_COMMIT }) }); assert.equal(accepted.status, 200);
  } finally { await coordinator.close(); rmSync(temp, { recursive: true, force: true }); }
});
