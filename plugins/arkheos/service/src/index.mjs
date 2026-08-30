import { catalog } from "./catalog.mjs";
import { entitlementView, input, json, now, secureToken } from "./domain.mjs";
import { approveDevice, deviceCode, metadata, principal, registerClient, token } from "./oauth.mjs";
import { artifact, release } from "./releases.mjs";
import { handleStripeWebhook } from "./stripe.mjs";

async function membership(env, customerId) {
  const [trial, subscription] = await Promise.all([
    env.DB.prepare("SELECT started_at,ends_at FROM account_trials WHERE customer_id=?").bind(customerId).first(),
    env.DB.prepare("SELECT plan,status,current_period_ends_at,paid_through,grace_through FROM subscriptions WHERE customer_id=? ORDER BY updated_at DESC LIMIT 1").bind(customerId).first()
  ]);
  return entitlementView({ trial, subscription });
}

async function requirePrincipal(request, env) {
  const member = await principal(request, env);
  return member || null;
}

async function activateTrial(request, env) {
  const member = await requirePrincipal(request, env); if (!member) return json({ code: "AUTHORIZATION_REQUIRED" }, 401);
  const customer = await env.DB.prepare("SELECT id,verified_at FROM customers WHERE id=?").bind(member.customer_id).first();
  if (!customer?.verified_at) return json({ code: "VERIFIED_ACCOUNT_REQUIRED" }, 403);
  const timestamp = now(); const ends = new Date(Date.parse(timestamp) + 7 * 86400000).toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO account_trials (customer_id,started_at,ends_at,created_at) VALUES (?,?,?,?)").bind(customer.id, timestamp, ends, timestamp).run();
  return json(await membership(env, customer.id));
}

async function stripePost(env, path, form, idempotencyKey) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) }, body: new URLSearchParams(form) });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error("STRIPE_UNAVAILABLE"), { status: 502 });
  return value;
}

async function ensureStripeCustomer(env, customer) {
  if (customer.stripe_customer_id) return customer.stripe_customer_id;
  const created = await stripePost(env, "customers", { "metadata[arkheos_customer_id]": customer.id }, `customer-${customer.id}`);
  await env.DB.prepare("UPDATE customers SET stripe_customer_id=?,updated_at=? WHERE id=? AND stripe_customer_id IS NULL").bind(created.id, now(), customer.id).run();
  return created.id;
}

async function checkout(request, env) {
  const member = await requirePrincipal(request, env); if (!member) return json({ code: "AUTHORIZATION_REQUIRED" }, 401);
  const value = await input(request); if (!new Set(["monthly", "annual"]).has(value.plan)) return json({ code: "INVALID_PLAN" }, 400);
  const price = value.plan === "monthly" ? env.STRIPE_MONTHLY_PRICE_ID : env.STRIPE_ANNUAL_PRICE_ID;
  if (!/^price_[A-Za-z0-9]+$/u.test(price || "")) return json({ code: "PRICE_NOT_CONFIGURED" }, 503);
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(value.installationId || "")) return json({ code: "INVALID_INSTALLATION" }, 400);
  const customer = await env.DB.prepare("SELECT id,stripe_customer_id FROM customers WHERE id=? AND verified_at IS NOT NULL").bind(member.customer_id).first();
  if (!customer) return json({ code: "VERIFIED_ACCOUNT_REQUIRED" }, 403);
  const stripeCustomer = await ensureStripeCustomer(env, customer);
  const key = `checkout-${customer.id}-${value.plan}-${value.installationId}`;
  const session = await stripePost(env, "checkout/sessions", { mode: "subscription", customer: stripeCustomer, "line_items[0][price]": price, "line_items[0][quantity]": "1", client_reference_id: value.installationId, success_url: `${env.ACCOUNT_ORIGIN}/welcome?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${env.SITE_ORIGIN}/#membership`, allow_promotion_codes: "false", "metadata[arkheos_customer_id]": customer.id, "metadata[arkheos_plan]": value.plan, "subscription_data[metadata][arkheos_customer_id]": customer.id, "subscription_data[metadata][arkheos_plan]": value.plan }, key);
  await env.DB.prepare("INSERT OR IGNORE INTO checkout_requests (idempotency_key,customer_id,plan,stripe_session_id,created_at) VALUES (?,?,?,?,?)").bind(key, customer.id, value.plan, session.id, now()).run();
  return json({ url: session.url, expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null, plan: value.plan });
}

