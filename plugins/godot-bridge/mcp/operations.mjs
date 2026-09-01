import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { changedTargets, exactKeys, object, validateTransaction } from "./protocol.mjs";
import { closeOwned, inspectEngine, openEditor, ownedProcess, resolveEngine, waitForOwnedExit } from "./godot-process.mjs";
import { PLUGIN_VERSION, atomicWrite, createCheckpoint, enrollmentFile, legacyProjectRevision, projectId, projectRevision, readEnrollment, readReceipt, redact, resolveProjectRoot, resolveResPath, resolveStateRoot, restoreCheckpoint, sha256, writeJson, writeReceipt } from "./state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const addonSource = path.join(root, "godot-addon", "codex_godot_bridge");
const addonResource = "res://addons/codex_godot_bridge/plugin.cfg";
const MAX_LIST = 500;

function quotedStrings(text) { return [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => JSON.parse(`"${match[1]}"`)); }

function setPluginEnabled(text, enabled) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "[editor_plugins]");
  const end = start < 0 ? -1 : lines.findIndex((line, index) => index > start && /^\[[^\]]+\]$/.test(line.trim()));
  const sectionEnd = start < 0 ? -1 : (end < 0 ? lines.length : end);
  let values = [];
  let enabledIndex = -1;
  if (start >= 0) {
    enabledIndex = lines.findIndex((line, index) => index > start && index < sectionEnd && /^enabled\s*=/.test(line.trim()));
    if (enabledIndex >= 0) {
      const line = lines[enabledIndex].match(/^enabled\s*=\s*PackedStringArray\((.*)\)\s*$/);
      if (line) values = quotedStrings(line[1]);
    }
  }
  const wasEnabled = values.includes(addonResource);
  values = enabled ? [...new Set([...values, addonResource])] : values.filter((value) => value !== addonResource);
  const rendered = `enabled=PackedStringArray(${values.map((value) => JSON.stringify(value)).join(", ")})`;
  let next;
  if (start >= 0) {
    if (enabledIndex >= 0) lines[enabledIndex] = rendered;
    else lines.splice(sectionEnd, 0, rendered);
    next = lines.join(eol);
  } else next = `${text.trimEnd()}${eol}${eol}[editor_plugins]${eol}${eol}${rendered}${eol}`;
  return { text: next, wasEnabled };
}

