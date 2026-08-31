import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
assert.equal(manifest.name, "arkheos"); assert.equal(manifest.version, "0.1.2"); assert.equal(manifest.skills, "./skills/"); assert.equal(manifest.mcpServers, "./.mcp.json");
assert.equal(manifest.interface.logo, "./assets/logo.png"); assert.equal(manifest.interface.composerIcon, "./assets/composer-icon.png");
const design = readFileSync(path.join(root, "design", "plugin.md"), "utf8");
assert.match(design, /status: accepted/u); assert.match(design, /open_questions: \[\]/u); assert.match(design, /mcp_disposition: bundled-server/u);

const expectedSkills = ["account", "catalog", "index", "install", "recover", "update"];
const observedSkills = readdirSync(path.join(root, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
assert.deepEqual(observedSkills, expectedSkills);
for (const skill of expectedSkills) {
  const text = readFileSync(path.join(root, "skills", skill, "SKILL.md"), "utf8");
  assert.match(text, new RegExp(`name: ${skill}(?:\\r?\\n)`)); assert.ok(text.length > 200);
}

const required = [
  ".codex-plugin/plugin.json", ".mcp.json", "AGENTS.md", "README.md", "agents/openai.yaml",
  "assets/source/logo.svg", "assets/logo.png", "assets/composer-icon.png", "design/plugin.md", "package.json",
  "mcp/handler.mjs", "mcp/server.mjs", "mcp/core/api.mjs", "mcp/core/canonical.mjs", "mcp/core/crypto.mjs", "mcp/core/dpapi.mjs", "mcp/core/operations.mjs", "mcp/core/state.mjs",
  "references/architecture.md", "references/commerce-and-entitlements.md", "references/compatibility-and-migration.md", "references/distribution-and-recovery.md",
  "schemas/catalog.schema.json", "schemas/entitlement.schema.json", "schemas/operation-plan.schema.json", "schemas/receipt.schema.json", "schemas/release.schema.json", "schemas/state.schema.json",
  "scripts/arkheos.mjs", "scripts/verify-package.mjs", "service/package.json", "service/package-lock.json", "service/wrangler.jsonc",
  "service/migrations/0001_initial.sql", "service/migrations/0002_arkheos_membership.sql", "service/public/account.html", "service/public/app.js", "service/public/index.html", "service/public/styles.css",
  "service/src/catalog.mjs", "service/src/domain.mjs", "service/src/index.mjs", "service/src/oauth.mjs", "service/src/releases.mjs", "service/src/stripe.mjs",
  "service/tests/domain.test.mjs", "service/tests/landing.test.mjs", "service/tests/migrations.test.mjs", "service/tests/oauth.test.mjs", "service/tests/projection.test.mjs", "service/tests/releases.test.mjs", "service/tests/worker.test.mjs",
  "templates/catalog.json", "tests/audit-prompts.test.mjs", "tests/handler.test.mjs", "tests/lifecycle.test.mjs", "tests/package.test.mjs", "tests/security.test.mjs", "tests/state.test.mjs"
];
for (const relative of required) assert.ok(existsSync(path.join(root, relative)), `Missing ${relative}`);

const scripts = []; const jsonFiles = []; const forbiddenFiles = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || (entry.name === "audit" && !existsSync(path.join(directory, entry.name)))) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file); else {
      assert.ok(statSync(file).size > 0, `Zero-byte file: ${file}`);
      if (entry.name.endsWith(".mjs")) scripts.push(file);
      if (entry.name.endsWith(".json")) jsonFiles.push(file);
      if (/\.ps1$/iu.test(entry.name)) forbiddenFiles.push(file);
      if (/\.(?:mjs|json|md|yaml|html|js|css|sql|jsonc)$/iu.test(entry.name)) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u, `Secret-like value in ${file}`);
      }
    }
  }
}
walk(root); assert.deepEqual(forbiddenFiles, []);
for (const file of jsonFiles) JSON.parse(readFileSync(file, "utf8"));
for (const file of scripts) execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
console.log(JSON.stringify({ status: "passed", plugin: manifest.name, skills: expectedSkills.length, scripts: scripts.length, requiredFiles: required.length }, null, 2));
