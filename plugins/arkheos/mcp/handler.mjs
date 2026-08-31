import { ArkheosApi } from "./core/api.mjs";
import { ArkheosOperations } from "./core/operations.mjs";
import { ArkheosState } from "./core/state.mjs";

const productProperty = { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,63}$" };
const digestProperty = { type: "string", pattern: "^[a-f0-9]{64}$" };

const tools = [
  ["catalog_inspect", "Inspect the signed ArkheOS catalog", "Read the verified product catalog without mutation.", { type: "object", properties: { product: productProperty }, additionalProperties: false }, true],
  ["account_status", "Inspect ArkheOS membership", "Read local authorization and current remote entitlement without exposing tokens.", { type: "object", properties: {}, additionalProperties: false }, true],
  ["authorization_begin", "Begin ArkheOS authorization", "Create a bounded device authorization and return only its verification URL and user code.", { type: "object", properties: {}, additionalProperties: false }, false],
  ["authorization_poll", "Check ArkheOS authorization", "Poll one locally protected pending device authorization and store tokens outside model context.", { type: "object", properties: {}, additionalProperties: false }, false],
  ["trial_activate", "Activate the no-card ArkheOS trial", "Activate the one-time seven-day no-card trial for the authorized verified account.", { type: "object", properties: {}, additionalProperties: false }, false],
  ["checkout_create", "Create ArkheOS checkout", "Create hosted checkout for exactly the monthly or annual membership.", { type: "object", required: ["plan"], properties: { plan: { enum: ["monthly", "annual"] } }, additionalProperties: false }, false],
  ["portal_create", "Open ArkheOS billing management", "Create a hosted Stripe Customer Portal session for the authorized account.", { type: "object", properties: {}, additionalProperties: false }, false],
  ["install_prepare", "Prepare a signed ArkheOS installation", "Bind one exact signed release, artifact, local pre-state, and rollback disposition without installing.", { type: "object", required: ["product"], properties: { product: productProperty, version: { type: "string" }, channel: { const: "stable" } }, additionalProperties: false }, true],
  ["install_execute", "Install the prepared ArkheOS product", "Execute one unexpired single-use signed installation plan through the exact Codex marketplace lifecycle.", { type: "object", required: ["planId", "expectedDigest", "confirm"], properties: { planId: { type: "string" }, expectedDigest: digestProperty, confirm: { const: true } }, additionalProperties: false }, false],
  ["update_prepare", "Prepare a signed ArkheOS update", "Bind one installed product to an exact signed target release and rollback disposition.", { type: "object", required: ["product"], properties: { product: productProperty, version: { type: "string" }, channel: { const: "stable" } }, additionalProperties: false }, true],
  ["update_execute", "Apply the prepared ArkheOS update", "Execute one unexpired single-use signed update plan.", { type: "object", required: ["planId", "expectedDigest", "confirm"], properties: { planId: { type: "string" }, expectedDigest: digestProperty, confirm: { const: true } }, additionalProperties: false }, false],
  ["installation_verify", "Verify an ArkheOS installation", "Verify retained signed archive identity and report cache and fresh-task stages separately.", { type: "object", required: ["product"], properties: { product: productProperty }, additionalProperties: false }, true],
  ["installation_export", "Export an ArkheOS recovery artifact", "Create a content-addressed recovery export under protected ArkheOS state.", { type: "object", required: ["product"], properties: { product: productProperty }, additionalProperties: false }, false],
  ["installation_rollback", "Roll back an ArkheOS installation", "Roll back the exact current eligible installation receipt.", { type: "object", required: ["receiptId"], properties: { receiptId: digestProperty }, additionalProperties: false }, false],
  ["product_remove", "Remove a managed ArkheOS product", "Remove only the exact named managed product through the native Codex lifecycle.", { type: "object", required: ["product"], properties: { product: productProperty }, additionalProperties: false }, false],
  ["receipt_inspect", "Inspect ArkheOS receipts", "Read one exact immutable receipt or list bounded receipt identities.", { type: "object", properties: { receiptId: digestProperty }, additionalProperties: false }, true],
  ["sign_out", "Sign out of ArkheOS locally", "Remove locally protected ArkheOS account tokens while preserving recovery state.", { type: "object", properties: {}, additionalProperties: false }, false],
  ["state_purge", "Purge safe ArkheOS local state", "Purge ArkheOS state only after all managed products are removed or exported.", { type: "object", required: ["confirm"], properties: { confirm: { const: true } }, additionalProperties: false }, false]
].map(([name, title, description, inputSchema, readOnly]) => ({ name, title, description, inputSchema, annotations: { readOnlyHint: readOnly, openWorldHint: !readOnly, destructiveHint: new Set(["installation_rollback", "product_remove", "state_purge"]).has(name) } }));