function addonFiles() {
  return readdirSync(addonSource, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
}

function copyAddon(projectRoot) {
  const targetRoot = path.join(projectRoot, "addons", "codex_godot_bridge");
  mkdirSync(targetRoot, { recursive: true });
  const installed = [];
  for (const name of addonFiles()) {
    const source = path.join(addonSource, name);
    const target = path.join(targetRoot, name);
    const bytes = readFileSync(source);
    if (existsSync(target) && !readFileSync(target).equals(bytes)) throw new Error(`Conflicting Godot addon file: ${target}`);
    if (!existsSync(target)) copyFileSync(source, target);
    installed.push({ relative: `addons/codex_godot_bridge/${name}`, sha256: `sha256:${sha256(bytes)}`, bytes: bytes.length });
  }
  return installed;
}

function upgradeOwnedAddon(projectRoot, file, enrollment) {
  const targetRoot = path.join(projectRoot, "addons", "codex_godot_bridge");
  if (!existsSync(targetRoot)) throw new Error("Owned addon directory is missing; refusing enrollment upgrade");
  const previousRecords = Array.isArray(enrollment.addonFiles) ? enrollment.addonFiles : [];
  const previousByName = new Map();
  const previousBytes = new Map();
  for (const record of previousRecords) {
    const expectedPrefix = "addons/codex_godot_bridge/";
    if (typeof record.relative !== "string" || !record.relative.startsWith(expectedPrefix) || record.relative.slice(expectedPrefix.length).includes("/")) throw new Error("Enrollment contains an invalid owned addon path");
    const name = record.relative.slice(expectedPrefix.length);
    const target = path.join(targetRoot, name);
    if (!existsSync(target) || !statSync(target).isFile()) throw new Error(`Owned addon file is missing; refusing upgrade: ${record.relative}`);
    const bytes = readFileSync(target);
    if (`sha256:${sha256(bytes)}` !== record.sha256) throw new Error(`Owned addon file changed; refusing upgrade: ${record.relative}`);
    previousByName.set(name, record);
    previousBytes.set(name, bytes);
  }
  for (const entry of readdirSync(targetRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !previousByName.has(entry.name)) throw new Error(`Foreign addon entry blocks enrollment upgrade: ${entry.name}`);
  }

  const nextRecords = addonFiles().map((name) => {
    const bytes = readFileSync(path.join(addonSource, name));
    return { name, bytes, relative: `addons/codex_godot_bridge/${name}`, sha256: `sha256:${sha256(bytes)}`, byteLength: bytes.length };
  });
  const currentMatches = nextRecords.length === previousRecords.length && nextRecords.every((next) => {
    const previous = previousByName.get(next.name);
    return previous?.sha256 === next.sha256 && existsSync(path.join(targetRoot, next.name));
  });
  if (currentMatches && enrollment.pluginVersion === PLUGIN_VERSION) return { status: "already-enrolled", enrollment };

  try {
    for (const next of nextRecords) atomicWrite(path.join(targetRoot, next.name), next.bytes, { mode: 0o644 });
    for (const name of previousByName.keys()) if (!nextRecords.some((next) => next.name === name)) rmSync(path.join(targetRoot, name), { force: true });
    const upgradedAt = new Date().toISOString();
    const upgraded = {
      ...enrollment,
      pluginVersion: PLUGIN_VERSION,
      addonFiles: nextRecords.map(({ name, bytes, byteLength, ...record }) => ({ ...record, bytes: byteLength })),
      addonUpgradedAt: upgradedAt,
      addonUpgradeHistory: [
        ...(Array.isArray(enrollment.addonUpgradeHistory) ? enrollment.addonUpgradeHistory : []),
        { fromPluginVersion: enrollment.pluginVersion || null, toPluginVersion: PLUGIN_VERSION, upgradedAt, previousAddonFiles: previousRecords },
      ],
    };
    writeJson(file, upgraded);
    return { status: "upgraded", enrollment: upgraded };
  } catch (error) {
    for (const [name, bytes] of previousBytes) atomicWrite(path.join(targetRoot, name), bytes, { mode: 0o644 });
    for (const next of nextRecords) if (!previousByName.has(next.name)) rmSync(path.join(targetRoot, next.name), { force: true });
    throw error;
  }
}

function listProjectFiles(projectRoot) {
  const result = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const relative = path.relative(projectRoot, full).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        if (entry.name === ".godot" || relative === "addons/codex_godot_bridge") continue;
        walk(full);
      } else if (/\.(gd|gdshader|tscn|tres|res)$/i.test(entry.name)) result.push({ path: `res://${relative}`, bytes: statSync(full).size, sha256: `sha256:${sha256(readFileSync(full))}` });
    }
  };
  walk(projectRoot);
  return result.sort((a, b) => a.path.localeCompare(b.path)).slice(0, MAX_LIST);
}

function coordinator(options) {
  if (!options.coordinator) throw new Error("Godot Bridge coordinator is unavailable");
  return options.coordinator;
}

export async function inspectInstallation(args = {}, options = {}) {
  object(args, "arguments"); exactKeys(args, ["enginePath"], "arguments");
  const engine = inspectEngine(args.enginePath, options.env || process.env);
  return { schema: "godot-bridge/installation/v1", status: "observed", ...engine, supported: engine.version.startsWith("4.7.1") };
}

