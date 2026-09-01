import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../mcp/server.mjs";
import { PLUGIN_VERSION } from "../mcp/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));

function pngInfo(relative) {
  const bytes = readFileSync(path.join(root, relative));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

test("package identity, seven Skills, fourteen tools, schemas, and assets match design", () => {
  const manifest = json(".codex-plugin/plugin.json");
  assert.equal(manifest.name, "godot-bridge"); assert.equal(manifest.version, "0.2.0"); assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.license, "Apache-2.0");
  assert.equal(json("package.json").version, manifest.version); assert.equal(PLUGIN_VERSION, manifest.version);
  assert.ok(Array.isArray(manifest.interface.defaultPrompt)); assert.ok(manifest.interface.defaultPrompt.length <= 3);
  assert.match(readFileSync(path.join(root, "godot-addon", "codex_godot_bridge", "bridge_plugin.gd"), "utf8"), /ADDON_VERSION := "0\.2\.0"/);
  assert.match(readFileSync(path.join(root, "godot-addon", "codex_godot_bridge", "plugin.cfg"), "utf8"), /version="0\.2\.0"/);
  const profile = json("bridge/profile.json");
  assert.equal(profile.schema, "bridge-profile/v1.2");
  assert.equal(profile.controlSurface.kind, "documented-application-api");
  assert.deepEqual(profile.certificationTiers, ["api-contract-admission", "package-design-audit", "protocol-negative-tests", "isolated-native-fixture", "live-application-canary", "rollback-recovery-discovery"]);
  assert.deepEqual(profile.release.targets.map((target) => target.selector), ["godot-bridge@personal", "godot-bridge@arkheos"]);
  assert.deepEqual(readdirSync(path.join(root, "skills")).sort(), ["edit", "export", "index", "inspect", "playtest", "rollback", "setup"]);
  assert.deepEqual(TOOLS.map((tool) => tool.name), ["inspect_installation", "enroll_project", "unenroll_project", "open_project", "close_owned_editor", "inspect_project", "inspect_export", "apply_transaction", "start_playtest", "inspect_playtest", "capture_viewport", "stop_playtest", "build_export", "rollback_receipt"]);
  assert.deepEqual(Object.keys(json(".mcp.json").mcpServers), ["godot_bridge"]);
  for (const schema of ["export", "observation", "receipt", "transaction"]) assert.ok(json(`schemas/${schema}.schema.json`).$id);
  assert.deepEqual(pngInfo("assets/logo.png"), { width: 512, height: 512, colorType: 6 });
  assert.deepEqual(pngInfo("assets/composer-icon.png"), { width: 32, height: 32, colorType: 6 });
});

test("all package files are nonempty and instruction links resolve", () => {
  const markdown = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory() && [".git", "node_modules"].includes(entry.name)) continue;
      if (entry.isDirectory()) walk(full);
      else { assert.ok(statSync(full).size > 0, full); if (entry.name.endsWith(".json")) JSON.parse(readFileSync(full, "utf8")); if (entry.name.endsWith(".md")) markdown.push(full); }
    }
  };
  walk(root);
  for (const file of markdown) for (const match of readFileSync(file, "utf8").matchAll(/\]\(([^)]+\.md)(?:#[^)]+)?\)/g)) assert.ok(existsSync(path.resolve(path.dirname(file), match[1])), `${file}: ${match[1]}`);
});

test("package contains no game product, native binary, or raw RPC contribution", () => {
  const manifest = JSON.stringify(json(".codex-plugin/plugin.json"));
  assert.doesNotMatch(manifest, /Game Studio|customer|billing/i);
  const server = readFileSync(path.join(root, "mcp/server.mjs"), "utf8");
  assert.doesNotMatch(server, /raw_rpc/);
  for (const file of readdirSync(path.join(root, "godot-addon", "codex_godot_bridge"))) assert.doesNotMatch(file, /\.(dll|exe|so|dylib)$/i);
  assert.doesNotMatch(server, /shellCommand|rawProtocol|arbitraryCode/);
});
