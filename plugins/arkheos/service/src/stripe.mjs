import { json, now, sha256Hex, verifyStripeSignature } from "./domain.mjs";

const EVENTS = new Set(["checkout.session.completed", "customer.subscription.created", "customer.subscription.deleted", "customer.subscription.trial_will_end", "customer.subscription.updated", "invoice.paid", "invoice.payment_failed"]);
const epoch = (value) => Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null;

export function stripeProjection(event) {
  if (!event || typeof event.id !== "string" || typeof event.type !== "string" || !event.data?.object) return null;
  if (!EVENTS.has(event.type)) return { eventId: event.id, type: event.type, relevant: false };
  const object = event.data.object;
  if (event.type === "checkout.session.completed") return { eventId: event.id, type: event.type, relevant: true, kind: "checkout", stripeCustomerId: typeof object.customer === "string" ? object.customer : object.customer?.id, subscriptionId: typeof object.subscription === "string" ? object.subscription : object.subscription?.id, arkheosCustomerId: object.metadata?.arkheos_customer_id || null, plan: object.metadata?.arkheos_plan || null };
  if (event.type.startsWith("customer.subscription.")) {
    const item = object.items?.data?.[0];
    return { eventId: event.id, type: event.type, relevant: true, kind: "subscription", stripeCustomerId: typeof object.customer === "string" ? object.customer : object.customer?.id, subscriptionId: object.id, priceId: item?.price?.id || null, status: event.type === "customer.subscription.deleted" ? "canceled" : object.status, paidThrough: epoch(item?.current_period_end || object.current_period_end), cancelAtPeriodEnd: Boolean(object.cancel_at_period_end), arkheosCustomerId: object.metadata?.arkheos_customer_id || null, plan: object.metadata?.arkheos_plan || null };
  }
  const line = object.lines?.data?.find((entry) => entry.type === "subscription") || object.lines?.data?.[0];
  return { eventId: event.id, type: event.type, relevant: true, kind: "invoice", stripeCustomerId: typeof object.customer === "string" ? object.customer : object.customer?.id, subscriptionId: typeof object.subscription === "string" ? object.subscription : object.subscription?.id, paid: event.type === "invoice.paid", paidThrough: epoch(line?.period?.end || object.period_end) };
}

function planFor(projection, env) {
  if (projection.priceId && projection.priceId === env.STRIPE_MONTHLY_PRICE_ID) return "monthly";
  if (projection.priceId && projection.priceId === env.STRIPE_ANNUAL_PRICE_ID) return "annual";
  return null;
}

async function linkVerifiedCustomer(env, projection, timestamp) {
  if (!projection.arkheosCustomerId || !projection.stripeCustomerId) return null;
  const verified = await env.DB.prepare("SELECT id FROM customers WHERE id=? AND verified_at IS NOT NULL").bind(projection.arkheosCustomerId).first();
  if (!verified) return null;
  const existing = await env.DB.prepare("SELECT id FROM customers WHERE stripe_customer_id=?").bind(projection.stripeCustomerId).first();
  const statements = [];
  if (existing && existing.id !== verified.id) {
    statements.push(env.DB.prepare("UPDATE subscriptions SET customer_id=? WHERE customer_id=?").bind(verified.id, existing.id));
    statements.push(env.DB.prepare("DELETE FROM customers WHERE id=?").bind(existing.id));
  }
  statements.push(env.DB.prepare("UPDATE customers SET stripe_customer_id=?,updated_at=? WHERE id=?").bind(projection.stripeCustomerId, timestamp, verified.id));
  if (projection.subscriptionId) statements.push(env.DB.prepare("UPDATE subscriptions SET customer_id=?,updated_at=? WHERE stripe_subscription_id=?").bind(verified.id, timestamp, projection.subscriptionId));
  await env.DB.batch(statements);
  return verified.id;
}

async function resolveCustomer(env, projection, timestamp) {
  const linked = await linkVerifiedCustomer(env, projection, timestamp);
  if (linked) return linked;
  const existing = projection.stripeCustomerId && await env.DB.prepare("SELECT id FROM customers WHERE stripe_customer_id=?").bind(projection.stripeCustomerId).first();
  if (existing?.id) return existing.id;
  if (!projection.stripeCustomerId) return null;
  const shadow = `stripe:${projection.stripeCustomerId}`;
  await env.DB.prepare("INSERT OR IGNORE INTO customers (id,stripe_customer_id,created_at,updated_at) VALUES (?,?,?,?)").bind(shadow, projection.stripeCustomerId, timestamp, timestamp).run();
  return shadow;
}

