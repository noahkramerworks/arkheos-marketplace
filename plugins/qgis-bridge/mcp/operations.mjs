import { spawn } from "node:child_process";
import { copyFileSync, existsSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite, ensureDir, fileSha256, isWithin, ownedFile, readJson, sha256, stateRoot, waitFor } from "./state.mjs";
import { API_VERSION, APPLICATION_VERSION, BRIDGE_VERSION } from "./coordinator.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const QGIS_ROOT = process.env.QGIS_ROOT || "C:\\Users\\rizek\\AppData\\Local\\Programs\\QGIS-4.2.0\\QGIS 4.2.0";
export const QGIS_EXE = process.env.QGIS_EXE || path.join(QGIS_ROOT, "bin", "qgis-bin.exe");
export const QGIS_PYTHON = path.join(QGIS_ROOT, "bin", "python.exe");
const sourceAdapter = path.join(sourceRoot, "qgis-extension", "adapter");
const adapterFiles = ["extension.py", "__init__.py", "metadata.txt", "README.md"];

export function qgisEnvironment(extra = {}) {
  const paths = [path.join(QGIS_ROOT, "apps", "qt6", "bin"), path.join(QGIS_ROOT, "apps", "qgis", "bin"), path.join(QGIS_ROOT, "apps", "Python312", "Scripts"), path.join(QGIS_ROOT, "bin"), process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32") : "", process.env.SystemRoot || ""].filter(Boolean);
  return {
    ...process.env,
    OSGEO4W_ROOT: QGIS_ROOT,
    PATH: paths.join(path.delimiter),
    PYTHONHOME: path.join(QGIS_ROOT, "apps", "Python312"),
    PYTHONPATH: path.join(QGIS_ROOT, "apps", "qgis", "python"),
    PYTHONUTF8: "1",
    QGIS_PREFIX_PATH: path.join(QGIS_ROOT, "apps", "qgis").replaceAll("\\", "/"),
    QT_PLUGIN_PATH: [path.join(QGIS_ROOT, "apps", "qgis", "qtplugins"), path.join(QGIS_ROOT, "apps", "qt6", "plugins")].join(path.delimiter),
    QT_QPA_PLATFORM: "offscreen",
    GDAL_DATA: path.join(QGIS_ROOT, "apps", "gdal", "share", "gdal"),
    GDAL_DRIVER_PATH: path.join(QGIS_ROOT, "apps", "gdal", "lib", "gdalplugins"),
    PROJ_DATA: path.join(QGIS_ROOT, "share", "proj"),
    SSL_CERT_FILE: path.join(QGIS_ROOT, "bin", "curl-ca-bundle.crt"),
    ...extra,
  };
}

function assertNoExtra(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const extra = Object.keys(value).filter((key) => !allowed.has(key)); if (extra.length) throw new Error(`${label} contains forbidden or unsupported fields: ${extra.join(", ")}`);
}
function assertIdentity(result) {
  if (!result?.ok || result.applicationVersion !== APPLICATION_VERSION || result.bridgeVersion !== BRIDGE_VERSION || result.apiVersion !== API_VERSION || result.versionInt !== 40200) throw new Error("native QGIS identity drift");
  return result;
}
function enrollmentFile(runtime) { return ownedFile(runtime.stateRoot, "config", "enrollments.json"); }
function enrollments(runtime) { const file = enrollmentFile(runtime); return existsSync(file) ? readJson(file).roots || [] : []; }
function requireUserProfile(candidate) {
  const profile = path.resolve(process.env.USERPROFILE || ""); if (!profile || !isWithin(profile, candidate)) throw new Error("root must remain beneath the current user profile");
}
function admitProject(candidate, runtime) {
  const resolved = path.resolve(candidate || ""); requireUserProfile(resolved);
  if (!/\.(qgs|qgz)$/i.test(resolved) || !enrollments(runtime).some((root) => isWithin(root, resolved))) throw new Error("project path is not enrolled or has an unsupported extension");
  return resolved;
}
function admitGeoJson(candidate, runtime) {
  const resolved = path.resolve(candidate || ""); requireUserProfile(resolved);
  if (!/\.geojson$/i.test(resolved) || !existsSync(resolved) || !enrollments(runtime).some((root) => isWithin(root, resolved))) throw new Error("GeoJSON path is not an enrolled existing source");
  return resolved;
}
function extensionRoot(runtime) { return ownedFile(runtime.stateRoot, "profile", "python", "plugins", "arkheos_qgis_bridge"); }
function extensionIdentity(runtime) {
  const destination = extensionRoot(runtime); const files = adapterFiles.map((name) => {
    const source = path.join(sourceAdapter, name); const installed = path.join(destination, name);
    return { name, source, installed, sourceSha256: fileSha256(source), installedSha256: existsSync(installed) ? fileSha256(installed) : null };
  });
  return { path: destination, installed: files.every((item) => item.installedSha256), exact: files.every((item) => item.installedSha256 === item.sourceSha256), files };
}
function setupReceipt(runtime, action, detail) {
  const core = { schema: "qgis-bridge/setup-receipt/v1", action, detail, createdAt: new Date().toISOString() };
  const receiptId = `sha256:${sha256(Buffer.from(JSON.stringify(core)))}`; const receipt = { ...core, receiptId };
  atomicWrite(ownedFile(runtime.stateRoot, "setup-receipts", `${receiptId.slice(7)}.json`), `${JSON.stringify(receipt, null, 2)}\n`); return receipt;
}
function installExtension(runtime) {
  const destination = ensureDir(extensionRoot(runtime));
  for (const name of adapterFiles) {
    const source = path.join(sourceAdapter, name); const installed = path.join(destination, name);
    if (existsSync(installed) && fileSha256(installed) !== fileSha256(source)) throw new Error(`foreign or drifted extension file blocks install: ${name}`);
    copyFileSync(source, installed);
  }
  const identity = extensionIdentity(runtime); if (!identity.exact) throw new Error("installed extension does not match source");
  const receipt = setupReceipt(runtime, "install_extension", { extension: identity.path, files: identity.files.map(({ name, installedSha256 }) => ({ name, sha256: installedSha256 })) });
  return { status: "installed", extension: identity, receiptId: receipt.receiptId };
}
function removeExtension(runtime) {
  const identity = extensionIdentity(runtime); if (!identity.installed) return { status: "absent" };
  if (!identity.exact) throw new Error("refusing to remove a drifted or foreign extension");
  rmSync(identity.path, { recursive: true, force: false }); const receipt = setupReceipt(runtime, "remove_extension", { extension: identity.path });
  return { status: "removed", receiptId: receipt.receiptId };
}
function validateLayerId(value) { if (value === "@last_created") return value; if (!/^[A-Za-z0-9_-]{1,120}$/.test(value || "")) throw new Error("layerId is invalid"); return value; }
function validateAction(action, runtime) {
  if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error("action must be an object");
  if (action.type === "add_geojson_layer") {
    assertNoExtra(action, new Set(["type", "sourcePath", "name"]), "add_geojson_layer");
    if (typeof action.name !== "string" || action.name.length < 1 || action.name.length > 80) throw new Error("layer name is invalid");
    return { type: action.type, sourcePath: admitGeoJson(action.sourcePath, runtime), name: action.name };
  }
  if (action.type === "set_single_symbol") {
    assertNoExtra(action, new Set(["type", "layerId", "color", "width"]), "set_single_symbol");
    if (!/^#[0-9A-Fa-f]{6}$/.test(action.color || "") || !Number.isFinite(action.width) || action.width <= 0 || action.width > 10) throw new Error("closed symbol values are invalid");
    return { type: action.type, layerId: validateLayerId(action.layerId), color: action.color.toUpperCase(), width: action.width };
  }
  if (action.type === "rename_owned_layer") {
    assertNoExtra(action, new Set(["type", "layerId", "name"]), "rename_owned_layer");
    if (typeof action.name !== "string" || action.name.length < 1 || action.name.length > 80) throw new Error("layer name is invalid");
    return { type: action.type, layerId: validateLayerId(action.layerId), name: action.name };
  }
  if (action.type === "ensure_layout") {
    assertNoExtra(action, new Set(["type", "name"]), "ensure_layout"); if (!/^ArkheOS_[A-Za-z0-9_-]{1,48}$/.test(action.name || "")) throw new Error("layout name is invalid");
    return { type: action.type, name: action.name };
  }
  if (action.type === "remove_owned_layer") {
    assertNoExtra(action, new Set(["type", "layerId"]), "remove_owned_layer"); return { type: action.type, layerId: validateLayerId(action.layerId) };
  }
  throw new Error("unsupported semantic action");
}
function processRecord(runtime) { return ownedFile(runtime.stateRoot, "process", "current.json"); }
function processAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function launchProject(projectPath, runtime) {
  const project = admitProject(projectPath, runtime); if (!existsSync(project)) throw new Error("project does not exist");
  if (runtime.ownedProcess && runtime.ownedProcess.exitCode === null) throw new Error("an owned QGIS process is already running");
  await runtime.coordinator.start(); const installed = installExtension(runtime); const adapter = path.join(extensionRoot(runtime), "extension.py");
  const logPath = ownedFile(runtime.stateRoot, "logs", `qgis-${Date.now()}.log`); ensureDir(path.dirname(logPath)); const log = openSync(logPath, "a");
  const child = spawn(QGIS_PYTHON, [adapter, "--serve", project], { cwd: path.dirname(project), env: qgisEnvironment({ ARKHEOS_QGIS_ENDPOINT: runtime.coordinator.endpoint, ARKHEOS_QGIS_TOKEN: runtime.coordinator.token }), windowsHide: true, stdio: ["ignore", log, log] });
  runtime.ownedProcess = child; const record = { schema: "qgis-bridge/process/v1", pid: child.pid, projectPath: project, executable: QGIS_PYTHON, adapter, logPath, startedAt: new Date().toISOString() };
  atomicWrite(processRecord(runtime), `${JSON.stringify(record, null, 2)}\n`);
  child.once("exit", (code, signal) => { try { atomicWrite(processRecord(runtime), `${JSON.stringify({ ...record, exitedAt: new Date().toISOString(), exitCode: code, signal }, null, 2)}\n`); } catch {} });
  await waitFor(() => runtime.coordinator.connection(), 60_000, 200); const observation = assertIdentity(await runtime.coordinator.dispatch("inspect", {}));
  if (path.resolve(observation.project.path).toLowerCase() !== project.toLowerCase()) throw new Error("native process opened a different project");
  return { status: "launched", pid: child.pid, projectPath: project, extension: installed.extension, observation };
}
async function closeOwned(runtime) {
  const child = runtime.ownedProcess; if (!child || child.exitCode !== null) return { status: "absent" };
  if (!processAlive(child.pid)) return { status: "exited", pid: child.pid };
  await runtime.coordinator.dispatch("shutdown", {}); await waitFor(() => child.exitCode !== null || !processAlive(child.pid), 30_000, 100);
  return { status: "closed", pid: child.pid, exitCode: child.exitCode };
}

export async function bridgeStatus(args, runtime) {
  assertNoExtra(args, new Set(), "status"); const extension = extensionIdentity(runtime); const connected = runtime.coordinator?.connection?.() || null;
  const process = existsSync(processRecord(runtime)) ? readJson(processRecord(runtime)) : null;
  return { status: "ok", application: { executable: QGIS_EXE, version: "4.2.0-Belém do Pará", versionInt: 40200, sha256: existsSync(QGIS_EXE) ? fileSha256(QGIS_EXE) : null, supported: existsSync(QGIS_EXE) }, pythonRuntime: { executable: QGIS_PYTHON, sha256: existsSync(QGIS_PYTHON) ? fileSha256(QGIS_PYTHON) : null }, extension, connection: connected, process };
}
export async function setupBridge(args, runtime) {
  assertNoExtra(args, new Set(["action", "rootPath", "projectPath"]), "setup");
  if (args.action === "install_extension") return installExtension(runtime);
  if (args.action === "remove_extension") return removeExtension(runtime);
  if (args.action === "enroll_root") {
    const root = path.resolve(args.rootPath || ""); requireUserProfile(root); if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error("enrollment root must be an existing directory");
    const roots = [...new Set([...enrollments(runtime), root])].sort(); atomicWrite(enrollmentFile(runtime), `${JSON.stringify({ schema: "qgis-bridge/enrollments/v1", roots }, null, 2)}\n`); const receipt = setupReceipt(runtime, "enroll_root", { root }); return { status: "enrolled", root, receiptId: receipt.receiptId };
  }
  if (args.action === "launch_project") return await launchProject(args.projectPath, runtime);
  if (args.action === "close_owned_process") return await closeOwned(runtime);
  throw new Error("unsupported setup action");
}
export async function inspectProject(args, runtime) {
  assertNoExtra(args, new Set(), "inspection"); const result = assertIdentity(await runtime.coordinator.dispatch("inspect", {})); admitProject(result.project?.path, runtime); return { status: "ok", ...result };
}
export async function applyTransaction(args, runtime) {
  assertNoExtra(args, new Set(["projectPath", "expectedRevision", "actions"]), "transaction");
  if (!Array.isArray(args.actions) || args.actions.length < 1 || args.actions.length > 32) throw new Error("transaction requires 1..32 actions");
  const actions = args.actions.map((action) => validateAction(action, runtime)); const projectPath = admitProject(args.projectPath, runtime); if (!existsSync(projectPath)) throw new Error("transaction requires an existing project");
  if (!/^sha256:[a-f0-9]{64}$/.test(args.expectedRevision || "")) throw new Error("expectedRevision is invalid");
  const before = assertIdentity(await runtime.coordinator.dispatch("inspect", {}));
  if (before.dirty || path.resolve(before.project?.path || "").toLowerCase() !== projectPath.toLowerCase() || before.revision !== args.expectedRevision) throw new Error("transaction admission failed: dirty, wrong project, or stale revision");
  const preSha256 = fileSha256(projectPath); const provisional = sha256(Buffer.from(`${projectPath}\0${preSha256}\0${JSON.stringify(actions)}`)); const extension = path.extname(projectPath);
  const checkpointPath = ownedFile(runtime.stateRoot, "checkpoints", `${provisional}${extension}`); ensureDir(path.dirname(checkpointPath)); if (!existsSync(checkpointPath)) copyFileSync(projectPath, checkpointPath);
  assertIdentity(await runtime.coordinator.dispatch("apply", { expectedRevision: before.revision, actions })); const after = assertIdentity(await runtime.coordinator.dispatch("inspect", {})); const postSha256 = fileSha256(projectPath);
  if (postSha256 === preSha256 || after.project?.sha256 !== postSha256 || after.dirty) throw new Error("independent QGIS readback did not prove a saved change");
  const core = { schema: "qgis-bridge/receipt/v1", projectPath, preSha256, postSha256, checkpointPath, preRevision: before.revision, postRevision: after.revision, actions, createdAt: new Date().toISOString() };
  const receiptId = `sha256:${sha256(Buffer.from(JSON.stringify(core)))}`; const receipt = { ...core, receiptId };
  atomicWrite(ownedFile(runtime.stateRoot, "receipts", `${receiptId.slice(7)}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  return { status: "applied", receiptId, observation: after, readback: { projectSha256: postSha256 } };
}
export async function exportArtifact(args, runtime) {
  assertNoExtra(args, new Set(["projectPath", "expectedRevision", "layoutName", "format"]), "export"); const projectPath = admitProject(args.projectPath, runtime);
  if (!/^ArkheOS_[A-Za-z0-9_-]{1,48}$/.test(args.layoutName || "") || !["png", "pdf"].includes(args.format)) throw new Error("layoutName or format is invalid");
  const observed = assertIdentity(await runtime.coordinator.dispatch("inspect", {})); if (observed.dirty || observed.revision !== args.expectedRevision || path.resolve(observed.project?.path || "").toLowerCase() !== projectPath.toLowerCase()) throw new Error("export admission failed: dirty, stale, or wrong project");
  const jobId = sha256(Buffer.from(`${projectPath}\0${observed.project.sha256}\0${args.layoutName}\0${args.format}`)); const outputPath = ownedFile(runtime.stateRoot, "exports", `${jobId}.${args.format}`); ensureDir(path.dirname(outputPath));
  const result = assertIdentity(await runtime.coordinator.dispatch("export_layout", { expectedRevision: observed.revision, layoutName: args.layoutName, format: args.format, outputPath }));
  if (!existsSync(outputPath) || result.sha256 !== fileSha256(outputPath) || result.bytes !== statSync(outputPath).size) throw new Error("independent export readback failed");
  return { status: "exported", format: args.format, outputPath, bytes: result.bytes, sha256: result.sha256, sourceRevision: observed.revision, sourceSha256: observed.project.sha256 };
}
export async function rollbackReceipt(args, runtime) {
  assertNoExtra(args, new Set(["receiptId"]), "rollback"); if (!/^sha256:[a-f0-9]{64}$/.test(args.receiptId || "")) throw new Error("invalid receipt ID");
  const file = ownedFile(runtime.stateRoot, "receipts", `${args.receiptId.slice(7)}.json`); if (!existsSync(file)) throw new Error("receipt is not owned by this bridge");
  const receipt = readJson(file); admitProject(receipt.projectPath, runtime);
  if (!existsSync(receipt.checkpointPath) || fileSha256(receipt.checkpointPath) !== receipt.preSha256) throw new Error("checkpoint is missing or corrupt; manual recovery required");
  if (fileSha256(receipt.projectPath) !== receipt.postSha256) throw new Error("current project does not match receipt post-state; manual recovery required");
  copyFileSync(receipt.checkpointPath, receipt.projectPath); assertIdentity(await runtime.coordinator.dispatch("reload", { projectPath: receipt.projectPath })); const observation = assertIdentity(await runtime.coordinator.dispatch("inspect", {})); const restoredSha256 = fileSha256(receipt.projectPath);
  if (restoredSha256 !== receipt.preSha256 || observation.project?.sha256 !== receipt.preSha256 || observation.revision !== receipt.preRevision || observation.dirty) throw new Error("exact restoration or native readback failed; manual recovery required");
  return { status: "rolled-back", classification: "explicit-rollback", receiptId: args.receiptId, restoredSha256, exactBytes: true, observation };
}

export const runtime = { stateRoot: stateRoot() };
