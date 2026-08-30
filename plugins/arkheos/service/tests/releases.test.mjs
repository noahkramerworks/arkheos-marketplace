import test from "node:test";
import assert from "node:assert/strict";
import { release } from "../src/releases.mjs";

test("stable and exact-version release lookups use distinct bounded KV keys", async () => {
  const keys = [];
  const env = { CONFIG: { get: async (key) => (keys.push(key), { schema: "arkheos.release/v1", version: key.endsWith(":0.2.0") ? "0.2.0" : "0.2.1" }) } };
  assert.equal((await (await release(env, "stream-showrunner", "stable")).json()).version, "0.2.1");
  assert.equal((await (await release(env, "stream-showrunner", "stable", "0.2.0")).json()).version, "0.2.0");
  assert.deepEqual(keys, ["release:stream-showrunner:stable", "release:stream-showrunner:stable:0.2.0"]);
  assert.equal((await release(env, "stream-showrunner", "stable", "latest")).status, 400);
});
