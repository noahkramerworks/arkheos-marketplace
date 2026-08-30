import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ArkheosOperations } from "../mcp/core/operations.mjs";
import { ArkheosState } from "../mcp/core/state.mjs";
import { sha256 } from "../mcp/core/canonical.mjs";

const dpapi = { protect: (value) => Buffer.from(value).reverse(), unprotect: (value) => Buffer.from(value).reverse() };
function file(path, value) { const content = Buffer.from(typeof value === "string" ? value : JSON.stringify(value)); return { type: "file", path, content: content.toString("base64"), length: content.length, sha256: sha256(content) }; }

test("signed product plan materializes a local marketplace, installs, verifies, exports, and removes", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "arkheos-lifecycle-")); t.after(() => rm(root, { recursive: true, force: true }));
  const state = new ArkheosState({ root, dpapi });
  const registry = { name: "arkheos-products", interface: { displayName: "ArkheOS Products" }, plugins: [{ name: "demo", source: { source: "local", path: "./plugins/demo" } }] };
  const archiveFor = (version) => Buffer.from(JSON.stringify({ schema: "arkheos.product-archive/v1", product: "demo", version, files: [file(".agents/plugins/marketplace.json", registry), file("plugins/demo/.codex-plugin/plugin.json", { name: "demo", version })] }));
  const archive1 = archiveFor("1.0.0"); const archive2 = archiveFor("1.1.0");
  const releaseFor = (version, archive) => ({ schema: "arkheos.release/v1", product: "demo", channel: "stable", version, artifacts: [{ platform: "windows", sha256: sha256(archive), length: archive.length, url: `https://api.arkheos.ai/v1/artifacts/${sha256(archive)}` }] });
  const release1 = releaseFor("1.0.0", archive1); const release2 = releaseFor("1.1.0", archive2); let selected = release1;
  const archives = new Map([[sha256(archive1), archive1], [sha256(archive2), archive2]]);
  const api = { accountStatus: async () => ({ authorized: true, entitlement: { mutating: true } }), release: async () => ({ release: selected, verification: { digest: sha256(selected) } }), artifact: async (artifact) => archives.get(artifact.sha256) };
  const calls = []; const cli = { marketplaceAdd: async (value) => (calls.push(["marketplace", value]), { added: true }), pluginAdd: async (value) => (calls.push(["add", value]), { installed: true }), pluginRemove: async (value) => (calls.push(["remove", value]), { removed: true }) };
  const operations = new ArkheosOperations({ state, api, cli, platform: "windows" });
  const prepared = await operations.prepare({ kind: "install", product: "demo", channel: "stable" });
  assert.equal(prepared.plan.targetVersion, "1.0.0");
  const receipt = await operations.execute({ planId: prepared.plan.id, expectedDigest: prepared.digest, confirm: true });
  assert.equal(receipt.status, "verified"); assert.deepEqual(calls.map((entry) => entry[0]), ["marketplace", "add"]);
  selected = release2;
  const update = await operations.prepare({ kind: "update", product: "demo", channel: "stable" });
  const updated = await operations.execute({ planId: update.plan.id, expectedDigest: update.digest, confirm: true });
  assert.equal((await state.installations()).products.demo.version, "1.1.0");
  const rolledBack = await operations.rollback(updated.id);
  assert.equal(rolledBack.status, "rolled-back"); assert.equal((await state.installations()).products.demo.version, "1.0.0");
  assert.equal((await operations.verify("demo")).localArchiveValid, true);
  assert.equal((await operations.export("demo")).status, "exported");
  assert.equal((await operations.remove("demo")).status, "removed");
  assert.equal(Object.keys((await state.installations()).products).length, 0);
});

test("failed installation removes uncertain plugin effects and restores empty pre-state", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "arkheos-failure-")); t.after(() => rm(root, { recursive: true, force: true }));
  const state = new ArkheosState({ root, dpapi });
  const registry = { name: "arkheos-products", plugins: [{ name: "demo", source: { source: "local", path: "./plugins/demo" } }] };
  const archive = Buffer.from(JSON.stringify({ schema: "arkheos.product-archive/v1", product: "demo", version: "1.0.0", files: [file(".agents/plugins/marketplace.json", registry)] }));
  const artifact = { platform: "windows", sha256: sha256(archive), length: archive.length };
  const release = { schema: "arkheos.release/v1", product: "demo", channel: "stable", version: "1.0.0", artifacts: [artifact] };
  const calls = [];
  const cli = { marketplaceAdd: async () => ({ added: true }), pluginAdd: async () => { calls.push("add"); throw new Error("simulated CLI failure"); }, pluginRemove: async () => { calls.push("remove"); return { removed: true }; } };
  const api = { accountStatus: async () => ({ authorized: true, entitlement: { mutating: true } }), release: async () => ({ release, verification: { digest: sha256(release) } }), artifact: async () => archive };
  const operations = new ArkheosOperations({ state, api, cli, platform: "windows" });
  const prepared = await operations.prepare({ kind: "install", product: "demo" });
  await assert.rejects(() => operations.execute({ planId: prepared.plan.id, expectedDigest: prepared.digest, confirm: true }), /simulated CLI failure/u);
  assert.deepEqual(calls, ["add", "remove"]); assert.deepEqual((await state.installations()).products, {});
});

test("plans are single-use and bind pre-state", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "arkheos-plans-")); t.after(() => rm(root, { recursive: true, force: true }));
  const state = new ArkheosState({ root, dpapi }); await state.initialize();
  const now = new Date(); const plan = { schema: "arkheos.operation-plan/v1", id: "install-once", kind: "install", product: "demo", targetVersion: "1", releaseDigest: "a".repeat(64), preStateDigest: await state.preStateDigest(), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 60000).toISOString(), used: false, rollback: {} };
  await state.writePlan(plan); const digest = sha256(plan); await state.consumePlan(plan.id, digest, now);
  await assert.rejects(() => state.consumePlan(plan.id, digest, now), /already used/u);
});
