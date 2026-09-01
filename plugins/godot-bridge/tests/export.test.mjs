import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildExport, inspectExport, parseExportPresets, resolveExternalOutputDirectory } from "../mcp/export.mjs";
import { enrollProject } from "../mcp/operations.mjs";
import { projectRevision } from "../mcp/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enginePath = "C:\\Users\\rizek\\Documents\\Codex\\2026-07-31\\ch\\work\\toolchains\\godot-4.7.1\\Godot_v4.7.1-stable_win64_console.exe";
const presetName = "Windows x86-64";

const exportPresets = `[preset.0]
name="${presetName}"
platform="Windows Desktop"
runnable=true
advanced_options=false
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter="addons/codex_godot_bridge/**,tests/**"
export_path=""
script_export_mode=2

[preset.0.options]
custom_template/debug=""
custom_template/release=""
debug/export_console_wrapper=0
binary_format/embed_pck=true
binary_format/architecture="x86_64"
`;

function fixture(t, presets = exportPresets) {
  const base = mkdtempSync(path.join(tmpdir(), "godot-bridge-export-"));
  const projectRoot = path.join(base, "project");
  const stateRoot = path.join(base, "state");
  const outputDirectory = path.join(base, "output");
  cpSync(path.join(root, "tests", "fixture-project"), projectRoot, { recursive: true });
  const project = readFileSync(path.join(projectRoot, "project.godot"), "utf8").replace('config/name="Godot Bridge Fixture"', 'config/name="Godot Bridge Fixture"\nrun/main_scene="res://main.tscn"');
  writeFileSync(path.join(projectRoot, "project.godot"), project);
  writeFileSync(path.join(projectRoot, "main.tscn"), '[gd_scene format=3]\n\n[node name="Main" type="Node"]\n');
  writeFileSync(path.join(projectRoot, "export_presets.cfg"), presets);
  mkdirSync(outputDirectory);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return { base, projectRoot, stateRoot, outputDirectory, options: { stateRoot, env: process.env } };
}

test("preset parser is deterministic and rejects duplicate names and malformed values", () => {
  const parsed = parseExportPresets(exportPresets);
  assert.equal(parsed.length, 1); assert.equal(parsed[0].name, presetName);
  assert.equal(parsed[0].platform, "Windows Desktop"); assert.equal(parsed[0].options["binary_format/embed_pck"], true);
  assert.throws(() => parseExportPresets(`${exportPresets}\n[preset.1]\nname="${presetName}"\nplatform="Windows Desktop"\n`), /duplicate preset name/);
  assert.throws(() => parseExportPresets("value=1\n"), /unsupported section/);
});

