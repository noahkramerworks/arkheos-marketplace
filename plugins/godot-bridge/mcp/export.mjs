import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { inspectEngine } from "./godot-process.mjs";
import { boundedString, exactKeys, object } from "./protocol.mjs";
import { PLUGIN_VERSION, projectId, projectRevision, readEnrollment, resolveProjectRoot, resolveResPath, resolveStateRoot, sha256, writeExportReceipt } from "./state.mjs";

const LOG_LIMIT_BYTES = 64 * 1024;
const EXPORT_TIMEOUT_MS = 300_000;
const RESERVED_WINDOWS_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);

function parseScalar(raw, label) {
  const value = raw.trim();
  if (!value.length) return "";
  if (value.startsWith('"')) {
    try { return JSON.parse(value); }
    catch { throw new Error(`${label} contains an invalid quoted value`); }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?(?:\d+\.\d*|\d*\.\d+)$/.test(value)) return Number.parseFloat(value);
  return value;
}

export function parseExportPresets(text) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) throw new Error("export_presets.cfg must be UTF-8 text of at most 2 MiB");
  const sections = new Map();
  let section = null;
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const sectionMatch = line.match(/^\[(preset\.\d+(?:\.options)?)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (sections.has(section)) throw new Error(`duplicate section [${section}]`);
      sections.set(section, {});
      continue;
    }
    if (line.startsWith("[") || !section) throw new Error(`unsupported section or value at line ${index + 1}`);
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`malformed assignment at line ${index + 1}`);
    const key = line.slice(0, separator).trim();
    if (!key || Object.hasOwn(sections.get(section), key)) throw new Error(`duplicate or empty key at line ${index + 1}`);
    sections.get(section)[key] = parseScalar(line.slice(separator + 1), `line ${index + 1}`);
  }
  const presets = [];
  for (const [sectionName, values] of sections) {
    const match = sectionName.match(/^preset\.(\d+)$/);
    if (!match) continue;
    const index = Number.parseInt(match[1], 10);
    const name = values.name;
    if (typeof name !== "string" || !name.trim()) throw new Error(`[${sectionName}] requires a nonempty name`);
    presets.push({ index, ...values, name: name.trim(), options: sections.get(`preset.${index}.options`) || {} });
  }
  const names = new Set();
  for (const preset of presets) {
    if (names.has(preset.name)) throw new Error(`duplicate preset name: ${preset.name}`);
    names.add(preset.name);
  }
  return presets.sort((a, b) => a.index - b.index);
}

