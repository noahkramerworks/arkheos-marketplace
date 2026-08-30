import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ArkheosState } from "../mcp/core/state.mjs";

const dpapi = { protect: (value) => Buffer.from(value).reverse(), unprotect: (value) => Buffer.from(value).reverse() };

test("state stores auth opaquely and receipts immutably", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "arkheos-state-")); t.after(() => rm(root, { recursive: true, force: true }));
  const state = new ArkheosState({ root, dpapi }); await state.initialize();
  await state.writeAuth({ tokens: { accessToken: "opaque-test-value", refreshToken: "another-test-value" } });
  const bytes = await readFile(path.join(root, "auth.json"), "utf8"); assert.doesNotMatch(bytes, /opaque-test-value|another-test-value/u);
  assert.equal((await state.readAuth()).tokens.accessToken, "opaque-test-value");
  const receipt = await state.writeReceipt({ operation: "verify", product: "demo", status: "verified", stages: [] });
  assert.equal((await state.receipt(receipt.id)).id, receipt.id);
});
