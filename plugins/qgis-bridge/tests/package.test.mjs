import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../mcp/server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("package has the accepted complete QGIS bridge shape", () => {
  const required = [".codex-plugin/plugin.json", ".mcp.json", "agents/openai.yaml", "AGENTS.md", "README.md", "LICENSE", "design/plugin.md", "bridge/profile.json", "assets/source/logo.svg", "assets/logo.png", "assets/composer-icon.png", "qgis-extension/TEMPLATE-PROVENANCE.json", "qgis-extension/adapter/extension.py", "qgis-extension/adapter/metadata.txt", "qgis-extension/adapter/__init__.py", "references/qgis-api-contract.md", "references/installer-provenance.md", "fixtures/layer.geojson", "fixtures/project.qgs"];
  for (const relative of required) assert.equal(existsSync(path.join(root, relative)), true, relative);
  const manifest = JSON.parse(readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.name, "qgis-bridge"); assert.equal(manifest.version, "0.1.1"); assert.equal(manifest.license, "GPL-3.0-or-later");
  const license = readFileSync(path.join(root, "LICENSE"), "utf8");
  assert.ok(license.length > 30_000, "LICENSE must contain the complete GPLv3 terms");
  assert.match(license, /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
  for (const skill of ["index", "setup", "inspect", "edit", "export", "rollback", "recover"]) assert.equal(existsSync(path.join(root, "skills", skill, "SKILL.md")), true, skill);
  assert.deepEqual(TOOLS.map((tool) => tool.name), ["bridge_status", "setup_bridge", "inspect_project", "apply_transaction", "export_artifact", "rollback_receipt"]);
});