function assertNoReparseTraversal(target) {
  const resolved = path.resolve(target);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!existsSync(current)) throw new Error(`Path component does not exist: ${current}`);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink/reparse traversal is not admitted: ${current}`);
  }
}

export function resolveExternalOutputDirectory(raw, projectRoot) {
  if (typeof raw !== "string" || !path.isAbsolute(raw)) throw new Error("outputDirectory must be an absolute path");
  const requested = path.resolve(raw);
  assertNoReparseTraversal(requested);
  const resolved = realpathSync.native(requested);
  if (!statSync(resolved).isDirectory()) throw new Error("outputDirectory must be an existing directory");
  const project = path.resolve(projectRoot).toLowerCase();
  const output = path.resolve(resolved).toLowerCase();
  if (output === project || output.startsWith(`${project}${path.sep}`)) throw new Error("outputDirectory must be outside the Godot project");
  return resolved;
}

function templateFolderName(engineVersion) {
  const match = String(engineVersion).match(/^(\d+\.\d+\.\d+\.(?:stable|alpha\d*|beta\d*|rc\d*|dev\d*))/);
  return match?.[1] || String(engineVersion).split(".official")[0];
}

function defaultTemplateDirectory(engineVersion, env) {
  const roaming = env.APPDATA?.trim() || (env.USERPROFILE?.trim() ? path.join(env.USERPROFILE, "AppData", "Roaming") : null);
  if (!roaming) return null;
  return path.join(roaming, "Godot", "export_templates", templateFolderName(engineVersion));
}

function fileIdentity(file) {
  if (!file || !existsSync(file) || !statSync(file).isFile()) return null;
  const bytes = readFileSync(file);
  return { path: realpathSync.native(file), bytes: bytes.length, sha256: `sha256:${sha256(bytes)}` };
}

function blocker(blockers, code, message) {
  if (blockers.length < 32) blockers.push({ code, message: String(message).slice(0, 1000) });
}

function selectedTemplate(projectRoot, preset, templateDirectory, blockers) {
  if (!preset) return null;
  const custom = preset.options["custom_template/release"];
  let target = null;
  let source = "standard";
  try {
    if (typeof custom === "string" && custom.trim()) {
      source = "custom";
      target = custom.startsWith("res://") ? resolveResPath(projectRoot, custom).target : path.resolve(custom);
    } else if (preset.platform === "Windows Desktop" && preset.options["binary_format/architecture"] === "x86_64" && templateDirectory) {
      target = path.join(templateDirectory, "windows_release_x86_64.exe");
    }
  } catch (error) { blocker(blockers, "template_path_invalid", error.message); }
  if (!target) return null;
  try { if (existsSync(target)) assertNoReparseTraversal(target); }
  catch (error) { blocker(blockers, "template_path_unsafe", error.message); return null; }
  const identity = fileIdentity(target);
  if (!identity) blocker(blockers, "release_template_missing", `Release template is missing: ${target}`);
  return identity ? { ...identity, source } : { path: target, source, bytes: null, sha256: null };
}

export async function inspectExport(args, options = {}) {
  object(args, "arguments"); exactKeys(args, ["projectRoot", "presetName"], "arguments");
  const presetName = boundedString(args.presetName, "presetName", 160);
  const stateRoot = resolveStateRoot(options.env || process.env, options.stateRoot);
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const { enrollment } = readEnrollment(stateRoot, projectRoot);
  const engine = inspectEngine(enrollment.engine?.enginePath, options.env || process.env);
  const blockers = [];
  if (!engine.version.startsWith("4.7.1")) blocker(blockers, "engine_version_unsupported", `Godot ${engine.version} is outside the accepted 4.7.1 boundary`);

  const presetFile = path.join(projectRoot, "export_presets.cfg");
  let presetFileSha256 = null;
  let preset = null;
  let availablePresets = [];
  if (!existsSync(presetFile)) blocker(blockers, "preset_file_missing", "export_presets.cfg is missing");
  else {
    try {
      const presetBytes = readFileSync(presetFile);
      presetFileSha256 = `sha256:${sha256(presetBytes)}`;
      const presets = parseExportPresets(presetBytes.toString("utf8"));
      availablePresets = presets.map((item) => item.name);
      preset = presets.find((item) => item.name === presetName) || null;
      if (!preset) blocker(blockers, "preset_not_found", `Preset was not found: ${presetName}`);
    } catch (error) { blocker(blockers, "preset_file_malformed", error.message); }
  }

  const platform = preset?.platform ?? null;
  const architecture = preset?.options?.["binary_format/architecture"] ?? null;
  const embeddedPck = preset?.options?.["binary_format/embed_pck"] === true;
  const extension = platform === "Windows Desktop" ? ".exe" : null;
  if (preset && platform !== "Windows Desktop") blocker(blockers, "platform_unsupported", `Only Windows Desktop export is admitted in 0.1.4, observed ${platform || "missing"}`);
  if (preset && architecture !== "x86_64") blocker(blockers, "architecture_unsupported", `Preset must explicitly target x86_64, observed ${architecture || "missing"}`);
  if (preset && !embeddedPck) blocker(blockers, "embedded_pck_required", "Preset must set binary_format/embed_pck=true");

  const expectedTemplateDirectory = defaultTemplateDirectory(engine.version, options.env || process.env);
  let templateDirectory = expectedTemplateDirectory;
  let templateVersion = null;
  if (!expectedTemplateDirectory || !existsSync(expectedTemplateDirectory)) blocker(blockers, "template_directory_missing", `Export template directory is missing: ${expectedTemplateDirectory || "unresolved"}`);
  else {
    try {
      assertNoReparseTraversal(expectedTemplateDirectory);
      templateDirectory = realpathSync.native(expectedTemplateDirectory);
      const versionIdentity = fileIdentity(path.join(templateDirectory, "version.txt"));
      if (!versionIdentity) blocker(blockers, "template_version_missing", "Export template version.txt is missing");
      else templateVersion = { ...versionIdentity, value: readFileSync(versionIdentity.path, "utf8").trim().slice(0, 160) };
    } catch (error) { blocker(blockers, "template_directory_unsafe", error.message); }
  }
  const releaseTemplate = selectedTemplate(projectRoot, preset, templateDirectory, blockers);

  return {
    schema: "godot-bridge/export-observation/v1",
    status: blockers.length ? "blocked" : "ready",
    ready: blockers.length === 0,
    bridge: { pluginVersion: PLUGIN_VERSION, enrollmentVersion: enrollment.pluginVersion || null },
    projectRoot,
    projectId: projectId(projectRoot),
    projectRevision: projectRevision(projectRoot),
    engine,
    templates: { directory: templateDirectory, version: templateVersion, release: releaseTemplate },
    presetFile: { path: presetFile, sha256: presetFileSha256 },
    preset: preset ? {
      name: preset.name,
      platform,
      architecture,
      embeddedPck,
      exportFilter: preset.export_filter ?? null,
      includeFilter: preset.include_filter ?? null,
      excludeFilter: preset.exclude_filter ?? null,
      extension,
    } : null,
    availablePresets,
    blockers,
  };
}

function boundedCollector(limit = LOG_LIMIT_BYTES) {
  let bytes = Buffer.alloc(0);
  let totalBytes = 0;
  return {
    push(chunk) {
      const next = Buffer.from(chunk);
      totalBytes += next.length;
      bytes = Buffer.concat([bytes, next]);
      if (bytes.length > limit) bytes = bytes.subarray(bytes.length - limit);
    },
    result() { return { text: bytes.toString("utf8"), totalBytes, truncated: totalBytes > bytes.length }; },
  };
}

export async function runGodotExport({ enginePath, projectRoot, presetName, artifactPath, env = process.env, timeoutMs = EXPORT_TIMEOUT_MS }) {
  return await new Promise((resolve, reject) => {
    const stdout = boundedCollector();
    const stderr = boundedCollector();
    const child = spawn(enginePath, ["--headless", "--path", projectRoot, "--export-release", presetName, artifactPath], {
      cwd: projectRoot,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ exitCode: code, signal, timedOut, stdout: stdout.result(), stderr: stderr.result() });
    });
  });
}

function validateBasename(value) {
  const basename = boundedString(value, "artifactBasename", 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(basename)) throw new Error("artifactBasename must be extension-free and contain only letters, digits, underscore, or hyphen");
  if (RESERVED_WINDOWS_NAMES.has(basename.toUpperCase())) throw new Error("artifactBasename is a reserved Windows device name");
  return basename;
}

function stagedFiles(root, current = root, files = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Staged export contains a symlink/reparse entry: ${entry.name}`);
    if (entry.isDirectory()) stagedFiles(root, full, files);
    else files.push(path.relative(root, full).replaceAll("\\", "/"));
  }
  return files.sort();
}