async function portal(request, env) {
  const member = await requirePrincipal(request, env); if (!member) return json({ code: "AUTHORIZATION_REQUIRED" }, 401);
  const customer = await env.DB.prepare("SELECT id,stripe_customer_id FROM customers WHERE id=?").bind(member.customer_id).first();
  if (!customer?.stripe_customer_id) return json({ code: "NO_BILLING_CUSTOMER" }, 409);
  const session = await stripePost(env, "billing_portal/sessions", { customer: customer.stripe_customer_id, return_url: `${env.ACCOUNT_ORIGIN}/` }, `portal-${customer.id}-${Date.now()}`);
  await env.DB.prepare("INSERT INTO portal_requests (id,customer_id,stripe_session_id,created_at) VALUES (?,?,?,?)").bind(secureToken(18), customer.id, session.id, now()).run();
  return json({ url: session.url });
}

function cors(response, request, env) {
  const origin = request.headers.get("origin"); const allowed = new Set([env.SITE_ORIGIN, env.ACCOUNT_ORIGIN]);
  if (!origin || !allowed.has(origin)) return response;
  const headers = new Headers(response.headers); headers.set("access-control-allow-origin", origin); headers.set("access-control-allow-headers", "authorization, content-type, x-arkheos-account-assertion"); headers.set("access-control-allow-methods", "GET, POST, OPTIONS"); headers.set("vary", "origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function route(request, env) {
  const url = new URL(request.url); const path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (path === "/health" && request.method === "GET") return json({ status: "ok", service: "ArkheOS", version: "0.1.0" });
  if (path === "/v1/catalog" && request.method === "GET") return catalog(env);
  if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-authorization-server") return metadata(path, env);
  if (path === "/oauth/register" && request.method === "POST") return registerClient(request, env);
  if (path === "/oauth/token" && request.method === "POST") return token(request, env);
  if (path === "/v1/device/code" && request.method === "POST") return deviceCode(request, env);
  if (path === "/v1/device/approve" && request.method === "POST") return approveDevice(request, env);
  if (path === "/v1/trial" && request.method === "POST") return activateTrial(request, env);
  if (path === "/v1/billing/checkout" && request.method === "POST") return checkout(request, env);
  if (path === "/v1/billing/portal" && request.method === "POST") return portal(request, env);
  if ((path === "/v1/billing/webhook" || path === "/v1/stripe/webhook") && request.method === "POST") return handleStripeWebhook(request, env);
  if (path === "/v1/entitlement" && request.method === "GET") { const member = await requirePrincipal(request, env); return member ? json(await membership(env, member.customer_id)) : json({ code: "AUTHORIZATION_REQUIRED" }, 401); }
  const releaseMatch = path.match(/^\/v1\/products\/([a-z0-9][a-z0-9-]{0,63})\/releases\/(stable)$/u);
  if (releaseMatch && request.method === "GET") { const member = await requirePrincipal(request, env); return member ? release(env, releaseMatch[1], releaseMatch[2]) : json({ code: "AUTHORIZATION_REQUIRED" }, 401); }
  const artifactMatch = path.match(/^\/v1\/artifacts\/([a-f0-9]{64})$/u);
  if (artifactMatch && request.method === "GET") { const member = await requirePrincipal(request, env); return member ? artifact(request, env, artifactMatch[1], await membership(env, member.customer_id)) : json({ code: "AUTHORIZATION_REQUIRED" }, 401); }
  if (request.method === "GET" && url.hostname === "account.arkheos.ai" && path === "/") return env.ASSETS.fetch(new Request(new URL("/account.html", request.url), request));
  return env.ASSETS.fetch(request);
}

export default { async fetch(request, env) { try { return cors(await route(request, env), request, env); } catch (error) { console.error(JSON.stringify({ event: "request_error", code: error?.message === "REQUEST_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INTERNAL_ERROR" })); return cors(json({ code: error?.message || "INTERNAL_ERROR" }, error?.status || (error?.message === "REQUEST_TOO_LARGE" ? 413 : 500)), request, env); } } };

export { membership, route };
