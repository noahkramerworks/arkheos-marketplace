import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../mcp/server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("package has the accepted complete FreeCAD bridge shape", () => {
  const required = [".codex-plugin/plugin.json", ".mcp.json", "agents/openai.yaml", "AGENTS.md", "README.md", "LICENSE", "design/plugin.md", "bridge/profile.json", "assets/source/logo.svg", "assets/logo.png", "assets/composer-icon.png", "freecad-adapter/TEMPLATE-PROVENANCE.json", "freecad-adapter/adapter/extension.py", "freecad-adapter/adapter/batch.py", "references/freecad-api-contract.md", "references/installer-provenance.md"];
  for (const relative of required) assert.equal(existsSync(path.join(root, relative)), true, relative);
  const manifest = JSON.parse(readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.name, "freecad-bridge"); assert.equal(manifest.version, "0.1.0"); assert.equal(manifest.license, "Apache-2.0");
  for (const skill of ["index", "setup", "inspect", "edit", "export", "rollback", "recover"]) assert.equal(existsSync(path.join(root, "skills", skill, "SKILL.md")), true, skill);
  assert.deepEqual(TOOLS.map((tool) => tool.name), ["bridge_status", "setup_bridge", "inspect_document", "apply_transaction", "export_artifact", "rollback_receipt"]);
});