export async function enrollProject(args, options = {}) {
  object(args, "arguments"); exactKeys(args, ["projectRoot", "enginePath"], "arguments");
  const stateRoot = resolveStateRoot(options.env || process.env, options.stateRoot);
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const engine = inspectEngine(args.enginePath, options.env || process.env);
  const file = enrollmentFile(stateRoot, projectRoot);
  if (existsSync(file)) {
    const existing = JSON.parse(readFileSync(file, "utf8"));
    return upgradeOwnedAddon(projectRoot, file, existing);
  }
  const projectFile = path.join(projectRoot, "project.godot");
  const prior = readFileSync(projectFile);
  const priorGodotDirectoryExisted = existsSync(path.join(projectRoot, ".godot"));
  const priorAddonsDirectoryExisted = existsSync(path.join(projectRoot, "addons"));
  const installedFiles = copyAddon(projectRoot);
  const enabled = setPluginEnabled(prior.toString("utf8"), true);
  atomicWrite(projectFile, enabled.text);
  const enrollment = {
    schema: "godot-bridge/enrollment/v1", pluginVersion: PLUGIN_VERSION, projectId: projectId(projectRoot), projectRoot,
    engine, enrolledAt: new Date().toISOString(), addonResource, addonWasEnabled: enabled.wasEnabled,
    addonFiles: installedFiles, priorProjectGodotBase64: prior.toString("base64"), projectGodotPreSha256: `sha256:${sha256(prior)}`, projectGodotPostSha256: `sha256:${sha256(readFileSync(projectFile))}`,
    priorGodotDirectoryExisted, priorAddonsDirectoryExisted,
  };
  writeJson(file, enrollment, { immutable: true });
  return { status: "enrolled", enrollment };
}

export async function unenrollProject(args, options = {}) {
  object(args, "arguments"); exactKeys(args, ["projectRoot"], "arguments");
  const stateRoot = resolveStateRoot(options.env || process.env, options.stateRoot);
  const projectRoot = resolveProjectRoot(args.projectRoot);
  if (options.coordinator?.isConnected(projectRoot)) throw new Error("Close the connected Godot editor before unenrollment");
  const { file, enrollment } = readEnrollment(stateRoot, projectRoot);
  for (const record of enrollment.addonFiles) {
    const target = path.join(projectRoot, record.relative.replaceAll("/", path.sep));
    if (!existsSync(target) || `sha256:${sha256(readFileSync(target))}` !== record.sha256) throw new Error(`Owned addon file changed; refusing removal: ${record.relative}`);
  }
  const projectFile = path.join(projectRoot, "project.godot");
  const currentBytes = readFileSync(projectFile);
  const currentProjectGodotSha256 = `sha256:${sha256(currentBytes)}`;
  const currentRevision = projectRevision(projectRoot);
  const currentLegacyRevision = legacyProjectRevision(projectRoot);
  const matchesKnownBaseline = currentProjectGodotSha256 === enrollment.projectGodotPostSha256 || (
    currentProjectGodotSha256 === enrollment.ownedEditorBaselineProjectGodotSha256 &&
    (currentRevision === enrollment.ownedEditorBaselineRevision || currentLegacyRevision === enrollment.ownedEditorBaselineRevision)
  );
  if (matchesKnownBaseline && enrollment.priorProjectGodotBase64) {
    atomicWrite(projectFile, Buffer.from(enrollment.priorProjectGodotBase64, "base64"));
  } else {
    const updated = setPluginEnabled(currentBytes.toString("utf8"), Boolean(enrollment.addonWasEnabled));
    atomicWrite(projectFile, updated.text);
  }
  for (const record of enrollment.addonFiles) rmSync(path.join(projectRoot, record.relative.replaceAll("/", path.sep)), { force: true });
  rmSync(path.join(projectRoot, "addons", "codex_godot_bridge"), { recursive: true, force: true });
  const addonsRoot = path.join(projectRoot, "addons");
  if (!enrollment.priorAddonsDirectoryExisted && existsSync(addonsRoot) && readdirSync(addonsRoot).length === 0) rmSync(addonsRoot, { recursive: true, force: true });
  const godotCache = path.join(projectRoot, ".godot");
  if (matchesKnownBaseline && !enrollment.priorGodotDirectoryExisted && existsSync(godotCache)) rmSync(godotCache, { recursive: true, force: true });
  rmSync(file, { force: true });
  return { status: "unenrolled", projectRoot, removed: enrollment.addonFiles.map((item) => item.relative), addonEnabled: Boolean(enrollment.addonWasEnabled), exactProjectGodotRestored: matchesKnownBaseline, generatedCacheRemoved: matchesKnownBaseline && !enrollment.priorGodotDirectoryExisted };
}

