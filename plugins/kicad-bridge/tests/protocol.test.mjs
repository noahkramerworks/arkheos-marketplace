import test from "node:test";
import assert from "node:assert/strict";
import { handleRpc, TOOLS } from "../mcp/server.mjs";

test("MCP handshake and six-tool catalog are deterministic", async () => {
  const initialized = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, {}); assert.equal(initialized.result.serverInfo.name, "kicad-bridge"); assert.equal(initialized.result.serverInfo.version, "0.1.0");
  const listed = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, {}); assert.deepEqual(listed.result.tools.map((tool) => tool.name), TOOLS.map((tool) => tool.name));
  const unknown = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "raw_rpc", arguments: {} } }, {}); assert.equal(unknown.error.code, -32602);
});