function result(value, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, ...(isError ? { isError: true } : {}) };
}

function safeError(error) {
  const message = String(error?.message || "ArkheOS operation failed")
    .replace(/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/gu, "[redacted]")
    .replace(/whsec_[A-Za-z0-9]+/gu, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, "Bearer [redacted]");
  return { schema: "arkheos.error/v1", code: error?.code || "ARKHEOS_ERROR", message, receipt: error?.receipt || null };
}

export function listTools() { return tools; }

export function createMcpHandler({ state, api, operations } = {}) {
  state ||= new ArkheosState();
  const trustedKeys = process.env.ARKHEOS_TRUSTED_KEYS_JSON ? JSON.parse(process.env.ARKHEOS_TRUSTED_KEYS_JSON) : {};
  api ||= new ArkheosApi({ state, trustedKeys });
  operations ||= new ArkheosOperations({ state, api });
  return async function handle(request) {
    if (request.method === "initialize") return { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "arkheos", version: "0.1.1" } };
    if (request.method === "ping") return {};
    if (request.method === "tools/list") return { tools };
    if (request.method !== "tools/call") throw Object.assign(new Error("Method not found"), { rpc: { code: -32601, message: "Method not found" } });
    const name = request.params?.name;
    const args = request.params?.arguments || {};
    try {
      switch (name) {
        case "catalog_inspect": {
          const { catalog, verification } = await api.catalog();
          const products = args.product ? catalog.products.filter((item) => item.id === args.product) : catalog.products;
          if (args.product && products.length !== 1) throw new Error("Catalog product not found");
          return result({ schema: "arkheos.catalog-inspection/v1", revision: catalog.revision, expiresAt: catalog.expiresAt, verification, products });
        }
        case "account_status": return result(await api.accountStatus());
        case "authorization_begin": return result(await api.authorizationBegin());
        case "authorization_poll": return result(await api.authorizationPoll());
        case "trial_activate": return result(await api.activateTrial());
        case "checkout_create": return result(await api.checkout(args.plan));
        case "portal_create": return result(await api.portal());
        case "install_prepare": return result(await operations.prepare({ kind: "install", ...args }));
        case "install_execute": return result(await operations.execute({ planId: args.planId, expectedDigest: args.expectedDigest, confirm: args.confirm }));
        case "update_prepare": return result(await operations.prepare({ kind: "update", ...args }));
        case "update_execute": return result(await operations.execute({ planId: args.planId, expectedDigest: args.expectedDigest, confirm: args.confirm }));
        case "installation_verify": return result(await operations.verify(args.product));
        case "installation_export": return result(await operations.export(args.product));
        case "installation_rollback": return result(await operations.rollback(args.receiptId));
        case "product_remove": return result(await operations.remove(args.product));
        case "receipt_inspect": return result(args.receiptId ? await state.receipt(args.receiptId) : { schema: "arkheos.receipt-list/v1", receipts: await state.receiptList() });
        case "sign_out": return result(await api.signOut());
        case "state_purge": if (args.confirm !== true) throw new Error("Purge confirmation is required"); else return result(await state.safePurge());
        default: throw Object.assign(new Error(`Unknown tool: ${name}`), { code: "UNKNOWN_TOOL" });
      }
    } catch (error) { return result(safeError(error), true); }
  };
}