export async function handleStripeWebhook(request, env) {
  const raw = await request.text();
  if (!(await verifyStripeSignature(raw, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET))) return json({ code: "INVALID_SIGNATURE" }, 400);
  let event; try { event = JSON.parse(raw); } catch { return json({ code: "INVALID_EVENT" }, 400); }
  const projection = stripeProjection(event);
  if (!projection) return json({ code: "INVALID_EVENT" }, 400);
  const timestamp = now();
  const inserted = await env.DB.prepare("INSERT OR IGNORE INTO webhook_events (id, event_type, received_at) VALUES (?, ?, ?)").bind(projection.eventId, projection.type, timestamp).run();
  if (!inserted.meta?.changes) return json({ accepted: true, duplicate: true });
  if (!projection.relevant) { await env.DB.prepare("UPDATE webhook_events SET processed_at=?, outcome='ignored' WHERE id=?").bind(timestamp, projection.eventId).run(); return json({ accepted: true, ignored: true }); }
  if (projection.kind === "checkout") {
    const customerId = await linkVerifiedCustomer(env, projection, timestamp);
    await env.DB.prepare("UPDATE webhook_events SET processed_at=?, outcome=? WHERE id=?").bind(timestamp, customerId ? "linked-checkout" : "observed-checkout", projection.eventId).run();
  } else if (projection.kind === "subscription" && projection.stripeCustomerId && projection.subscriptionId) {
    const customerId = await resolveCustomer(env, projection, timestamp);
    const plan = planFor(projection, env);
    const terminal = new Set(["canceled", "unpaid", "incomplete_expired"]).has(projection.status);
    const graceThrough = terminal && projection.paidThrough ? new Date(Date.parse(projection.paidThrough) + 30 * 86400000).toISOString() : null;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO subscriptions (stripe_subscription_id,customer_id,stripe_price_id,status,current_period_ends_at,cancel_at_period_end,updated_at,plan,paid_through,grace_through,canceled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(stripe_subscription_id) DO UPDATE SET customer_id=excluded.customer_id,stripe_price_id=excluded.stripe_price_id,status=excluded.status,current_period_ends_at=excluded.current_period_ends_at,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=excluded.updated_at,plan=excluded.plan,paid_through=excluded.paid_through,grace_through=CASE WHEN excluded.status IN ('active','trialing') THEN NULL ELSE COALESCE(excluded.grace_through,subscriptions.grace_through) END,canceled_at=COALESCE(excluded.canceled_at,subscriptions.canceled_at)").bind(projection.subscriptionId, customerId, projection.priceId || "unknown", projection.status || "unknown", projection.paidThrough, projection.cancelAtPeriodEnd ? 1 : 0, timestamp, plan, projection.paidThrough, graceThrough, terminal ? timestamp : null),
      env.DB.prepare("UPDATE webhook_events SET processed_at=?, outcome='applied' WHERE id=?").bind(timestamp, projection.eventId)
    ]);
  } else if (projection.kind === "invoice" && projection.subscriptionId) {
    const graceThrough = !projection.paid && projection.paidThrough ? new Date(Date.parse(projection.paidThrough) + 30 * 86400000).toISOString() : null;
    const update = projection.paid
      ? env.DB.prepare("UPDATE subscriptions SET paid_through=COALESCE(?,paid_through),current_period_ends_at=COALESCE(?,current_period_ends_at),status=CASE WHEN status IN ('past_due','unpaid') THEN 'active' ELSE status END,grace_through=CASE WHEN status IN ('past_due','unpaid') THEN NULL ELSE grace_through END,updated_at=? WHERE stripe_subscription_id=?").bind(projection.paidThrough, projection.paidThrough, timestamp, projection.subscriptionId)
      : env.DB.prepare("UPDATE subscriptions SET status='past_due',grace_through=COALESCE(?,grace_through),updated_at=? WHERE stripe_subscription_id=?").bind(graceThrough, timestamp, projection.subscriptionId);
    const changed = await update.run();
    await env.DB.prepare("UPDATE webhook_events SET processed_at=?, outcome=? WHERE id=?").bind(timestamp, changed.meta?.changes ? "applied-invoice" : "observed-invoice", projection.eventId).run();
  } else await env.DB.prepare("UPDATE webhook_events SET processed_at=?, outcome='observed' WHERE id=?").bind(timestamp, projection.eventId).run();
  return json({ accepted: true, duplicate: false });
}

export { EVENTS };
