import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

test("package manifest and focused Skill catalog match the accepted design", async () => {
  const manifest = JSON.parse(await readFile(new URL("../.codex-plugin/plugin.json", import.meta.url)));
  assert.equal(manifest.name, "arkheos"); assert.equal(manifest.version, "0.1.0"); assert.equal(manifest.mcpServers, "./.mcp.json");
  const entries = (await readdir(new URL("../skills/", import.meta.url), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(entries, ["account", "catalog", "index", "install", "recover", "update"]);
});

test("program schemas and registries parse", async () => {
  for (const file of ["catalog", "entitlement", "operation-plan", "receipt", "release", "state"]) JSON.parse(await readFile(new URL(`../schemas/${file}.schema.json`, import.meta.url)));
  JSON.parse(await readFile(new URL("../.mcp.json", import.meta.url)));
  JSON.parse(await readFile(new URL("../templates/catalog.json", import.meta.url)));
});
