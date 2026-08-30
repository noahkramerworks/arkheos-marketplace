import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("legacy migration preserves the deployed table contract", async () => {
  const sql = await readFile(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
  for (const table of ["customers", "subscriptions", "installations", "oauth_clients", "oauth_authorization_codes", "oauth_tokens", "device_codes", "webhook_events"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.doesNotMatch(sql, /DROP\s+TABLE|DELETE\s+FROM/iu);
});

test("ArkheOS migration is additive and declares every new authority table", async () => {
  const sql = await readFile(new URL("../migrations/0002_arkheos_membership.sql", import.meta.url), "utf8");
  for (const table of ["account_trials", "refresh_tokens", "checkout_requests", "portal_requests", "catalog_products", "product_releases", "artifacts"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.doesNotMatch(sql, /DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+customers\s+SET/iu);
});
