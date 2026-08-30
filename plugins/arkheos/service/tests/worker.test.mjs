import test from "node:test";
import assert from "node:assert/strict";
import { route } from "../src/index.mjs";
import { EVENTS, stripeProjection } from "../src/stripe.mjs";

function env() { return { STRIPE_WEBHOOK_SECRET: "test-signing-value", PUBLIC_ORIGIN: "https://api.arkheos.ai", ACCOUNT_ORIGIN: "https://account.arkheos.ai", SITE_ORIGIN: "https://arkheos.ai", CONFIG: { get: async () => null }, ASSETS: { fetch: async () => new Response("asset", { status: 404 }) }, DB: { prepare: () => { throw new Error("DB must not be touched for invalid signature"); } } }; }

test("health identifies ArkheOS 0.1.0", async () => {
  const response = await route(new Request("https://api.arkheos.ai/health"), env()); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: "ok", service: "ArkheOS", version: "0.1.0" });
});

test("customer account entry routes serve the account application", async () => {
  const fetched = [];
  const environment = env();
  environment.ASSETS = { fetch: async (request) => { fetched.push(new URL(request.url).pathname); return new Response("account", { status: 200 }); } };
  for (const path of ["/", "/account", "/device?code=ARKHEOS", "/welcome?session_id=example"]) {
    const response = await route(new Request(`https://account.arkheos.ai${path}`), environment);
    assert.equal(response.status, 200);
  }
  assert.deepEqual(fetched, ["/account.html", "/account.html", "/account.html", "/account.html"]);
});

test("canonical and legacy webhook paths use the same pre-write signature gate", async () => {
  for (const path of ["/v1/billing/webhook", "/v1/stripe/webhook"]) {
    const response = await route(new Request(`https://api.arkheos.ai${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), env());
    assert.equal(response.status, 400); assert.equal((await response.json()).code, "INVALID_SIGNATURE");
  }
});

test("the observed seven Stripe events are the only admitted set", () => {
  assert.deepEqual([...EVENTS].sort(), ["checkout.session.completed", "customer.subscription.created", "customer.subscription.deleted", "customer.subscription.trial_will_end", "customer.subscription.updated", "invoice.paid", "invoice.payment_failed"].sort());
  assert.equal(stripeProjection({ id: "evt", type: "unknown.event", data: { object: {} } }).relevant, false);
});
