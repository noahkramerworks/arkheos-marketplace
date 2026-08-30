import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { hmacHex } from "../src/domain.mjs";
import { route } from "../src/index.mjs";

function d1() {
  const database = new DatabaseSync(":memory:");
  const prepare = (sql) => ({
    bind: (...values) => ({
      first: async () => database.prepare(sql).get(...values) || null,
      run: async () => { const result = database.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; }
    })
  });
  return { database, prepare, batch: async (statements) => { const results = []; for (const statement of statements) results.push(await statement.run()); return results; } };
}

async function signedRequest(path, event, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const body = JSON.stringify(event); const signature = await hmacHex(`${timestamp}.${body}`, secret);
  return new Request(`https://api.arkheos.ai${path}`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` }, body });
}

test("Stripe checkout, subscription, invoice, and duplicate events project onto the verified account", async () => {
  const DB = d1();
  DB.database.exec(await readFile(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8"));
  DB.database.exec(await readFile(new URL("../migrations/0002_arkheos_membership.sql", import.meta.url), "utf8"));
  DB.database.prepare("INSERT INTO customers (id,email_hash,account_subject,verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("account:verified", "hash", "email:hash", "2026-08-30T00:00:00.000Z", "2026-08-30T00:00:00.000Z", "2026-08-30T00:00:00.000Z");
  const env = { DB, STRIPE_WEBHOOK_SECRET: "test-signing-value", STRIPE_MONTHLY_PRICE_ID: "price_monthly", STRIPE_ANNUAL_PRICE_ID: "price_annual", PUBLIC_ORIGIN: "https://api.arkheos.ai", ACCOUNT_ORIGIN: "https://account.arkheos.ai", SITE_ORIGIN: "https://arkheos.ai", ASSETS: { fetch: async () => new Response("asset", { status: 404 }) }, CONFIG: { get: async () => null } };
  const checkout = { id: "evt_checkout", type: "checkout.session.completed", data: { object: { customer: "cus_1", subscription: "sub_1", metadata: { arkheos_customer_id: "account:verified", arkheos_plan: "monthly" } } } };
  assert.equal((await route(await signedRequest("/v1/billing/webhook", checkout, env.STRIPE_WEBHOOK_SECRET), env)).status, 200);
  assert.equal(DB.database.prepare("SELECT stripe_customer_id FROM customers WHERE id=?").get("account:verified").stripe_customer_id, "cus_1");
  const subscription = { id: "evt_subscription", type: "customer.subscription.created", data: { object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { arkheos_customer_id: "account:verified", arkheos_plan: "monthly" }, items: { data: [{ price: { id: "price_monthly" }, current_period_end: 1800000000 }] } } } };
  const first = await route(await signedRequest("/v1/billing/webhook", subscription, env.STRIPE_WEBHOOK_SECRET), env); assert.equal((await first.json()).duplicate, false);
  const duplicate = await route(await signedRequest("/v1/billing/webhook", subscription, env.STRIPE_WEBHOOK_SECRET), env); assert.equal((await duplicate.json()).duplicate, true);
  const row = DB.database.prepare("SELECT customer_id,plan,status FROM subscriptions WHERE stripe_subscription_id=?").get("sub_1");
  assert.equal(row.customer_id, "account:verified"); assert.equal(row.plan, "monthly"); assert.equal(row.status, "active");
  assert.equal(DB.database.prepare("SELECT COUNT(*) AS count FROM webhook_events WHERE id=?").get("evt_subscription").count, 1);
  const failed = { id: "evt_invoice_failed", type: "invoice.payment_failed", data: { object: { customer: "cus_1", subscription: "sub_1", lines: { data: [{ type: "subscription", period: { end: 1800000000 } }] } } } };
  await route(await signedRequest("/v1/stripe/webhook", failed, env.STRIPE_WEBHOOK_SECRET), env);
  const failedRow = DB.database.prepare("SELECT status,grace_through FROM subscriptions WHERE stripe_subscription_id=?").get("sub_1"); assert.equal(failedRow.status, "past_due"); assert.ok(failedRow.grace_through);
});
