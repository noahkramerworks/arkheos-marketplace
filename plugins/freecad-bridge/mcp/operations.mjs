import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API_VERSION, APPLICATION_VERSION, BRIDGE_VERSION, BUILD_REVISION } from "./coordinator.mjs";
import { atomicWrite, ensureDir, fileSha256, isWithin, ownedFile, readJson, sha256, stateRoot } from "./state.mjs";
import { runBatch } from "../freecad-adapter/adapter/batch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const freecadExe = process.env.FREECAD_EXE || "C:\\Program Files\\FreeCAD 1.1\\bin\\FreeCAD.exe";
const freecadCmd = process.env.FREECAD_CMD_EXE || "C:\\Program Files\\FreeCAD 1.1\\bin\\FreeCADCmd.exe";
const extensionSource = path.join(root, "freecad-adapter", "adapter");
const extensionTarget = path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming"), "FreeCAD", "v1-1", "Mod", "ArkheOSFreeCADBridge");
const extensionFiles = ["Init.py", "InitGui.py", "extension.py"];
const blockedActionKeys = new Set(["code", "script", "command", "shell", "payload", "macro", "module", "propertyName", "path"]);

function assertNoExtra(value, allowed, label) {
  const extra = Object.keys(value || {}).filter((key) => !allowed.has(key));
  if (extra.length) throw new Error(`${label} contains unsupported fields: ${extra.join(", ")}`);
}
function assertIdentity(result) {
  if (!result || result.ok !== true) throw new Error(result?.error || "FreeCAD native operation failed");
  if (result.applicationVersion !== APPLICATION_VERSION || result.bridgeVersion !== BRIDGE_VERSION || result.apiVersion !== API_VERSION || !String(result.buildRevision || "").startsWith(BUILD_REVISION)) throw new Error("FreeCAD native identity is unsupported or version-drifted");
  return result;
}
function enrollmentFile(runtime) { return ownedFile(runtime.stateRoot, "enrollment", "roots.json"); }
function enrolledRoots(runtime) {
  const file = enrollmentFile(runtime); const roots = existsSync(file) ? readJson(file).roots : [];
  return [...new Set([runtime.stateRoot, ...roots.map((item) => path.resolve(item))])];
}
function admitRoot(value, runtime) {
  if (!path.isAbsolute(value || "") || !existsSync(value) || !statSync(value).isDirectory()) throw new Error("rootPath must be an existing absolute directory");
  const resolved = path.resolve(value); const profile = path.resolve(process.env.USERPROFILE || "");
  if (!profile || resolved.toLowerCase() === profile.toLowerCase() || !isWithin(profile, resolved)) throw new Error("rootPath must be a non-root directory beneath the current user profile");
  return resolved;
}
function admitDocument(value, runtime) {
  if (!path.isAbsolute(value || "") || path.extname(value).toLowerCase() !== ".fcstd") throw new Error("documentPath must be an absolute .FCStd path");
  const resolved = path.resolve(value);
  if (!enrolledRoots(runtime).some((base) => isWithin(base, resolved))) throw new Error("documentPath is outside enrolled roots");
  return resolved;
}
function validateAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error("transaction action must be an object");
  for (const key of blockedActionKeys) if (key in action) throw new Error(`action field is forbidden: ${key}`);
  const keys = {
    create_box: new Set(["type", "name", "length", "width", "height"]),
    create_cylinder: new Set(["type", "name", "radius", "height"]),
    set_dimension: new Set(["type", "objectName", "property", "value"]),
    rename_owned_feature: new Set(["type", "objectName", "label"]),
    remove_owned_feature: new Set(["type", "objectName"]),
  };
  if (!keys[action.type]) throw new Error(`unsupported action: ${action.type || "missing"}`);
  assertNoExtra(action, keys[action.type], "action");
  const name = action.name || action.objectName;
  if (["create_box", "create_cylinder"].includes(action.type) && !/^ArkheOS_[A-Za-z0-9_]{1,64}$/.test(name || "")) throw new Error("created feature name must use the ArkheOS_ namespace");
  if (action.objectName && !/^ArkheOS_[A-Za-z0-9_]{1,64}$/.test(action.objectName)) throw new Error("objectName is invalid");
  for (const field of ["length", "width", "height", "radius", "value"]) if (field in action && (typeof action[field] !== "number" || !Number.isFinite(action[field]) || action[field] <= 0 || action[field] > 100000)) throw new Error(`${field} is outside 0..100000`);
  if (action.property && !["Length", "Width", "Height", "Radius", "Angle"].includes(action.property)) throw new Error("dimension property is not admitted");
  if (action.label !== undefined && (typeof action.label !== "string" || !action.label.trim() || Buffer.byteLength(action.label) > 240)) throw new Error("label is invalid");
  return action;
}

