import test from "node:test";
import assert from "node:assert/strict";
import { entitlementView, hmacHex, verifyStripeSignature } from "../src/domain.mjs";

test("entitlement modes implement no-card trial, paid, grace, and recovery", () => {
  const now = new Date("2026-08-30T12:00:00Z");
  assert.equal(entitlementView({ trial: { ends_at: "2026-08-31T12:00:00Z" } }, now).mode, "trial");
  assert.equal(entitlementView({ subscription: { plan: "monthly", status: "active", paid_through: "2026-09-30T12:00:00Z" } }, now).mode, "paid");
  assert.equal(entitlementView({ subscription: { plan: "annual", status: "canceled", paid_through: "2026-08-29T12:00:00Z", grace_through: "2026-09-28T12:00:00Z" } }, now).mode, "grace");
  assert.equal(entitlementView({ subscription: { plan: null, status: "active", paid_through: "2026-09-30T12:00:00Z" } }, now).mode, "recovery");
  const recovery = entitlementView({}, now); assert.equal(recovery.mode, "recovery"); assert.equal(recovery.mutating, false); assert.ok(recovery.preserved.includes("remove"));
});

test("Stripe signature verification checks timestamp and body", async () => {
  const body = "{\"id\":\"evt_1\"}"; const secret = "test-signing-value"; const timestamp = 1000;
  const signature = await hmacHex(`${timestamp}.${body}`, secret);
  assert.equal(await verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, secret, timestamp), true);
  assert.equal(await verifyStripeSignature(body + "x", `t=${timestamp},v1=${signature}`, secret, timestamp), false);
  assert.equal(await verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, secret, timestamp + 301), false);
});
