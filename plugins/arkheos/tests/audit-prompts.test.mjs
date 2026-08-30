import test from "node:test";
import assert from "node:assert/strict";
import { ArkheosApi } from "../mcp/core/api.mjs";
import { createMcpHandler } from "../mcp/handler.mjs";

function unauthenticatedApi() {
  const state = { readAuth: async () => null };
  return new ArkheosApi({ state, transport: async () => { throw new Error("transport must not be called without authorization"); }, now: () => new Date("2026-08-30T12:00:00.000Z") });
}

test("audit positive prompts return bounded catalog and recovery account views", async () => {
  const catalog = { schema: "arkheos.catalog/v1", revision: "test-revision", expiresAt: "2099-01-01T00:00:00.000Z", products: [{ id: "stream-showrunner", version: "0.1.0" }] };
  const api = { catalog: async () => ({ catalog, verification: { valid: true, digest: "a".repeat(64), keyId: "test" } }), accountStatus: async () => ({ authorized: false, entitlement: { mode: "recovery", mutating: false } }) };
  const handler = createMcpHandler({ state: { receiptList: async () => [] }, api, operations: {} });
  const catalogResult = await handler({ method: "tools/call", params: { name: "catalog_inspect", arguments: { product: "stream-showrunner" } } });
  const statusResult = await handler({ method: "tools/call", params: { name: "account_status", arguments: {} } });
  assert.equal(catalogResult.structuredContent.products[0].id, "stream-showrunner"); assert.equal(statusResult.structuredContent.entitlement.mode, "recovery");
});

test("audit negative prompts reject unknown tools and unadmitted billing plans", async () => {
  const api = unauthenticatedApi();
  await assert.rejects(() => api.checkout("weekly"), /monthly or annual/u);
  const handler = createMcpHandler({ state: {}, api, operations: {} });
  const result = await handler({ method: "tools/call", params: { name: "shell_execute", arguments: { command: "anything" } } });
  assert.equal(result.isError, true); assert.equal(result.structuredContent.code, "UNKNOWN_TOOL");
});

test("audit missing-context prompts degrade to recovery and refuse paid mutation", async () => {
  const api = unauthenticatedApi();
  const status = await api.accountStatus(); assert.equal(status.authorized, false); assert.equal(status.entitlement.mode, "recovery"); assert.equal(status.entitlement.mutating, false);
  await assert.rejects(() => api.activateTrial(), /Authorization required/u);
});

test("audit failure prompts sanitize secret-shaped error output", async () => {
  const api = { checkout: async () => { throw new Error("upstream rejected whsec_should_never_escape"); } };
  const handler = createMcpHandler({ state: {}, api, operations: {} });
  const result = await handler({ method: "tools/call", params: { name: "checkout_create", arguments: { plan: "monthly" } } });
  assert.equal(result.isError, true); assert.doesNotMatch(result.content[0].text, /whsec_should_never_escape/u); assert.match(result.content[0].text, /\[redacted\]/u);
});
