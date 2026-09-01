import { spawn } from "node:child_process";
import { copyFileSync, existsSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite, ensureDir, fileSha256, isWithin, ownedFile, readJson, sha256, stateRoot, waitFor } from "./state.mjs";
import { API_VERSION, APPLICATION_VERSION, BRIDGE_VERSION } from "./coordinator.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const KRITA_EXE = process.env.KRITA_EXE || "C:\\Program Files\\Krita (x64)\\bin\\krita.exe";
const sourceAdapter = path.join(sourceRoot, "krita-extension", "adapter");
const packageFiles = ["extension.py", "__init__.py", "README.md"];
const desktopFile = "krita_bridge.desktop";

function assertNoExtra(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length) throw new Error(`${label} contains forbidden or unsupported fields: ${extra.join(", ")}`);
}

function assertIdentity(result) {
  if (!result?.ok || result.applicationVersion !== APPLICATION_VERSION || result.bridgeVersion !== BRIDGE_VERSION || result.apiVersion !== API_VERSION || result.versionInt !== 50303 || !String(result.applicationName || "").startsWith("5.3.3")) throw new Error("native Krita identity drift");
  return result;
}

function enrollmentFile(runtime) { return ownedFile(runtime.stateRoot, "config", "enrollments.json"); }
function enrollments(runtime) { const file = enrollmentFile(runtime); return existsSync(file) ? readJson(file).roots || [] : []; }
function requireUserProfile(candidate) {
  const profile = path.resolve(process.env.USERPROFILE || "");
  if (!profile || !isWithin(profile, candidate)) throw new Error("root must remain beneath the current user profile");
}
function admitDocument(candidate, runtime) {
  const resolved = path.resolve(candidate || "");
  requireUserProfile(resolved);
  if (!/\.kra$/i.test(resolved) || !enrollments(runtime).some((root) => isWithin(root, resolved))) throw new Error("document path is not enrolled or is not a .kra file");
  return resolved;
}

function profileRoot(runtime) { return ownedFile(runtime.stateRoot, "profile"); }
function isolatedUserProfile(runtime) { return ownedFile(profileRoot(runtime), "user"); }
function roamingRoot(runtime) { return ownedFile(isolatedUserProfile(runtime), "AppData", "Roaming"); }
function localRoot(runtime) { return ownedFile(isolatedUserProfile(runtime), "AppData", "Local"); }
function extensionPackageRoot(runtime) { return ownedFile(roamingRoot(runtime), "krita", "pykrita", "arkheos_krita_bridge"); }
function extensionDesktopPath(runtime) { return ownedFile(roamingRoot(runtime), "krita", "pykrita", "arkheos_krita_bridge.desktop"); }
function configPaths(runtime) { return [ownedFile(localRoot(runtime), "kritarc")]; }
function configEnablesPlugin(file) { return existsSync(file) && /^enable_arkheos_krita_bridge=true$/m.test(readFileSync(file, "utf8")); }
function enablePluginConfig(file) {
  ensureDir(path.dirname(file)); let value = existsSync(file) ? readFileSync(file, "utf8").replaceAll("\r\n", "\n") : "";
  if (/^enable_arkheos_krita_bridge=.*$/m.test(value)) value = value.replace(/^enable_arkheos_krita_bridge=.*$/m, "enable_arkheos_krita_bridge=true");
  else if (/^\[python\]$/m.test(value)) value = value.replace(/^\[python\]$/m, "[python]\nenable_arkheos_krita_bridge=true");
  else value = `${value}${value && !value.endsWith("\n") ? "\n" : ""}[python]\nenable_arkheos_krita_bridge=true\n`;
  atomicWrite(file, value);
}

