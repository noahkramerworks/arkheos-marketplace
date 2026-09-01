import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { ObsClient, authResponse } from "../mcp/obs-client.mjs";
import { handleRpc, TOOLS } from "../mcp/server.mjs";

class FakeWebSocket {
  constructor(_endpoint) {
    this.listeners = new Map();
    this.sent = [];
    queueMicrotask(() => this.emit("message", { data: JSON.stringify({ op: 0, d: { obsStudioVersion: "32.2.1", obsWebSocketVersion: "5.7.4", rpcVersion: 1, authentication: { salt: "salt", challenge: "challenge" } } }) }));
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  emit(name, event) { for (const listener of this.listeners.get(name) || []) listener(event); }

  send(text) {
    const message = JSON.parse(text);
    this.sent.push(message);
    if (message.op === 1) queueMicrotask(() => this.emit("message", { data: JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }) }));
    if (message.op === 6) {
      const delay = message.d.requestType === "Slow" ? 5 : 0;
      setTimeout(() => this.emit("message", { data: JSON.stringify({ op: 7, d: { requestType: message.d.requestType, requestId: message.d.requestId, requestStatus: { result: true, code: 100 }, responseData: { echoed: message.d.requestType } } }) }), delay);
    }
  }

  close() { this.emit("close", { code: 1000 }); }
}

test("OBS 5.x authentication and concurrent request correlation", async () => {
  const client = new ObsClient({ endpoint: "ws://127.0.0.1:4455", password: "pw", WebSocketImpl: FakeWebSocket, timeoutMs: 500 });
  await client.connect();
  const secret = createHash("sha256").update("pwsalt").digest("base64");
  const expected = createHash("sha256").update(`${secret}challenge`).digest("base64");
  assert.equal(authResponse("pw", "salt", "challenge"), expected);
  assert.equal(client.socket.sent[0].d.authentication, expected);
  const [slow, fast] = await Promise.all([client.call("Slow"), client.call("Fast")]);
  assert.deepEqual(slow, { echoed: "Slow" });
  assert.deepEqual(fast, { echoed: "Fast" });
  client.close();
});

test("authentication fails closed when the password is absent", async () => {
  const client = new ObsClient({ endpoint: "ws://127.0.0.1:4455", WebSocketImpl: FakeWebSocket, timeoutMs: 500 });
  await assert.rejects(client.connect(), /OBS_WEBSOCKET_PASSWORD/);
  client.close();
});

test("MCP server exposes exactly three tools and bounded protocol errors", async () => {
  const initialized = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(initialized.result.serverInfo.name, "obs-bridge");
  assert.equal(initialized.result.serverInfo.version, "0.2.0");
  const listed = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["inspect", "apply_scene_plan", "rollback_receipt"]);
  assert.equal(TOOLS.length, 3);
  const unknown = await handleRpc({ jsonrpc: "2.0", id: 3, method: "not/a/method" });
  assert.equal(unknown.error.code, -32601);
  const unknownTool = await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "raw_rpc", arguments: {} } });
  assert.equal(unknownTool.error.code, -32602);
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
});
