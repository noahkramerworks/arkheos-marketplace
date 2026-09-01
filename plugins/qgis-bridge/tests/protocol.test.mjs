import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { API_VERSION, APPLICATION_VERSION, BRIDGE_VERSION, Coordinator, PROTOCOL } from "../mcp/coordinator.mjs";
import { handleRpc, TOOLS } from "../mcp/server.mjs";

test("MCP handshake and six-tool catalog are deterministic", async () => {
  const coordinator = { start: async () => {}, close: async () => {} }; const runtime = { stateRoot: "unused", coordinator };
  const initialized = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, runtime); assert.equal(initialized.result.serverInfo.name, "qgis-bridge");
  const listed = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, runtime); assert.deepEqual(listed.result.tools.map((tool) => tool.name), TOOLS.map((tool) => tool.name));
  const unknown = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "raw_rpc", arguments: {} } }, runtime); assert.equal(unknown.error.code, -32602);
});
test("coordinator rejects missing auth and native identity drift", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "qgis-protocol-")); const coordinator = new Coordinator({ stateRoot: temp }); await coordinator.start();
  try {
    assert.equal((await fetch(`${coordinator.endpoint}/v1/connect`, { method: "POST", body: "{}" })).status, 401);
    const headers = { authorization: `Bearer ${coordinator.token}`, "content-type": "application/json" };
    const bad = await fetch(`${coordinator.endpoint}/v1/connect`, { method: "POST", headers, body: JSON.stringify({ protocol: PROTOCOL, pid: 1, applicationVersion: "4.1.0", versionInt: 40100, bridgeVersion: BRIDGE_VERSION, apiVersion: API_VERSION }) }); assert.equal(bad.status, 400);
    const good = await fetch(`${coordinator.endpoint}/v1/connect`, { method: "POST", headers, body: JSON.stringify({ protocol: PROTOCOL, pid: 1, applicationVersion: APPLICATION_VERSION, versionInt: 40200, bridgeVersion: BRIDGE_VERSION, apiVersion: API_VERSION }) }); assert.equal(good.status, 200);
  } finally { await coordinator.close(); rmSync(temp, { recursive: true, force: true }); }
});