function extensionIdentity(runtime) {
  const destination = extensionPackageRoot(runtime);
  const files = packageFiles.map((name) => {
    const source = path.join(sourceAdapter, name); const installed = path.join(destination, name);
    return { name, source, installed, sourceSha256: fileSha256(source), installedSha256: existsSync(installed) ? fileSha256(installed) : null };
  });
  const desktopSource = path.join(sourceAdapter, desktopFile); const desktopInstalled = extensionDesktopPath(runtime);
  files.push({ name: desktopFile, source: desktopSource, installed: desktopInstalled, sourceSha256: fileSha256(desktopSource), installedSha256: existsSync(desktopInstalled) ? fileSha256(desktopInstalled) : null });
  const configs = configPaths(runtime).map((file) => ({ path: file, enabled: configEnablesPlugin(file) }));
  return { path: destination, desktopPath: desktopInstalled, installed: files.every((item) => item.installedSha256), exact: files.every((item) => item.installedSha256 === item.sourceSha256) && configs.every((item) => item.enabled), files, configs };
}

function setupReceipt(runtime, action, detail) {
  const core = { schema: "krita-bridge/setup-receipt/v1", action, detail, createdAt: new Date().toISOString() };
  const receiptId = `sha256:${sha256(Buffer.from(JSON.stringify(core)))}`; const receipt = { ...core, receiptId };
  atomicWrite(ownedFile(runtime.stateRoot, "setup-receipts", `${receiptId.slice(7)}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function installExtension(runtime) {
  const destination = ensureDir(extensionPackageRoot(runtime));
  ensureDir(path.dirname(extensionDesktopPath(runtime)));
  for (const name of packageFiles) {
    const source = path.join(sourceAdapter, name); const installed = path.join(destination, name);
    copyFileSync(source, installed);
  }
  const desktopSource = path.join(sourceAdapter, desktopFile); const desktopInstalled = extensionDesktopPath(runtime);
  copyFileSync(desktopSource, desktopInstalled);
  for (const config of configPaths(runtime)) enablePluginConfig(config);
  const identity = extensionIdentity(runtime); if (!identity.exact) throw new Error("installed extension does not match source");
  const receipt = setupReceipt(runtime, "install_extension", { extension: identity.path, files: identity.files.map(({ name, installedSha256 }) => ({ name, sha256: installedSha256 })) });
  return { status: "installed", extension: identity, receiptId: receipt.receiptId };
}

function removeExtension(runtime) {
  const identity = extensionIdentity(runtime);
  if (!identity.installed && !existsSync(identity.desktopPath)) return { status: "absent" };
  if (!identity.exact) throw new Error("refusing to remove a drifted bridge-owned extension");
  rmSync(identity.path, { recursive: true, force: false });
  rmSync(identity.desktopPath, { force: false });
  for (const config of configPaths(runtime)) if (existsSync(config)) atomicWrite(config, readFileSync(config, "utf8").replace(/^enable_arkheos_krita_bridge=.*$/m, "enable_arkheos_krita_bridge=false"));
  const receipt = setupReceipt(runtime, "remove_extension", { extension: identity.path, desktopPath: identity.desktopPath });
  return { status: "removed", receiptId: receipt.receiptId };
}

export function kritaEnvironment(runtime, extra = {}) {
  const isolatedProfile = ensureDir(isolatedUserProfile(runtime)); const roaming = ensureDir(roamingRoot(runtime)); const local = ensureDir(localRoot(runtime));
  return { ...process.env, USERPROFILE: isolatedProfile, APPDATA: roaming, LOCALAPPDATA: local, XDG_CONFIG_HOME: local, XDG_DATA_HOME: roaming, PYTHONUTF8: "1", ARKHEOS_KRITA_PROFILE: profileRoot(runtime), ...extra };
}

function validateLayerId(value) {
  if (value === "@last_created") return value;
  if (!/^[A-Fa-f0-9-]{32,38}$/.test(value || "")) throw new Error("layerId is invalid");
  return value;
}
function validateOwnedName(value) {
  if (!/^ArkheOS_[A-Za-z0-9_-]{1,48}$/.test(value || "")) throw new Error("owned layer name is invalid");
  return value;
}
function validateAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error("action must be an object");
  if (action.type === "create_paint_layer") {
    assertNoExtra(action, new Set(["type", "name"]), action.type); return { type: action.type, name: validateOwnedName(action.name) };
  }
  if (action.type === "rename_owned_layer") {
    assertNoExtra(action, new Set(["type", "layerId", "name"]), action.type); return { type: action.type, layerId: validateLayerId(action.layerId), name: validateOwnedName(action.name) };
  }
  if (action.type === "set_opacity") {
    assertNoExtra(action, new Set(["type", "layerId", "opacity"]), action.type);
    if (!Number.isInteger(action.opacity) || action.opacity < 0 || action.opacity > 255) throw new Error("opacity must be an integer from 0 to 255");
    return { type: action.type, layerId: validateLayerId(action.layerId), opacity: action.opacity };
  }
  if (action.type === "set_visibility") {
    assertNoExtra(action, new Set(["type", "layerId", "visible"]), action.type);
    if (typeof action.visible !== "boolean") throw new Error("visible must be boolean");
    return { type: action.type, layerId: validateLayerId(action.layerId), visible: action.visible };
  }
  if (action.type === "translate_owned_layer") {
    assertNoExtra(action, new Set(["type", "layerId", "dx", "dy"]), action.type);
    if (![action.dx, action.dy].every((value) => Number.isInteger(value) && value >= -512 && value <= 512)) throw new Error("translation offsets must be integers from -512 to 512");
    return { type: action.type, layerId: validateLayerId(action.layerId), dx: action.dx, dy: action.dy };
  }
  throw new Error("unsupported semantic action");
}

function processRecord(runtime) { return ownedFile(runtime.stateRoot, "process", "current.json"); }
function processAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

async function launchOwned(documentPath, runtime) {
  if (runtime.ownedProcess && runtime.ownedProcess.exitCode === null) throw new Error("an owned Krita process is already running");
  await runtime.coordinator.start(); const installed = installExtension(runtime);
  const logPath = ownedFile(runtime.stateRoot, "logs", `krita-${Date.now()}.log`); ensureDir(path.dirname(logPath)); const log = openSync(logPath, "a");
  const args = ["--nosplash"]; if (documentPath) args.push(documentPath);
  const child = spawn(KRITA_EXE, args, { cwd: documentPath ? path.dirname(documentPath) : sourceRoot, env: kritaEnvironment(runtime, { ARKHEOS_KRITA_ENDPOINT: runtime.coordinator.endpoint, ARKHEOS_KRITA_TOKEN: runtime.coordinator.token }), windowsHide: true, stdio: ["ignore", log, log] });
  runtime.ownedProcess = child;
  const record = { schema: "krita-bridge/process/v1", pid: child.pid, documentPath: documentPath || null, executable: KRITA_EXE, profile: profileRoot(runtime), logPath, startedAt: new Date().toISOString() };
  atomicWrite(processRecord(runtime), `${JSON.stringify(record, null, 2)}\n`);
  child.once("exit", (code, signal) => { try { atomicWrite(processRecord(runtime), `${JSON.stringify({ ...record, exitedAt: new Date().toISOString(), exitCode: code, signal }, null, 2)}\n`); } catch {} });
  await waitFor(() => runtime.coordinator.connection(), 60_000, 200);
  return { child, installed, record };
}

async function launchDocument(documentPath, runtime) {
  const document = admitDocument(documentPath, runtime); if (!existsSync(document)) throw new Error("document does not exist");
  const launched = await launchOwned(document, runtime);
  const observation = await waitFor(async () => { try { return assertIdentity(await runtime.coordinator.dispatch("inspect", {}, 5_000)); } catch { return null; } }, 60_000, 250);
  if (path.resolve(observation.document.path).toLowerCase() !== document.toLowerCase()) throw new Error("native process opened a different document");
  return { status: "launched", pid: launched.child.pid, documentPath: document, extension: launched.installed.extension, observation };
}

async function closeOwned(runtime) {
  const child = runtime.ownedProcess;
  if (!child || child.exitCode !== null) return { status: "absent" };
  if (!processAlive(child.pid)) return { status: "exited", pid: child.pid };
  await runtime.coordinator.dispatch("shutdown", {}); await waitFor(() => child.exitCode !== null || !processAlive(child.pid), 30_000, 100);
  return { status: "closed", pid: child.pid, exitCode: child.exitCode };
}

export async function createNativeFixture(outputPath, runtime) {
  const expected = path.resolve(sourceRoot, "fixtures", "fixture.kra");
  if (path.resolve(outputPath).toLowerCase() !== expected.toLowerCase()) throw new Error("fixture output must be the exact source-owned fixture path");
  if (existsSync(expected)) throw new Error("refusing to overwrite the source-owned fixture");
  const seed = "C:\\Program Files\\Krita (x64)\\share\\krita\\images\\krita-paintbrush.png";
  if (!existsSync(seed)) throw new Error("installed Krita seed image is missing");
  ensureDir(path.dirname(expected)); const launched = await launchOwned(seed, runtime);
  try {
    const observation = assertIdentity(await runtime.coordinator.dispatch("create_fixture", { outputPath: expected }, 60_000));
    if (observation.document.sha256 !== fileSha256(expected) || observation.dirty) throw new Error("native fixture readback failed");
    return { status: "created", pid: launched.child.pid, outputPath: expected, observation };
  } finally { await closeOwned(runtime); }
}

export async function bridgeStatus(args, runtime) {
  assertNoExtra(args, new Set(), "status"); const extension = extensionIdentity(runtime); const connected = runtime.coordinator?.connection?.() || null;
  const recorded = existsSync(processRecord(runtime)) ? readJson(processRecord(runtime)) : null;
  const process = recorded ? { ...recorded, alive: Number.isInteger(recorded.pid) && processAlive(recorded.pid) } : null;
  return { status: "ok", application: { executable: KRITA_EXE, version: "5.3.3 (git 858d352)", versionInt: 50303, sha256: existsSync(KRITA_EXE) ? fileSha256(KRITA_EXE) : null, supported: existsSync(KRITA_EXE) }, api: { name: API_VERSION, available: existsSync(path.join(path.dirname(path.dirname(KRITA_EXE)), "lib", "krita-python-libs", "PyKrita", "krita.pyd")) }, extension, connection: connected, process };
}

export async function setupBridge(args, runtime) {
  assertNoExtra(args, new Set(["action", "rootPath", "documentPath"]), "setup");
  if (args.action === "install_extension") return installExtension(runtime);
  if (args.action === "remove_extension") return removeExtension(runtime);
  if (args.action === "enroll_root") {
    const root = path.resolve(args.rootPath || ""); requireUserProfile(root); if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error("enrollment root must be an existing directory");
    const roots = [...new Set([...enrollments(runtime), root])].sort(); atomicWrite(enrollmentFile(runtime), `${JSON.stringify({ schema: "krita-bridge/enrollments/v1", roots }, null, 2)}\n`); const receipt = setupReceipt(runtime, "enroll_root", { root }); return { status: "enrolled", root, receiptId: receipt.receiptId };
  }
  if (args.action === "launch_document") return await launchDocument(args.documentPath, runtime);
  if (args.action === "close_owned_process") return await closeOwned(runtime);
  throw new Error("unsupported setup action");
}

export async function inspectDocument(args, runtime) {
  assertNoExtra(args, new Set(), "inspection"); const result = assertIdentity(await runtime.coordinator.dispatch("inspect", {})); admitDocument(result.document?.path, runtime); return { status: "ok", ...result };
}

export async function applyTransaction(args, runtime) {
  assertNoExtra(args, new Set(["documentPath", "expectedRevision", "actions"]), "transaction");
  if (!Array.isArray(args.actions) || args.actions.length < 1 || args.actions.length > 32) throw new Error("transaction requires 1..32 actions");
  const actions = args.actions.map(validateAction); const documentPath = admitDocument(args.documentPath, runtime); if (!existsSync(documentPath)) throw new Error("transaction requires an existing document");
  if (!/^sha256:[a-f0-9]{64}$/.test(args.expectedRevision || "")) throw new Error("expectedRevision is invalid");
  const before = assertIdentity(await runtime.coordinator.dispatch("inspect", {}));
  if (before.dirty || path.resolve(before.document?.path || "").toLowerCase() !== documentPath.toLowerCase() || before.revision !== args.expectedRevision) throw new Error("transaction admission failed: dirty, wrong document, or stale revision");
  const preSha256 = fileSha256(documentPath); const provisional = sha256(Buffer.from(`${documentPath}\0${preSha256}\0${JSON.stringify(actions)}`));
  const checkpointPath = ownedFile(runtime.stateRoot, "checkpoints", `${provisional}.kra`); ensureDir(path.dirname(checkpointPath)); if (!existsSync(checkpointPath)) copyFileSync(documentPath, checkpointPath);
  assertIdentity(await runtime.coordinator.dispatch("apply", { expectedRevision: before.revision, actions }, 60_000)); const after = assertIdentity(await runtime.coordinator.dispatch("inspect", {})); const postSha256 = fileSha256(documentPath);
  if (postSha256 === preSha256 || after.document?.sha256 !== postSha256 || after.revision === before.revision || after.dirty) throw new Error("independent Krita readback did not prove a saved change");
  const core = { schema: "krita-bridge/receipt/v1", documentPath, preSha256, postSha256, checkpointPath, preRevision: before.revision, postRevision: after.revision, actions, createdAt: new Date().toISOString() };
  const receiptId = `sha256:${sha256(Buffer.from(JSON.stringify(core)))}`; const receipt = { ...core, receiptId };
  atomicWrite(ownedFile(runtime.stateRoot, "receipts", `${receiptId.slice(7)}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  return { status: "applied", receiptId, observation: after, readback: { documentSha256: postSha256 } };
}

export async function exportArtifact(args, runtime) {
  assertNoExtra(args, new Set(["documentPath", "expectedRevision", "format"]), "export"); const documentPath = admitDocument(args.documentPath, runtime);
  if (args.format !== "png") throw new Error("only closed PNG export is supported");
  const observed = assertIdentity(await runtime.coordinator.dispatch("inspect", {})); if (observed.dirty || observed.revision !== args.expectedRevision || path.resolve(observed.document?.path || "").toLowerCase() !== documentPath.toLowerCase()) throw new Error("export admission failed: dirty, stale, or wrong document");
  const jobId = sha256(Buffer.from(`${documentPath}\0${observed.document.sha256}\0png`)); const outputPath = ownedFile(runtime.stateRoot, "exports", `${jobId}.png`); ensureDir(path.dirname(outputPath));
  const result = assertIdentity(await runtime.coordinator.dispatch("export_png", { expectedRevision: observed.revision, outputPath }, 60_000));
  if (!existsSync(outputPath) || result.sha256 !== fileSha256(outputPath) || result.bytes !== statSync(outputPath).size) throw new Error("independent export readback failed");
  return { status: "exported", format: "png", outputPath, bytes: result.bytes, sha256: result.sha256, sourceRevision: observed.revision, sourceSha256: observed.document.sha256 };
}

export async function rollbackReceipt(args, runtime) {
  assertNoExtra(args, new Set(["receiptId"]), "rollback"); if (!/^sha256:[a-f0-9]{64}$/.test(args.receiptId || "")) throw new Error("invalid receipt ID");
  const file = ownedFile(runtime.stateRoot, "receipts", `${args.receiptId.slice(7)}.json`); if (!existsSync(file)) throw new Error("receipt is not owned by this bridge");
  const receipt = readJson(file); admitDocument(receipt.documentPath, runtime);
  if (!existsSync(receipt.checkpointPath) || fileSha256(receipt.checkpointPath) !== receipt.preSha256) throw new Error("checkpoint is missing or corrupt; manual recovery required");
  if (fileSha256(receipt.documentPath) !== receipt.postSha256) throw new Error("current document does not match receipt post-state; manual recovery required");
  copyFileSync(receipt.checkpointPath, receipt.documentPath); assertIdentity(await runtime.coordinator.dispatch("reload", { documentPath: receipt.documentPath }, 60_000)); const observation = assertIdentity(await runtime.coordinator.dispatch("inspect", {})); const restoredSha256 = fileSha256(receipt.documentPath);
  if (restoredSha256 !== receipt.preSha256 || observation.document?.sha256 !== receipt.preSha256 || observation.revision !== receipt.preRevision || observation.dirty) throw new Error("exact restoration or native readback failed; manual recovery required");
  return { status: "rolled-back", classification: "explicit-rollback", receiptId: args.receiptId, restoredSha256, exactBytes: true, observation };
}

export const runtime = { stateRoot: stateRoot() };
