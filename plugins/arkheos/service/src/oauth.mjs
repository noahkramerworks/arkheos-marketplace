import { future, input, json, now, secureToken, sha256Hex, verifySignedBody } from "./domain.mjs";

const ACCESS_SECONDS = 900;
const REFRESH_SECONDS = 30 * 86400;

export async function principal(request, env) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/u)?.[1];
  if (!token) return null;
  return env.DB.prepare("SELECT customer_id,scopes FROM oauth_tokens WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?").bind(await sha256Hex(token), now()).first();
}

async function issueTokens(env, customerId, familyId = secureToken(18), scopes = "arkheos:read arkheos:write") {
  const accessToken = secureToken(32); const refreshToken = secureToken(32); const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO oauth_tokens (token_hash,customer_id,scopes,expires_at,created_at) VALUES (?,?,?,?,?)").bind(await sha256Hex(accessToken), customerId, scopes, future(ACCESS_SECONDS), timestamp),
    env.DB.prepare("INSERT INTO refresh_tokens (token_hash,family_id,customer_id,expires_at,created_at) VALUES (?,?,?,?,?)").bind(await sha256Hex(refreshToken), familyId, customerId, future(REFRESH_SECONDS), timestamp)
  ]);
  return { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_family: familyId, scope: scopes };
}

export async function deviceCode(request, env) {
  const value = await input(request);
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(value.installationId || "")) return json({ code: "INVALID_INSTALLATION" }, 400);
  const device = secureToken(32); const user = secureToken(6).slice(0, 8).toUpperCase();
  await env.DB.prepare("INSERT INTO device_codes (device_code_hash,user_code,installation_id,status,expires_at,created_at) VALUES (?,?,?,'pending',?,?)").bind(await sha256Hex(device), user, value.installationId, future(600), now()).run();
  return json({ device_code: device, user_code: user, verification_uri: `${env.ACCOUNT_ORIGIN}/account`, verification_uri_complete: `${env.ACCOUNT_ORIGIN}/account?code=${encodeURIComponent(user)}`, expires_in: 600, interval: 5 });
}

export async function approveDevice(request, env) {
  const raw = await request.text();
  const accessEmail = request.headers.get("cf-access-authenticated-user-email");
  const internal = await verifySignedBody(raw, request.headers.get("x-arkheos-account-assertion"), env.ACCOUNT_ASSERTION_SECRET);
  if (!accessEmail && !internal) return json({ code: "ACCESS_AUTHENTICATION_REQUIRED" }, 401);
  let value; try { value = JSON.parse(raw); } catch { return json({ code: "INVALID_REQUEST" }, 400); }
  const userCode = String(value.userCode || "").toUpperCase();
  let customerId = value.customerId;
  if (accessEmail) {
    const emailHash = await sha256Hex(accessEmail.trim().toLowerCase());
    customerId = `account:${emailHash.slice(0, 32)}`;
    const timestamp = now();
    await env.DB.prepare("INSERT INTO customers (id,email_hash,account_subject,verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email_hash=excluded.email_hash,verified_at=excluded.verified_at,updated_at=excluded.updated_at").bind(customerId, emailHash, `email:${emailHash}`, timestamp, timestamp, timestamp).run();
  }
  const customer = customerId && await env.DB.prepare("SELECT id FROM customers WHERE id=? AND verified_at IS NOT NULL").bind(customerId).first();
  if (!customer) return json({ code: "UNVERIFIED_ACCOUNT" }, 403);
  const changed = await env.DB.prepare("UPDATE device_codes SET customer_id=?,status='approved' WHERE user_code=? AND status='pending' AND expires_at>?").bind(customer.id, userCode, now()).run();
  return changed.meta?.changes ? json({ approved: true }) : json({ code: "INVALID_OR_EXPIRED_CODE" }, 404);
}