test("export inspection reports exact identities and deterministic blockers", async (t) => {
  const fx = fixture(t); await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options);
  const observed = await inspectExport({ projectRoot: fx.projectRoot, presetName }, fx.options);
  assert.equal(observed.status, "ready"); assert.equal(observed.ready, true); assert.equal(observed.blockers.length, 0);
  assert.equal(observed.preset.platform, "Windows Desktop"); assert.equal(observed.preset.architecture, "x86_64"); assert.equal(observed.preset.embeddedPck, true);
  assert.match(observed.projectRevision, /^sha256:[a-f0-9]{64}$/); assert.match(observed.engine.sha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(observed.templates.release.sha256, /^sha256:[a-f0-9]{64}$/); assert.equal(observed.templates.release.path.endsWith("windows_release_x86_64.exe"), true);
  const missingTemplates = await inspectExport({ projectRoot: fx.projectRoot, presetName }, { ...fx.options, env: { ...process.env, APPDATA: path.join(fx.base, "missing-appdata") } });
  assert.equal(missingTemplates.ready, false); assert.equal(missingTemplates.blockers.some((item) => item.code === "template_directory_missing"), true);
  writeFileSync(path.join(fx.projectRoot, "export_presets.cfg"), exportPresets.replace('binary_format/architecture="x86_64"', 'binary_format/architecture="arm64"'));
  const wrongArchitecture = await inspectExport({ projectRoot: fx.projectRoot, presetName }, fx.options);
  assert.equal(wrongArchitecture.blockers.some((item) => item.code === "architecture_unsupported"), true);
  writeFileSync(path.join(fx.projectRoot, "export_presets.cfg"), exportPresets.replace("binary_format/embed_pck=true", "binary_format/embed_pck=false"));
  const externalPck = await inspectExport({ projectRoot: fx.projectRoot, presetName }, fx.options);
  assert.equal(externalPck.blockers.some((item) => item.code === "embedded_pck_required"), true);
  writeFileSync(path.join(fx.projectRoot, "export_presets.cfg"), exportPresets.replace('platform="Windows Desktop"', 'platform="Linux"'));
  const wrongPlatform = await inspectExport({ projectRoot: fx.projectRoot, presetName }, fx.options);
  assert.equal(wrongPlatform.blockers.some((item) => item.code === "platform_unsupported"), true);
  writeFileSync(path.join(fx.projectRoot, "export_presets.cfg"), exportPresets);
  const missing = await inspectExport({ projectRoot: fx.projectRoot, presetName: "Missing" }, fx.options);
  assert.equal(missing.ready, false); assert.equal(missing.blockers.some((item) => item.code === "preset_not_found"), true);
  writeFileSync(path.join(fx.projectRoot, "export_presets.cfg"), "not-a-preset\n");
  const malformed = await inspectExport({ projectRoot: fx.projectRoot, presetName }, fx.options);
  assert.equal(malformed.ready, false); assert.equal(malformed.blockers.some((item) => item.code === "preset_file_malformed"), true);
});

test("build rejects stale, in-project, colliding, reparse, and invalid staged outputs", async (t) => {
  const fx = fixture(t); await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options);
  const revision = projectRevision(fx.projectRoot);
  const base = { projectRoot: fx.projectRoot, expectedRevision: revision, presetName, outputDirectory: fx.outputDirectory, artifactBasename: "Fixture" };
  await assert.rejects(buildExport({ ...base, expectedRevision: `sha256:${"0".repeat(64)}` }, fx.options), /Stale project revision/);
  await assert.rejects(buildExport({ ...base, outputDirectory: fx.projectRoot }, fx.options), /outside the Godot project/);
  writeFileSync(path.join(fx.outputDirectory, "Fixture.exe"), "collision");
  await assert.rejects(buildExport(base, fx.options), /collision/);
  rmSync(path.join(fx.outputDirectory, "Fixture.exe"), { force: true });

  const link = path.join(fx.base, "output-link");
  try {
    symlinkSync(fx.outputDirectory, link, "junction");
    assert.throws(() => resolveExternalOutputDirectory(link, fx.projectRoot), /Symlink\/reparse/);
  } catch (error) {
    if (error.code !== "EPERM") throw error;
  }

  const invalid = { ...fx.options, runExport: async ({ artifactPath }) => {
    writeFileSync(artifactPath, "not a pe");
    return { exitCode: 0, signal: null, timedOut: false, stdout: { text: "", totalBytes: 0, truncated: false }, stderr: { text: "", totalBytes: 0, truncated: false } };
  } };
  await assert.rejects(buildExport(base, invalid), /Windows PE/);
  assert.equal(existsSync(path.join(fx.outputDirectory, "Fixture.exe")), false);
  assert.equal(readdirSync(fx.outputDirectory).some((name) => name.startsWith(".godot-bridge-staging-")), false);
});

