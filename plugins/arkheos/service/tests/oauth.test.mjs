import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { sha256Hex } from "../src/domain.mjs";
import { deviceCode, metadata, token } from "../src/oauth.mjs";

function d1(database) {
  const prepare = (sql) => ({ bind: (...values) => ({ first: async () => database.prepare(sql).get(...values) || null, run: async () => { const result = database.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; } }) });
  return { prepare, batch: async (statements) => { const results = []; for (const statement of statements) results.push(await statement.run()); return results; } };
}

test("device authorization returns the query-preserving account entry route", async () => {
  const database = new DatabaseSync(":memory:"); database.exec(await readFile(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8")); database.exec(await readFile(new URL("../migrations/0002_arkheos_membership.sql", import.meta.url), "utf8"));
  const response = await deviceCode(new Request("https://api.arkheos.ai/v1/device/code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installationId: "installation-1234567890" }) }), { DB: d1(database), ACCOUNT_ORIGIN: "https://account.arkheos.ai" });
  const body = await response.json();
  assert.equal(body.verification_uri, "https://account.arkheos.ai/account");
  assert.equal(body.verification_uri_complete, `https://account.arkheos.ai/account?code=${encodeURIComponent(body.user_code)}`);
});

test("device metadata advertises only implemented grants and sign-out grant revokes the complete token family", async () => {
  const database = new DatabaseSync(":memory:"); database.exec(await readFile(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8")); database.exec(await readFile(new URL("../migrations/0002_arkheos_membership.sql", import.meta.url), "utf8"));
  const env = { DB: d1(database), PUBLIC_ORIGIN: "https://api.arkheos.ai" };
  const advertised = await metadata("/.well-known/oauth-authorization-server", env).json();
  assert.deepEqual(advertised.response_types_supported, []); assert.ok(advertised.grant_types_supported.includes("urn:ietf:params:oauth:grant-type:device_code")); assert.equal(advertised.authorization_endpoint, undefined);
  const timestamp = "2026-08-30T00:00:00.000Z"; const refresh = "opaque-refresh";
  database.prepare("INSERT INTO customers (id,created_at,updated_at) VALUES (?,?,?)").run("account:test", timestamp, timestamp);
  database.prepare("INSERT INTO refresh_tokens (token_hash,family_id,customer_id,expires_at,created_at) VALUES (?,?,?,?,?)").run(await sha256Hex(refresh), "family-1", "account:test", "2099-01-01T00:00:00.000Z", timestamp);
  database.prepare("INSERT INTO oauth_tokens (token_hash,customer_id,scopes,expires_at,created_at) VALUES (?,?,?,?,?)").run("access-hash", "account:test", "arkheos:read", "2099-01-01T00:00:00.000Z", timestamp);
  const request = new Request("https://api.arkheos.ai/oauth/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_type: "urn:arkheos:params:oauth:grant-type:revoke", refresh_token: refresh }) });
  assert.deepEqual(await (await token(request, env)).json(), { revoked: true });
  assert.ok(database.prepare("SELECT revoked_at FROM refresh_tokens WHERE family_id=?").get("family-1").revoked_at); assert.ok(database.prepare("SELECT revoked_at FROM oauth_tokens WHERE customer_id=?").get("account:test").revoked_at);
});