export async function token(request, env) {
  const value = await input(request);
  if (value.grant_type === "urn:ietf:params:oauth:grant-type:device_code") {
    const row = await env.DB.prepare("SELECT customer_id,status,expires_at FROM device_codes WHERE device_code_hash=?").bind(await sha256Hex(value.device_code || "")).first();
    if (!row || row.expires_at <= now()) return json({ code: "expired_token" }, 400);
    if (row.status !== "approved" || !row.customer_id) return json({ code: "authorization_pending" }, 400);
    await env.DB.prepare("UPDATE device_codes SET status='consumed' WHERE device_code_hash=?").bind(await sha256Hex(value.device_code)).run();
    return json(await issueTokens(env, row.customer_id));
  }
  if (value.grant_type === "refresh_token") {
    const hash = await sha256Hex(value.refresh_token || "");
    const row = await env.DB.prepare("SELECT family_id,customer_id,expires_at,used_at,revoked_at FROM refresh_tokens WHERE token_hash=?").bind(hash).first();
    if (!row || row.revoked_at || row.expires_at <= now()) return json({ code: "invalid_grant" }, 400);
    if (row.used_at) { await env.DB.prepare("UPDATE refresh_tokens SET revoked_at=? WHERE family_id=? AND revoked_at IS NULL").bind(now(), row.family_id).run(); return json({ code: "refresh_reuse_detected" }, 400); }
    await env.DB.prepare("UPDATE refresh_tokens SET used_at=? WHERE token_hash=?").bind(now(), hash).run();
    return json(await issueTokens(env, row.customer_id, row.family_id));
  }
  if (value.grant_type === "urn:arkheos:params:oauth:grant-type:revoke") {
    const hash = await sha256Hex(value.refresh_token || "");
    const row = await env.DB.prepare("SELECT family_id FROM refresh_tokens WHERE token_hash=?").bind(hash).first();
    if (row?.family_id) {
      const timestamp = now();
      await env.DB.batch([
        env.DB.prepare("UPDATE refresh_tokens SET revoked_at=? WHERE family_id=? AND revoked_at IS NULL").bind(timestamp, row.family_id),
        env.DB.prepare("UPDATE oauth_tokens SET revoked_at=? WHERE customer_id IN (SELECT customer_id FROM refresh_tokens WHERE family_id=?) AND revoked_at IS NULL").bind(timestamp, row.family_id)
      ]);
    }
    return json({ revoked: true });
  }
  return json({ code: "unsupported_grant_type" }, 400);
}

export async function registerClient(request, env) {
  const value = await input(request);
  if (!Array.isArray(value.redirect_uris) || value.redirect_uris.length < 1 || value.redirect_uris.length > 8) return json({ error: "invalid_redirect_uri" }, 400);
  let redirects; try { redirects = value.redirect_uris.map((item) => new URL(item).toString()); } catch { return json({ error: "invalid_redirect_uri" }, 400); }
  if (redirects.some((uri) => !uri.startsWith("https://") && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//u.test(uri))) return json({ error: "invalid_redirect_uri" }, 400);
  const clientId = `arkheos_${secureToken(18)}`;
  await env.DB.prepare("INSERT INTO oauth_clients (client_id,redirect_uris,client_name,created_at) VALUES (?,?,?,?)").bind(clientId, JSON.stringify(redirects), String(value.client_name || "ArkheOS client").slice(0, 100), now()).run();
  return json({ client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), redirect_uris: redirects, token_endpoint_auth_method: "none", grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"], response_types: [] }, 201);
}

export function metadata(path, env) {
  if (path.endsWith("oauth-protected-resource")) return json({ resource: env.PUBLIC_ORIGIN, authorization_servers: [env.PUBLIC_ORIGIN], bearer_methods_supported: ["header"], scopes_supported: ["arkheos:read", "arkheos:write"] });
  return json({ issuer: env.PUBLIC_ORIGIN, token_endpoint: `${env.PUBLIC_ORIGIN}/oauth/token`, registration_endpoint: `${env.PUBLIC_ORIGIN}/oauth/register`, device_authorization_endpoint: `${env.PUBLIC_ORIGIN}/v1/device/code`, scopes_supported: ["arkheos:read", "arkheos:write"], response_types_supported: [], grant_types_supported: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token", "urn:arkheos:params:oauth:grant-type:revoke"], token_endpoint_auth_methods_supported: ["none"] });
}
