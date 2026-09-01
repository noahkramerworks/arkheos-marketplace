import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));

function pngInfo(relative) {
  const bytes = readFileSync(path.join(root, relative));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

test("package identity, contributions, and interface assets match the accepted design", () => {
  const manifest = json(".codex-plugin/plugin.json");
  assert.equal(manifest.name, "obs-bridge");
  assert.equal(manifest.version, "0.2.1");
  assert.equal(manifest.license, "Apache-2.0");
  assert.equal(json("package.json").license, "Apache-2.0");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.interface.logo, "./assets/logo.png");
  assert.equal(manifest.interface.composerIcon, "./assets/composer-icon.png");
  assert.deepEqual(readdirSync(path.join(root, "skills")).sort(), ["apply", "index", "inspect", "rollback"]);
  assert.deepEqual(Object.keys(json(".mcp.json").mcpServers), ["obs_bridge"]);
  const profile = json("bridge/profile.json");
  assert.equal(profile.schema, "bridge-profile/v1.2");
  assert.equal(profile.pluginVersion, "0.2.1");
  assert.equal(profile.controlSurface.kind, "native-protocol");
  assert.equal(profile.certificationTiers[0], "api-contract-admission");
  assert.deepEqual(profile.release.targets.map(({ marketplace, selector }) => ({ marketplace, selector })), [
    { marketplace: "personal", selector: "obs-bridge@personal" },
    { marketplace: "arkheos", selector: "obs-bridge@arkheos" },
  ]);
  assert.deepEqual(pngInfo("assets/logo.png"), { width: 512, height: 512, colorType: 6 });
  assert.deepEqual(pngInfo("assets/composer-icon.png"), { width: 32, height: 32, colorType: 6 });
  assert.ok(existsSync(path.join(root, "assets/source/logo.svg")));
  assert.ok(existsSync(path.join(root, "LICENSE")));
});

test("package has no product, billing, raw RPC, or native binary contributions", () => {
  const all = [];
  const walk = (directory) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, item.name);
      if (item.isDirectory()) walk(full);
      else all.push(path.relative(root, full).replaceAll("\\", "/"));
    }
  };
  walk(root);
  assert.equal(all.some((file) => /\.(dll|exe|node|so|dylib)$/i.test(file)), false);
  assert.equal(all.some((file) => /billing|entitlement/i.test(file)), false);
  const server = readFileSync(path.join(root, "mcp/server.mjs"), "utf8");
  assert.doesNotMatch(server, /raw_rpc\s*:/);
});

test("all instruction and reference paths resolve", () => {
  for (const skill of ["index", "inspect", "apply", "rollback"]) {
    const file = path.join(root, "skills", skill, "SKILL.md");
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\]\((\.\.\/[^)]+)\)/g)) assert.ok(existsSync(path.resolve(path.dirname(file), match[1])), `${skill}: ${match[1]}`);
  }
});