export async function openProject(args, options = {}) {
  object(args, "arguments"); exactKeys(args, ["projectRoot", "mode"], "arguments");
  const stateRoot = resolveStateRoot(options.env || process.env, options.stateRoot);
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const { enrollment } = readEnrollment(stateRoot, projectRoot);
  const bridge = coordinator(options); await bridge.start();
  return { projectRoot, ...openEditor({ enginePath: resolveEngine(enrollment.engine.enginePath, options.env || process.env), projectRoot, mode: args.mode || "editor", discovery: { endpoint: bridge.endpoint, token: bridge.token } }) };
}

export async function closeOwnedEditor(args, options = {}) {
  object(args, "arguments"); exactKeys(args, ["projectRoot"], "arguments");
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const result = closeOwned(projectRoot);
  const exited = result.stopped ? await waitForOwnedExit(projectRoot) : !ownedProcess(projectRoot)?.running;
  if (result.stopped && !exited) throw new Error(`Owned Godot editor did not exit within the bounded timeout: ${result.processId}`);
  if (exited) options.coordinator?.disconnect(projectRoot);
  return { projectRoot, ...result, status: result.stopped ? "stopped" : result.status, running: Boolean(ownedProcess(projectRoot)?.running) };
}

export async function inspectProject(args, options = {}) {
  object(args, "arguments"); exactKeys(args, ["projectRoot", "include", "cursor"], "arguments");
  const stateRoot = resolveStateRoot(options.env || process.env, options.stateRoot);
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const enrollmentRecord = readEnrollment(stateRoot, projectRoot);
  const bridge = coordinator(options); await bridge.start();
  let native = null;
  if (bridge.isConnected(projectRoot)) native = await bridge.dispatch(projectRoot, "inspect_project", { include: args.include || [], cursor: args.cursor || null });
  const revision = projectRevision(projectRoot);
  const editorProcess = ownedProcess(projectRoot);
  if (native && editorProcess?.running && !enrollmentRecord.enrollment.ownedEditorBaselineRevision) {
    enrollmentRecord.enrollment.ownedEditorBaselineRevision = revision;
    enrollmentRecord.enrollment.ownedEditorBaselineProjectGodotSha256 = `sha256:${sha256(readFileSync(path.join(projectRoot, "project.godot")))}`;
    enrollmentRecord.enrollment.ownedEditorBaselineCapturedAt = new Date().toISOString();
    writeJson(enrollmentRecord.file, enrollmentRecord.enrollment);
  }
  const files = listProjectFiles(projectRoot);
  return {
    schema: "godot-bridge/observation/v1", status: native ? "observed" : "disconnected", projectRoot, projectId: projectId(projectRoot), revision,
    connected: Boolean(native), dirty: Boolean(native?.dirty), engine: native?.engine || null, editor: native?.editor || { ownedProcess: editorProcess },
    scene: native?.scene || null, scripts: native?.scripts || files.filter((item) => item.path.endsWith(".gd")), resources: native?.resources || files.filter((item) => !item.path.endsWith(".gd")),
    diagnostics: native?.diagnostics || [], imports: native?.imports || null, playtest: native?.playtest || null, nextCursor: native?.nextCursor || null,
  };
}

function receiptBody({ projectRoot, transaction, checkpoint, preRevision, postRevision, native, status, classification, error = null, rollback = null }) {
  return {
    status, classification, projectRoot, projectId: projectId(projectRoot), transactionId: transaction.transactionId, createdAt: new Date().toISOString(),
    preRevision, postRevision, changedTargets: changedTargets(transaction), checkpointId: checkpoint.checkpointId,
    checkpoints: checkpoint.entries, nativeReadback: native ? redact(native) : null, error: error ? { message: String(error.message).slice(0, 2000) } : null, rollback,
  };
}

function capturePostState(projectRoot, entries) {
  return entries.map((entry) => {
    const { target } = resolveResPath(projectRoot, entry.resource);
    const postExisted = existsSync(target);
    return { ...entry, postExisted, postSha256: postExisted ? sha256(readFileSync(target)) : null };
  });
}

function targetsMatch(projectRoot, entries, phase) {
  const existedKey = phase === "pre" ? "existed" : "postExisted";
  const hashKey = phase === "pre" ? "preSha256" : "postSha256";
  return entries.every((entry) => {
    if (!(existedKey in entry) || !(hashKey in entry)) return false;
    const { target } = resolveResPath(projectRoot, entry.resource);
    if (!entry[existedKey]) return !existsSync(target);
    return existsSync(target) && sha256(readFileSync(target)) === entry[hashKey];
  });
}

