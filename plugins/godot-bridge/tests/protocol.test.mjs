import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Coordinator } from "../mcp/coordinator.mjs";
import { ACTION_TYPES, changedTargets, validateTransaction } from "../mcp/protocol.mjs";
import { handleRpc, TOOLS } from "../mcp/server.mjs";

test("MCP server exposes exactly fourteen tools and bounded errors", async () => {
  const runtime = { coordinator: { start: async () => {} }, stateRoot: mkdtempSync(path.join(tmpdir(), "godot-bridge-protocol-")), runProjects: new Map() };
  const init = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, runtime);
  assert.equal(init.result.serverInfo.name, "godot-bridge"); assert.equal(init.result.serverInfo.version, "0.2.0");
  const listed = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, runtime);
  assert.equal(listed.result.tools.length, 14); assert.equal(TOOLS.length, 14);
  const apply = listed.result.tools.find((tool) => tool.name === "apply_transaction");
  assert.equal(apply.inputSchema.$defs.action.oneOf.length, 18);
  assert.equal(apply.inputSchema.$defs.sceneCreate.additionalProperties, false);
  assert.equal((await handleRpc({ jsonrpc: "2.0", id: 3, method: "missing" }, runtime)).error.code, -32601);
  assert.equal((await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "raw_rpc", arguments: {} } }, runtime)).error.code, -32602);
  rmSync(runtime.stateRoot, { recursive: true, force: true });
});

test("transaction contract rejects unknown actions, paths, aliases, and variants", () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), "godot-bridge-contract-")); writeFileSync(path.join(projectRoot, "project.godot"), "config_version=5\n");
  const base = { projectRoot, transactionId: "tx-1", expectedRevision: `sha256:${"0".repeat(64)}`, scenePath: "res://main.tscn" };
  const rootAlias = { $type: "Alias", alias: "Root" };
  assert.equal(ACTION_TYPES.length, 18);
  assert.throws(() => validateTransaction({ ...base, actions: [{ type: "raw.call" }] }, projectRoot), /unsupported/);
  assert.throws(() => validateTransaction({ ...base, actions: [{ type: "script.write", path: "res://../x.gd", content: "extends Node\n" }] }, projectRoot), /Invalid|escapes/);
  assert.throws(() => validateTransaction({ ...base, actions: [{ type: "scene.create", path: "res://main.tscn", rootType: "Node2D", rootName: "Main", alias: "Root" }, { type: "node.create", parent: rootAlias, nodeType: "Node", name: "A", alias: "A" }, { type: "node.create", parent: rootAlias, nodeType: "Node", name: "B", alias: "A" }] }, projectRoot), /duplicated/);
  assert.throws(() => validateTransaction({ ...base, actions: [{ type: "scene.create", path: "res://main.tscn", rootType: "Node2D", rootName: "Main", alias: "Root" }, { type: "node.set_property", target: rootAlias, property: "position", value: { $type: "Eval", value: "x" } }] }, projectRoot), /unsupported variant/);
  assert.throws(() => validateTransaction({ ...base, actions: [{ type: "scene.create", scenePath: "res://main.tscn", rootType: "Node2D", rootName: "Main" }] }, projectRoot), /unknown field/);
  assert.throws(() => validateTransaction({ ...base, actions: [{ type: "node.remove", target: { $type: "Alias", alias: "Future" } }] }, projectRoot), /forward alias/);
  assert.throws(() => validateTransaction({ ...base, actions: [{ type: "scene.save", unexpected: true }] }, projectRoot), /unknown field/);
  assert.throws(() => validateTransaction({ ...base, actions: [{ type: "scene.create", path: "res://main.tscn", rootType: "Node2D", rootName: "Main", alias: "Root" }, { type: "node.set_property", target: rootAlias, property: "transform", value: { $type: "Transform2D", value: [1, 0] } }] }, projectRoot), /exactly 6/);
  const transaction = validateTransaction({ ...base, actions: [
    { type: "scene.create", path: "res://main.tscn", rootType: "Node2D", rootName: "Main", alias: "Root" },
    { type: "script.write", path: "res://main.gd", content: "extends Node2D\n" },
    { type: "script.attach", target: rootAlias, scriptPath: "res://main.gd" },
    { type: "node.create", parent: rootAlias, nodeType: "ColorRect", name: "Backdrop", alias: "Backdrop" },
    { type: "node.set_property", target: { $type: "Alias", alias: "Backdrop" }, property: "color", value: { $type: "Color", value: [0.1, 0.4, 0.8, 1] } },
    { type: "project.input_action.ensure", name: "move_left", deadzone: 0.5 },
    { type: "scene.save" },
  ] }, projectRoot);
  assert.deepEqual(changedTargets(transaction), ["res://main.gd", "res://main.gd.uid", "res://main.tscn", "res://project.godot"]);
  const scriptOnly = validateTransaction({ ...base, actions: [{ type: "script.write", path: "res://main.gd", content: "extends Node2D\n" }] }, projectRoot);
  assert.deepEqual(changedTargets(scriptOnly), ["res://main.gd", "res://main.gd.uid"], "script-only edits must not rewrite or checkpoint an unchanged open scene");
  rmSync(projectRoot, { recursive: true, force: true });
});

test("coordinator authenticates, registers, dispatches, and correlates one completion", async (t) => {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "godot-bridge-coordinator-")); t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  const projectRoot = path.join(stateRoot, "project");
  const coordinator = new Coordinator({ stateRoot, timeoutMs: 2000 }); await coordinator.start(); t.after(() => coordinator.close());
  const headers = { authorization: `Bearer ${coordinator.token}`, "content-type": "application/json" };
  const connected = await fetch(`${coordinator.endpoint}/v1/connect`, { method: "POST", headers, body: JSON.stringify({ protocol: "godot-bridge/ipc/v1", projectRoot, addonVersion: "0.2.0" }) });
  assert.equal(connected.status, 200);
  const pending = coordinator.dispatch(projectRoot, "inspect_project", {});
  const next = await fetch(`${coordinator.endpoint}/v1/jobs/next?projectRoot=${encodeURIComponent(projectRoot)}`, { headers }); const job = await next.json();
  const completed = await fetch(`${coordinator.endpoint}/v1/jobs/${job.requestId}/complete`, { method: "POST", headers, body: JSON.stringify({ status: "observed" }) });
  assert.equal(completed.status, 200); assert.deepEqual(await pending, { status: "observed" });
  assert.equal((await fetch(`${coordinator.endpoint}/v1/jobs/next?projectRoot=${encodeURIComponent(projectRoot)}`)).status, 401);
});
