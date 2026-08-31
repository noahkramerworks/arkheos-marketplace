import test from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler, listTools } from "../mcp/handler.mjs";

test("handler exposes the exact semantic tool catalog", () => {
  assert.deepEqual(listTools().map((tool) => tool.name), ["catalog_inspect", "account_status", "authorization_begin", "authorization_poll", "trial_activate", "checkout_create", "portal_create", "install_prepare", "install_execute", "update_prepare", "update_execute", "installation_verify", "installation_export", "installation_rollback", "product_remove", "receipt_inspect", "sign_out", "state_purge"]);
  assert.ok(listTools().every((tool) => tool.title && tool.description && tool.inputSchema));
});

test("initialize and bounded account status work through injected adapters", async () => {
  const api = { accountStatus: async () => ({ authorized: false, entitlement: { mode: "recovery", mutating: false } }) };
  const state = { receiptList: async () => [], receipt: async () => null };
  const handler = createMcpHandler({ state, api, operations: {} });
  const init = await handler({ method: "initialize" }); assert.deepEqual(init.serverInfo, { name: "arkheos", version: "0.1.2" });
  const response = await handler({ method: "tools/call", params: { name: "account_status", arguments: {} } });
  assert.equal(response.structuredContent.entitlement.mode, "recovery"); assert.equal(response.isError, undefined);
});