async function prepareExternalRestore(bridge, projectRoot, targets) {
  const scenePaths = targets.filter((target) => target.endsWith(".tscn"));
  if (!bridge.isConnected(projectRoot)) return { status: "disconnected", scenePaths };
  const prepared = await bridge.dispatch(projectRoot, "prepare_external_restore", { targets }, 30_000);
  if (prepared?.status !== "verified") throw new Error(prepared?.error || "Godot editor refused external restore preparation");
  return { ...prepared, scenePaths: [...new Set([...(prepared.scenePaths || []), ...scenePaths])].sort() };
}

async function reloadAfterExternalRestore(bridge, projectRoot, preparation) {
  if (!bridge.isConnected(projectRoot)) return { status: "disconnected", reloaded: false };
  const reload = await bridge.dispatch(projectRoot, "reload_project", { scenePaths: preparation.scenePaths || [] }, 30_000);
  if (reload?.status !== "verified") throw new Error(reload?.error || "Godot editor failed to reload restored state");
  return reload;
}

export async function applyTransaction(args, options = {}) {
  const stateRoot = resolveStateRoot(options.env || process.env, options.stateRoot);
  const projectRoot = resolveProjectRoot(args.projectRoot);
  readEnrollment(stateRoot, projectRoot);
  const transaction = validateTransaction(args, projectRoot);
  const preRevision = projectRevision(projectRoot);
  if (preRevision !== transaction.expectedRevision) throw new Error(`Stale project revision: expected ${transaction.expectedRevision}, observed ${preRevision}`);
  const targets = changedTargets(transaction);
  if (!targets.length) throw new Error("Transaction does not bind any persistent target");
  const checkpoint = createCheckpoint(stateRoot, projectRoot, targets, transaction.transactionId);
  const bridge = coordinator(options); await bridge.start();
  let native = null;
  try {
    native = await bridge.dispatch(projectRoot, "apply_transaction", transaction, 120_000);
    if (native.status !== "verified") throw new Error(native.error || `Native transaction returned ${native.status || "unknown"}`);
    const postRevision = projectRevision(projectRoot);
    const verifiedCheckpoint = { ...checkpoint, entries: capturePostState(projectRoot, checkpoint.entries) };
    return writeReceipt(stateRoot, receiptBody({ projectRoot, transaction, checkpoint: verifiedCheckpoint, preRevision, postRevision, native, status: "verified", classification: "outcome-verified" })).receipt;
  } catch (error) {
    let preparation = null;
    let reload = null;
    let recoveryError = null;
    try {
      preparation = await prepareExternalRestore(bridge, projectRoot, targets);
      restoreCheckpoint(stateRoot, checkpoint.checkpointId, projectRoot);
      reload = await reloadAfterExternalRestore(bridge, projectRoot, preparation);
    } catch (caught) { recoveryError = caught; }
    const restored = projectRevision(projectRoot);
    const restoredBytes = restored === preRevision;
    const nativeReloadVerified = reload?.status === "verified" || preparation?.status === "disconnected";
    const rollback = {
      status: restoredBytes && nativeReloadVerified && !recoveryError ? "verified-restored" : "manual-recovery-required",
      observedRevision: restored,
      preparation: preparation ? redact(preparation) : null,
      reload: reload ? redact(reload) : null,
      recoveryError: recoveryError ? String(recoveryError.message).slice(0, 2000) : null,
    };
    return writeReceipt(stateRoot, receiptBody({ projectRoot, transaction, checkpoint, preRevision, postRevision: restored, native, status: rollback.status === "verified-restored" ? "rolled-back" : "manual-recovery-required", classification: "transaction-failed", error, rollback })).receipt;
  }
}

export async function startPlaytest(args, options = {}) {
  object(args, "arguments"); exactKeys(args, ["projectRoot", "expectedRevision", "scenePath"], "arguments");
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const observed = projectRevision(projectRoot);
  if (observed !== args.expectedRevision) throw new Error(`Stale project revision: expected ${args.expectedRevision}, observed ${observed}`);
  if (args.scenePath) resolveResPath(projectRoot, args.scenePath, { mustExist: true });
  return await coordinator(options).dispatch(projectRoot, "start_playtest", { expectedRevision: observed, scenePath: args.scenePath || null }, 60_000);
}

