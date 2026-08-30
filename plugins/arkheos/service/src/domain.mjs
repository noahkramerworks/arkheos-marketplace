const encoder = new TextEncoder();
export const PRESERVED = Object.freeze(["inspect", "export", "verify", "recover", "rollback", "remove", "undo", "receipt", "account-export", "account-delete"]);

export function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers } });
}

export async function sha256Hex(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function base64url(bytes) {
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function secureToken(bytes = 32) { const value = new Uint8Array(bytes); crypto.getRandomValues(value); return base64url(value); }
export const now = () => new Date().toISOString();
export const future = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();

function constantTimeEqual(leftValue, rightValue) {
  const left = encoder.encode(leftValue); const right = encoder.encode(rightValue);
  if (left.length !== right.length) return false;
  let mismatch = 0; for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

export async function hmacHex(rawBody, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifySignedBody(rawBody, header, secret) {
  if (!header || !secret) return false;
  const supplied = header.startsWith("v1=") ? header.slice(3) : header;
  return constantTimeEqual(await hmacHex(rawBody, secret), supplied);
}

export async function verifyStripeSignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const values = header.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = Number(values.find(([name]) => name === "t")?.[1]);
  const signatures = values.filter(([name]) => name === "v1").map(([, value]) => value);
  if (!Number.isInteger(timestamp) || signatures.length === 0 || Math.abs(nowSeconds - timestamp) > 300) return false;
  const expected = await hmacHex(`${timestamp}.${rawBody}`, secret);
  return signatures.some((signature) => constantTimeEqual(expected, signature));
}

export function entitlementView({ trial, subscription } = {}, current = new Date()) {
  const time = current.getTime();
  const trialActive = trial && Date.parse(trial.ends_at) > time;
  const admittedPlan = subscription && new Set(["monthly", "annual"]).has(subscription.plan);
  const paidActive = admittedPlan && new Set(["active", "trialing"]).has(subscription.status) && Date.parse(subscription.paid_through || subscription.current_period_ends_at || "") > time;
  const graceActive = admittedPlan && Date.parse(subscription.grace_through || "") > time;
  const mode = trialActive ? "trial" : paidActive ? "paid" : graceActive ? "grace" : "recovery";
  return { schema: "arkheos.entitlement/v1", mode, mutating: mode !== "recovery", trialEndsAt: trial?.ends_at || null, paidThrough: subscription?.paid_through || subscription?.current_period_ends_at || null, graceThrough: subscription?.grace_through || null, preserved: PRESERVED, evaluatedAt: current.toISOString() };
}

export async function input(request, maximum = 65536) {
  if (Number(request.headers.get("content-length") || 0) > maximum) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { status: 413 });
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(await request.text()));
  return request.json();
}
