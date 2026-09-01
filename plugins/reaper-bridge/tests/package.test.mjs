import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../mcp/server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [".codex-plugin/plugin.json", ".mcp.json", "agents/openai.yaml", "AGENTS.md", "README.md", "LICENSE", "design/plugin.md", "bridge/profile.json", "audit/plugin-audit.json", "assets/logo.png", "assets/composer-icon.png", "native/dist/reaper_codex_bridge.dll", "reaper-extension/TEMPLATE-PROVENANCE.json", "references/reaper-api-contract.md", "tests/admission.test.mjs"];

test("package has the accepted complete bridge shape", () => {
  for (const relative of required.filter((item) => item !== "audit/plugin-audit.json")) assert.equal(existsSync(path.join(root, relative)), true, relative);
  const manifest = JSON.parse(readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.name, "reaper-bridge"); assert.equal(manifest.version, "0.2.0"); assert.equal(manifest.license, "Apache-2.0"); assert.equal(manifest.interface.logo, "./assets/logo.png");
  const profile = JSON.parse(readFileSync(path.join(root, "bridge", "profile.json"), "utf8")); assert.equal(profile.schema, "bridge-profile/v1.2"); assert.equal(profile.adapter, "reverse-polling-extension"); assert.deepEqual(profile.release.targets.map((target) => target.selector), ["reaper-bridge@personal", "reaper-bridge@arkheos"]); assert.equal(profile.release.targets.every((target) => target.requiresCertificate && target.license === "Apache-2.0"), true);
  const skills = ["index", "setup", "inspect", "edit", "render", "rollback"];
  for (const skill of skills) assert.equal(existsSync(path.join(root, "skills", skill, "SKILL.md")), true, skill);
  assert.equal(TOOLS.length, 9); assert.equal(new Set(TOOLS.map((tool) => tool.name)).size, 9);
});

test("native SDK provenance is pinned and the release DLL is x64 PE", () => {
  const provenance = JSON.parse(readFileSync(path.join(root, "native", "vendor", "reaper-sdk", "PROVENANCE.json"), "utf8"));
  assert.equal(provenance.commit, "490ded57668727fba21482fabc50ba9853a457bb");
  const dll = readFileSync(path.join(root, "native", "dist", "reaper_codex_bridge.dll")); assert.equal(dll.subarray(0, 2).toString("ascii"), "MZ");
  const pe = dll.readUInt32LE(0x3c); assert.equal(dll.subarray(pe, pe + 4).toString("binary"), "PE\u0000\u0000"); assert.equal(dll.readUInt16LE(pe + 4), 0x8664);
});