export async function inspectPlaytest(args, options = {}) {
  object(args, "arguments"); exactKeys(args, ["runId", "cursor"], "arguments");
  return await coordinator(options).dispatch(options.runProjects?.get(args.runId) || args.projectRoot || "", "inspect_playtest", { runId: args.runId, cursor: args.cursor || null });
}

export async function captureViewport(args, options = {}) {
  object(args, "arguments"); exactKeys(args, ["runId"], "arguments");
  const projectRoot = options.runProjects?.get(args.runId);
  if (!projectRoot) throw new Error("Unknown bridge-owned runId");
  return await coordinator(options).dispatch(projectRoot, "capture_viewport", { runId: args.runId }, 60_000);
}

export async function stopPlaytest(args, options = {}) {
  object(args, "arguments"); exactKeys(args, ["runId"], "arguments");
  const projectRoot = options.runProjects?.get(args.runId);
  if (!projectRoot) return { status: "already-stopped", runId: args.runId };
  const result = await coordinator(options).dispatch(projectRoot, "stop_playtest", { runId: args.runId });
  options.runProjects.delete(args.runId);
  return result;
}

export async function rollbackReceipt(args, options = {}) {
  object(args, "arguments"); exactKeys(args, ["receiptId"], "arguments");
  const stateRoot = resolveStateRoot(options.env || process.env, options.stateRoot);
  const { receipt: source } = readReceipt(stateRoot, args.receiptId);
  const projectRoot = resolveProjectRoot(source.projectRoot);
  const current = projectRevision(projectRoot);
  const hasTargetPostState = (source.checkpoints || []).every((entry) => "postExisted" in entry && "postSha256" in entry);
  const comparableCurrent = hasTargetPostState ? current : legacyProjectRevision(projectRoot);
  const matchesPreTargets = targetsMatch(projectRoot, source.checkpoints || [], "pre");
  if (source.status === "rolled-back" && comparableCurrent === source.preRevision && matchesPreTargets) return { schema: "godot-bridge/receipt/v1", receiptId: source.receiptId, status: "already-restored", classification: "explicit-rollback", projectRoot, createdAt: new Date().toISOString() };
  if (source.status !== "verified") throw new Error(`Receipt is not rollback-eligible: ${source.status}`);
  if (comparableCurrent === source.preRevision && matchesPreTargets) return { schema: "godot-bridge/receipt/v1", receiptId: source.receiptId, status: "already-restored", classification: "explicit-rollback", projectRoot, createdAt: new Date().toISOString() };
  if (comparableCurrent !== source.postRevision) throw new Error(`Project changed after receipt; expected ${source.postRevision}, observed ${comparableCurrent}`);
  if (hasTargetPostState && !targetsMatch(projectRoot, source.checkpoints, "post")) throw new Error("Receipt target bytes changed after transaction");
  const bridge = coordinator(options); await bridge.start();
  let preparation = null;
  let reload = null;
  try {
    preparation = await prepareExternalRestore(bridge, projectRoot, source.changedTargets || []);
    restoreCheckpoint(stateRoot, source.checkpointId, projectRoot);
    reload = await reloadAfterExternalRestore(bridge, projectRoot, preparation);
  } catch (error) { reload = { status: "failed", error: error.message }; }
  const restored = projectRevision(projectRoot);
  const status = restored === source.preRevision && (reload?.status === "verified" || preparation?.status === "disconnected") ? "rolled-back" : "manual-recovery-required";
  return writeReceipt(stateRoot, { status, classification: "explicit-rollback", projectRoot, projectId: projectId(projectRoot), createdAt: new Date().toISOString(), sourceReceiptId: source.receiptId, preRevision: source.postRevision, postRevision: restored, changedTargets: source.changedTargets, checkpoints: source.checkpoints, nativeReadback: { preparation, reload }, rollback: { status: status === "rolled-back" ? "verified-restored" : "manual-recovery-required" } }).receipt;
}

export function bindRun(result, projectRoot, options) {
  if (result?.runId) options.runProjects?.set(result.runId, projectRoot);
  return result;
}