export async function buildExport(args, options = {}) {
  object(args, "arguments");
  exactKeys(args, ["projectRoot", "expectedRevision", "presetName", "outputDirectory", "artifactBasename"], "arguments");
  if (!/^sha256:[a-f0-9]{64}$/.test(args.expectedRevision || "")) throw new Error("expectedRevision must be sha256:<64 lowercase hex characters>");
  const basename = validateBasename(args.artifactBasename);
  const observation = await inspectExport({ projectRoot: args.projectRoot, presetName: args.presetName }, options);
  if (!observation.ready) throw new Error(`Export is blocked: ${observation.blockers.map((item) => item.code).join(", ")}`);
  if (observation.projectRevision !== args.expectedRevision) throw new Error(`Stale project revision: expected ${args.expectedRevision}, observed ${observation.projectRevision}`);

  const bridge = options.coordinator;
  if (bridge?.isConnected?.(observation.projectRoot)) {
    const native = await bridge.dispatch(observation.projectRoot, "inspect_project", { include: [], cursor: null });
    if (native?.dirty) throw new Error("Connected Godot editor has unsaved or untracked state");
  }

  const outputDirectory = resolveExternalOutputDirectory(args.outputDirectory, observation.projectRoot);
  const artifactName = `${basename}${observation.preset.extension}`;
  const finalPath = path.join(outputDirectory, artifactName);
  if (existsSync(finalPath)) throw new Error(`Export artifact collision: ${finalPath}`);
  const staging = path.join(outputDirectory, `.godot-bridge-staging-${randomUUID()}`);
  mkdirSync(staging, { recursive: false });
  const stagedArtifact = path.join(staging, artifactName);
  const startedAt = new Date().toISOString();
  let publishedHash = null;
  try {
    const runner = options.runExport || runGodotExport;
    const processResult = await runner({
      enginePath: observation.engine.enginePath,
      projectRoot: observation.projectRoot,
      presetName: args.presetName,
      artifactPath: stagedArtifact,
      env: options.env || process.env,
      timeoutMs: options.exportTimeoutMs || EXPORT_TIMEOUT_MS,
    });
    if (processResult.timedOut) throw new Error("Godot export exceeded the bounded timeout");
    if (processResult.exitCode !== 0) throw new Error(`Godot export failed with exit code ${processResult.exitCode ?? "unknown"}`);
    const files = stagedFiles(staging);
    if (files.length !== 1 || files[0] !== artifactName) throw new Error(`Partial or unexpected export output: ${files.join(", ") || "none"}`);
    if (!existsSync(stagedArtifact) || !statSync(stagedArtifact).isFile()) throw new Error("Godot export did not produce the expected artifact");
    const stagedBytes = readFileSync(stagedArtifact);
    if (stagedBytes.length < 2 || stagedBytes[0] !== 0x4d || stagedBytes[1] !== 0x5a) throw new Error("Exported artifact is not a valid Windows PE executable");
    const stagedHash = `sha256:${sha256(stagedBytes)}`;
    const presetHashAfter = `sha256:${sha256(readFileSync(observation.presetFile.path))}`;
    if (presetHashAfter !== observation.presetFile.sha256) throw new Error("export_presets.cfg changed during export");
    const observedAfter = projectRevision(observation.projectRoot);
    if (observedAfter !== observation.projectRevision) throw new Error(`Project revision changed during export: ${observedAfter}`);
    if (existsSync(finalPath)) throw new Error(`Export artifact collision: ${finalPath}`);
    renameSync(stagedArtifact, finalPath);
    const finalBytes = readFileSync(finalPath);
    publishedHash = `sha256:${sha256(finalBytes)}`;
    if (publishedHash !== stagedHash || finalBytes.length !== stagedBytes.length) throw new Error("Published artifact bytes differ from verified staging bytes");

    const sealed = writeExportReceipt(resolveStateRoot(options.env || process.env, options.stateRoot), {
      status: "verified",
      classification: "artifact-verified",
      createdAt: new Date().toISOString(),
      startedAt,
      projectRoot: observation.projectRoot,
      projectId: observation.projectId,
      projectRevision: observation.projectRevision,
      presetName: args.presetName,
      presetSha256: observation.presetFile.sha256,
      target: { platform: observation.preset.platform, architecture: observation.preset.architecture, embeddedPck: observation.preset.embeddedPck },
      engine: observation.engine,
      templates: observation.templates,
      outputDirectory,
      artifact: { name: artifactName, path: finalPath, bytes: finalBytes.length, sha256: publishedHash },
      process: processResult,
    });
    return sealed.receipt;
  } catch (error) {
    if (publishedHash && existsSync(finalPath)) {
      try {
        const currentHash = `sha256:${sha256(readFileSync(finalPath))}`;
        if (currentHash === publishedHash) rmSync(finalPath, { force: true });
      } catch {}
    }
    throw error;
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }
}