test("nonzero, timeout, missing, extra, preset-drift, and project-drift failures leave no partial artifact", async (t) => {
  const fx = fixture(t); await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options);
  const revision = projectRevision(fx.projectRoot);
  const base = { projectRoot: fx.projectRoot, expectedRevision: revision, presetName, outputDirectory: fx.outputDirectory, artifactBasename: "Fixture" };
  const result = (overrides = {}) => ({ exitCode: 0, signal: null, timedOut: false, stdout: { text: "", totalBytes: 0, truncated: false }, stderr: { text: "", totalBytes: 0, truncated: false }, ...overrides });
  const assertClean = () => {
    assert.equal(existsSync(path.join(fx.outputDirectory, "Fixture.exe")), false);
    assert.equal(readdirSync(fx.outputDirectory).some((name) => name.startsWith(".godot-bridge-staging-")), false);
  };
  await assert.rejects(buildExport(base, { ...fx.options, runExport: async () => result({ exitCode: 3 }) }), /exit code 3/); assertClean();
  await assert.rejects(buildExport(base, { ...fx.options, runExport: async () => result({ timedOut: true }) }), /bounded timeout/); assertClean();
  await assert.rejects(buildExport(base, { ...fx.options, runExport: async () => result() }), /unexpected export output/); assertClean();
  await assert.rejects(buildExport(base, { ...fx.options, runExport: async ({ artifactPath }) => {
    writeFileSync(artifactPath, Buffer.from([0x4d, 0x5a, 0x00])); writeFileSync(path.join(path.dirname(artifactPath), "sidecar.pck"), "extra"); return result();
  } }), /Partial or unexpected/); assertClean();
  await assert.rejects(buildExport(base, { ...fx.options, runExport: async ({ artifactPath }) => {
    writeFileSync(artifactPath, Buffer.from([0x4d, 0x5a, 0x00])); writeFileSync(path.join(fx.projectRoot, "export_presets.cfg"), `${exportPresets}\n; drift\n`); return result();
  } }), /export_presets\.cfg changed/); assertClean();
  writeFileSync(path.join(fx.projectRoot, "export_presets.cfg"), exportPresets);
  await assert.rejects(buildExport(base, { ...fx.options, runExport: async ({ artifactPath }) => {
    writeFileSync(artifactPath, Buffer.from([0x4d, 0x5a, 0x00])); writeFileSync(path.join(fx.projectRoot, "drift.txt"), "drift\n"); return result();
  } }), /Project revision changed/); assertClean();
  rmSync(path.join(fx.projectRoot, "drift.txt"), { force: true });
  assert.equal(projectRevision(fx.projectRoot), revision);
});

test("real Godot export publishes one hashed PE and seals an immutable receipt", { timeout: 180_000 }, async (t) => {
  const fx = fixture(t); await enrollProject({ projectRoot: fx.projectRoot, enginePath }, fx.options);
  const revision = projectRevision(fx.projectRoot);
  const receipt = await buildExport({ projectRoot: fx.projectRoot, expectedRevision: revision, presetName, outputDirectory: fx.outputDirectory, artifactBasename: "Fixture" }, fx.options);
  const artifact = path.join(fx.outputDirectory, "Fixture.exe");
  assert.equal(receipt.status, "verified"); assert.equal(receipt.classification, "artifact-verified");
  assert.equal(receipt.projectRevision, revision); assert.equal(projectRevision(fx.projectRoot), revision);
  assert.equal(receipt.artifact.path, artifact); assert.match(receipt.artifact.sha256, /^sha256:[a-f0-9]{64}$/); assert.ok(receipt.artifact.bytes > 1_000_000);
  assert.deepEqual([...readFileSync(artifact).subarray(0, 2)], [0x4d, 0x5a]);
  assert.deepEqual(readdirSync(fx.outputDirectory), ["Fixture.exe"]);
  assert.equal(existsSync(path.join(fx.stateRoot, "export-receipts", `${receipt.receiptId.slice(7)}.json`)), true);
  console.log(JSON.stringify({
    schema: "godot-bridge/live-export-canary/v1",
    status: "verified",
    operation: "build one revision-bound Godot Windows x86-64 export and independently hash the published artifact",
    receiptId: receipt.receiptId,
    projectRevision: receipt.projectRevision,
    artifactSha256: receipt.artifact.sha256,
    artifactBytes: receipt.artifact.bytes,
  }));
});