export async function bridgeStatus(_args, runtime) {
  if (!existsSync(freecadExe) || !existsSync(freecadCmd)) return { status: "missing", executable: freecadExe, commandExecutable: freecadCmd };
  const version = execFileSync(freecadCmd, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 30_000 }).trim();
  const ownership = ownedFile(runtime.stateRoot, "installation", "extension.json");
  const installed = extensionFiles.every((name) => existsSync(path.join(extensionTarget, name)));
  const exact = installed && existsSync(ownership) && readJson(ownership).files.every((item) => fileSha256(item.path) === item.sha256);
  const connection = runtime.coordinator?.connection?.() || null;
  return { status: "ok", executable: freecadExe, version, sha256: fileSha256(freecadExe), commandExecutable: freecadCmd, commandSha256: fileSha256(freecadCmd), supported: version.startsWith("FreeCAD 1.1.3 Revision: 20260725"), extension: { path: extensionTarget, installed, exactPackageMatch: exact }, connected: Boolean(connection), connection };
}

function installExtension(runtime) {
  ensureDir(extensionTarget); const ownershipFile = ownedFile(runtime.stateRoot, "installation", "extension.json");
  const prior = existsSync(ownershipFile) ? readJson(ownershipFile) : null;
  for (const name of extensionFiles) {
    const source = path.join(extensionSource, name); const target = path.join(extensionTarget, name);
    if (!existsSync(source)) throw new Error(`packaged extension file is missing: ${name}`);
    if (existsSync(target)) {
      const owned = prior?.files?.find((item) => path.resolve(item.path).toLowerCase() === path.resolve(target).toLowerCase());
      if (!owned || owned.sha256 !== fileSha256(target)) throw new Error(`foreign extension file exists: ${target}`);
    }
    copyFileSync(source, target);
  }
  const record = { schema: "freecad-bridge/installation/v1", installedAt: new Date().toISOString(), files: extensionFiles.map((name) => { const file = path.join(extensionTarget, name); return { path: file, sha256: fileSha256(file) }; }) };
  atomicWrite(ownershipFile, `${JSON.stringify(record, null, 2)}\n`); return { status: "installed", ...record, restartRequired: true };
}
function removeExtension(runtime) {
  const ownershipFile = ownedFile(runtime.stateRoot, "installation", "extension.json"); if (!existsSync(ownershipFile)) return { status: "absent", path: extensionTarget };
  const record = readJson(ownershipFile);
  for (const item of record.files) {
    if (!existsSync(item.path) || fileSha256(item.path) !== item.sha256) throw new Error(`owned extension drifted: ${item.path}`);
  }
  for (const item of record.files) rmSync(item.path, { force: true }); rmSync(ownershipFile, { force: true });
  return { status: "removed", path: extensionTarget, restartRequired: true };
}
function enrollRoot(args, runtime) {
  const rootPath = admitRoot(args.rootPath, runtime); const file = enrollmentFile(runtime); const current = existsSync(file) ? readJson(file) : { schema: "freecad-bridge/enrollments/v1", roots: [] };
  current.roots = [...new Set([...current.roots, rootPath])].sort(); current.updatedAt = new Date().toISOString(); atomicWrite(file, `${JSON.stringify(current, null, 2)}\n`);
  return { status: "enrolled", rootPath, count: current.roots.length };
}
function launchDocument(args, runtime) {
  const documentPath = admitDocument(args.documentPath, runtime); if (!existsSync(documentPath)) throw new Error("document does not exist");
  const child = spawn(freecadExe, [documentPath], { detached: false, stdio: "ignore", windowsHide: false });
  const record = { schema: "freecad-bridge/process/v1", pid: child.pid, documentPath, launchedAt: new Date().toISOString() };
  atomicWrite(ownedFile(runtime.stateRoot, "processes", "current.json"), `${JSON.stringify(record, null, 2)}\n`); return { status: "launched", ...record };
}
async function closeOwned(runtime) {
  const file = ownedFile(runtime.stateRoot, "processes", "current.json"); if (!existsSync(file)) return { status: "absent" };
  const record = readJson(file); const observation = assertIdentity(await runtime.coordinator.dispatch("inspect", {}));
  if (observation.dirty) throw new Error("FreeCAD document is dirty; refusing to close");
  process.kill(record.pid); atomicWrite(file, `${JSON.stringify({ ...record, closedAt: new Date().toISOString() }, null, 2)}\n`); return { status: "closed", pid: record.pid };
}
export async function setupBridge(args, runtime) {
  assertNoExtra(args, new Set(["action", "rootPath", "documentPath"]), "setup");
  if (args.action === "install_extension") return installExtension(runtime);
  if (args.action === "remove_extension") return removeExtension(runtime);
  if (args.action === "enroll_root") return enrollRoot(args, runtime);
  if (args.action === "launch_document") return launchDocument(args, runtime);
  if (args.action === "close_owned_process") return await closeOwned(runtime);
  throw new Error("unsupported setup action");
}
export async function inspectDocument(_args, runtime) {
  const result = assertIdentity(await runtime.coordinator.dispatch("inspect", {}));
  if (result.document?.path) admitDocument(result.document.path, runtime);
  return { status: "ok", ...result };
}
export async function applyTransaction(args, runtime) {
  assertNoExtra(args, new Set(["documentPath", "expectedRevision", "actions"]), "transaction");
  const actions = (args.actions || []).map(validateAction); const documentPath = admitDocument(args.documentPath, runtime);
  if (!existsSync(documentPath) || actions.length < 1 || actions.length > 32) throw new Error("transaction requires an existing document and 1..32 actions");
  if (!/^sha256:[a-f0-9]{64}$/.test(args.expectedRevision || "")) throw new Error("expectedRevision is invalid");
  const before = assertIdentity(await runtime.coordinator.dispatch("inspect", {}));
  if (before.dirty || path.resolve(before.document?.path || "").toLowerCase() !== documentPath.toLowerCase() || before.revision !== args.expectedRevision) throw new Error("transaction admission failed: dirty, wrong document, or stale revision");
  const preSha256 = fileSha256(documentPath); const provisional = sha256(Buffer.from(`${documentPath}\0${preSha256}\0${JSON.stringify(actions)}`));
  const checkpointPath = ownedFile(runtime.stateRoot, "checkpoints", `${provisional}.FCStd`); ensureDir(path.dirname(checkpointPath)); if (!existsSync(checkpointPath)) copyFileSync(documentPath, checkpointPath);
  const after = assertIdentity(await runtime.coordinator.dispatch("apply", { expectedRevision: before.revision, actions })); const postSha256 = fileSha256(documentPath);
  if (postSha256 === preSha256 || after.document?.sha256 !== postSha256 || after.dirty) throw new Error("independent FreeCAD readback did not prove a saved change");
  const core = { schema: "freecad-bridge/receipt/v1", documentPath, preSha256, postSha256, checkpointPath, preRevision: before.revision, postRevision: after.revision, actions, createdAt: new Date().toISOString() };
  const receiptId = `sha256:${sha256(Buffer.from(JSON.stringify(core)))}`; const receipt = { ...core, receiptId };
  atomicWrite(ownedFile(runtime.stateRoot, "receipts", `${receiptId.slice(7)}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  return { status: "applied", receiptId, observation: after, readback: { documentSha256: postSha256 } };
}
export async function exportArtifact(args, runtime) {
  assertNoExtra(args, new Set(["documentPath", "expectedRevision", "format"]), "export");
  const documentPath = admitDocument(args.documentPath, runtime); if (!["step", "stl"].includes(args.format)) throw new Error("format must be step or stl");
  const observed = assertIdentity(await runtime.coordinator.dispatch("inspect", {}));
  if (observed.dirty || observed.revision !== args.expectedRevision || path.resolve(observed.document?.path || "").toLowerCase() !== documentPath.toLowerCase()) throw new Error("export admission failed: dirty, stale, or wrong document");
  const sourceSha256 = fileSha256(documentPath); const jobId = sha256(Buffer.from(`${documentPath}\0${sourceSha256}\0${args.format}`)); const extension = args.format === "step" ? ".step" : ".stl";
  const outputPath = ownedFile(runtime.stateRoot, "exports", `${jobId}${extension}`); ensureDir(path.dirname(outputPath));
  const job = { schema: "freecad-bridge/export-job/v1", jobId, documentPath, outputPath, format: args.format, expectedSha256: sourceSha256 };
  const result = runBatch(job, runtime); return { status: "exported", format: args.format, outputPath, bytes: statSync(outputPath).size, sha256: result.sha256, sourceRevision: observed.revision, sourceSha256 };
}
export async function rollbackReceipt(args, runtime) {
  assertNoExtra(args, new Set(["receiptId"]), "rollback"); if (!/^sha256:[a-f0-9]{64}$/.test(args.receiptId || "")) throw new Error("invalid receipt ID");
  const file = ownedFile(runtime.stateRoot, "receipts", `${args.receiptId.slice(7)}.json`); if (!existsSync(file)) throw new Error("receipt is not owned by this bridge");
  const receipt = readJson(file); admitDocument(receipt.documentPath, runtime);
  if (!existsSync(receipt.checkpointPath) || fileSha256(receipt.checkpointPath) !== receipt.preSha256) throw new Error("checkpoint is missing or corrupt; manual recovery required");
  if (fileSha256(receipt.documentPath) !== receipt.postSha256) throw new Error("current document does not match receipt post-state; manual recovery required");
  copyFileSync(receipt.checkpointPath, receipt.documentPath); const observation = assertIdentity(await runtime.coordinator.dispatch("reload", { documentPath: receipt.documentPath })); const restoredSha256 = fileSha256(receipt.documentPath);
  if (restoredSha256 !== receipt.preSha256 || observation.document?.sha256 !== receipt.preSha256 || observation.revision !== receipt.preRevision || observation.dirty) throw new Error("exact restoration or native readback failed; manual recovery required");
  return { status: "rolled-back", classification: "explicit-rollback", receiptId: args.receiptId, restoredSha256, exactBytes: true, observation };
}

export const runtime = { stateRoot: stateRoot() };
