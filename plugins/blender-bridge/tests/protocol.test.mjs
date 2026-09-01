import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Coordinator } from "../mcp/coordinator.mjs";
import { handleRpc, TOOLS } from "../mcp/server.mjs";
import { PROTOCOL } from "../mcp/protocol.mjs";

test("MCP initialization and sixteen tools", async () => {
  const runtime = { stateRoot: mkdtempSync(path.join(os.tmpdir(), "blender-protocol-")), coordinator: { start: async () => {} } };
  const init = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, runtime);
  assert.equal(init.result.serverInfo.name, "blender-bridge"); assert.equal(init.result.serverInfo.version, "0.2.0");
  const list = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, runtime); assert.equal(list.result.tools.length, 16); assert.deepEqual(list.result.tools, TOOLS);
  const unknown = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "execute_python" } }, runtime); assert.equal(unknown.error.code, -32602);
});
test("loopback rejects authentication and isolates project queues", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "blender-coordinator-")); const coordinator = new Coordinator({ stateRoot: root, timeoutMs: 1000 }); await coordinator.start();
  try {
    const unauthorized = await fetch(`${coordinator.endpoint}/v1/connect`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }); assert.equal(unauthorized.status, 401);
    const headers = { authorization: `Bearer ${coordinator.token}`, "content-type": "application/json" };
    const a = path.join(root, "a.blend"); const b = path.join(root, "b.blend");
    assert.equal((await fetch(`${coordinator.endpoint}/v1/connect`, { method: "POST", headers, body: JSON.stringify({ protocol: PROTOCOL, projectFile: a }) })).status, 200);
    const pending = coordinator.dispatch(a, "inspect", {});
    const wrong = await fetch(`${coordinator.endpoint}/v1/jobs/next?projectFile=${encodeURIComponent(b)}`, { headers }); assert.equal(wrong.status, 204);
    const next = await fetch(`${coordinator.endpoint}/v1/jobs/next?projectFile=${encodeURIComponent(a)}`, { headers }); const job = await next.json();
    await fetch(`${coordinator.endpoint}/v1/jobs/${job.requestId}/complete`, { method: "POST", headers, body: JSON.stringify({ status: "ok" }) }); assert.equal((await pending).status, "ok");
  } finally { await coordinator.close(); }
});
