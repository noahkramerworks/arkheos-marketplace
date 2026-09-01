import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API_VERSION, APPLICATION_VERSION, BRIDGE_VERSION, SDK_COMMIT } from "./coordinator.mjs";
import { atomicWrite, ensureDir, fileSha256, ownedFile, readJson, sha256, stateRoot, waitForFile } from "./state.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const reaperExe = process.env.REAPER_EXE || "C:\\Program Files\\REAPER (x64)\\reaper.exe";
const extensionTarget = path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming"), "REAPER", "UserPlugins", "reaper_codex_bridge.dll");
const extensionSource = path.join(root, "native", "dist", "reaper_codex_bridge.dll");
const allowedFx = new Map([["ReaEQ", "ReaEQ (Cockos)"], ["ReaComp", "ReaComp (Cockos)"], ["ReaGate", "ReaGate (Cockos)"], ["ReaLimit", "ReaLimit (Cockos)"], ["ReaDelay", "ReaDelay (Cockos)"]]);

function requireAbsoluteRpp(value) { if (!path.isAbsolute(value || "") || path.extname(value).toLowerCase() !== ".rpp") throw new Error("projectPath must be an absolute .rpp path"); return path.resolve(value); }
function assertConnectedResult(result) { if (!result || result.ok !== true) throw new Error(result?.error || "Native operation failed"); return result; }
function assertNativeIdentity(result) {
  assertConnectedResult(result);
  if (
    typeof result.applicationVersion !== "string" ||
    !result.applicationVersion.startsWith(APPLICATION_VERSION) ||
    result.bridgeVersion !== BRIDGE_VERSION ||
    result.apiVersion !== API_VERSION ||
    result.sdkCommit !== SDK_COMMIT
  ) throw new Error("Connected REAPER native identity is unsupported or version-drifted");
  return result;
}
async function waitForClean(coordinator, timeoutMs = 5000) {
  const started = Date.now(); let observation;
  do { observation = assertNativeIdentity(await coordinator.dispatch("inspect", {})); if (!observation.dirty) return observation; await new Promise((resolve) => setTimeout(resolve, 100)); } while (Date.now() - started < timeoutMs);
  throw new Error("REAPER did not reach clean saved state");
}
function validateAction(action) {
  const types = new Set(["create_track", "rename_track", "set_track_volume", "set_track_pan", "set_track_mute", "add_stock_fx"]);
  if (!action || !types.has(action.type)) throw new Error(`Unsupported action: ${action?.type || "missing"}`);
  const allowedKeys = {
    create_track: new Set(["type", "index", "name"]),
    rename_track: new Set(["type", "index", "name"]),
    set_track_volume: new Set(["type", "index", "value"]),
    set_track_pan: new Set(["type", "index", "value"]),
    set_track_mute: new Set(["type", "index", "value"]),
    add_stock_fx: new Set(["type", "index", "fx"]),
  };
  const unexpected = Object.keys(action).filter((key) => !allowedKeys[action.type].has(key));
  if (unexpected.length) throw new Error(`Unsupported action fields: ${unexpected.join(", ")}`);
  if (!Number.isInteger(action.index) || action.index < 0 || action.index > 4096) throw new Error("Track index is invalid");
  if (action.type === "rename_track" && (typeof action.name !== "string" || !action.name.trim() || Buffer.byteLength(action.name) > 240)) throw new Error("Track name is invalid");
  if (action.type === "create_track" && action.name !== undefined && (typeof action.name !== "string" || !action.name.trim() || Buffer.byteLength(action.name) > 240)) throw new Error("Track name is invalid");
  if (action.type === "set_track_volume" && (typeof action.value !== "number" || action.value < 0 || action.value > 4)) throw new Error("Volume must be 0..4");
  if (action.type === "set_track_pan" && (typeof action.value !== "number" || action.value < -1 || action.value > 1)) throw new Error("Pan must be -1..1");
  if (action.type === "set_track_mute" && typeof action.value !== "boolean") throw new Error("Mute must be boolean");
  if (action.type === "add_stock_fx") { if (!allowedFx.has(action.fx)) throw new Error("Only admitted Cockos stock FX are allowed"); action = { ...action, fx: allowedFx.get(action.fx) }; }
  return action;
}

export async function inspectInstallation(_args, runtime) {
  if (!existsSync(reaperExe)) return { status: "missing", executable: reaperExe };
  const version = execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Item -LiteralPath '${reaperExe.replaceAll("'", "''")}').VersionInfo.FileVersion`], { encoding: "utf8" }).trim();
  const licenseMarker = path.join(process.env.APPDATA || "", "REAPER", "reaper-license.rk");
  const packagedSha256 = existsSync(extensionSource) ? fileSha256(extensionSource) : null;
  const installedSha256 = existsSync(extensionTarget) ? fileSha256(extensionTarget) : null;
  const connection = runtime.coordinator?.connection?.() || null;
  return {
    status: "ok",
    executable: reaperExe,
    version,
    sha256: fileSha256(reaperExe),
    supported: version === APPLICATION_VERSION,
    registered: existsSync(licenseMarker),
    licenseContentsRead: false,
    nativeContract: { applicationVersion: APPLICATION_VERSION, bridgeVersion: BRIDGE_VERSION, apiVersion: API_VERSION, sdkCommit: SDK_COMMIT },
    extension: { path: extensionTarget, installed: existsSync(extensionTarget), sha256: installedSha256, packagedSha256, exactPackageMatch: Boolean(installedSha256 && packagedSha256 && installedSha256 === packagedSha256) },
    connected: Boolean(connection),
    connection: connection ? { pid: connection.pid, applicationVersion: connection.applicationVersion, bridgeVersion: connection.bridgeVersion, apiVersion: connection.apiVersion, sdkCommit: connection.sdkCommit } : null,
  };
}

export async function installExtension(args, runtime) {
  if (!existsSync(extensionSource)) throw new Error("Packaged native DLL is missing; run npm run build:native");
  ensureDir(path.dirname(extensionTarget));
  if (existsSync(extensionTarget) && fileSha256(extensionTarget) !== fileSha256(extensionSource)) {
    const ownership = ownedFile(runtime.stateRoot, "installation", "extension.json");
    if (!existsSync(ownership) || readJson(ownership).sha256 !== fileSha256(extensionTarget)) throw new Error("Foreign extension target exists; refusing to replace it");
  }
  copyFileSync(extensionSource, extensionTarget);
  const record = { schema: "reaper-bridge/installation/v1", path: extensionTarget, sha256: fileSha256(extensionTarget), installedAt: new Date().toISOString() };
  atomicWrite(ownedFile(runtime.stateRoot, "installation", "extension.json"), `${JSON.stringify(record, null, 2)}\n`);
  return { status: "installed", ...record, restartRequired: true };
}

export async function removeExtension(_args, runtime) {
  const ownership = ownedFile(runtime.stateRoot, "installation", "extension.json");
  if (!existsSync(extensionTarget)) return { status: "absent", path: extensionTarget };
  if (!existsSync(ownership) || readJson(ownership).sha256 !== fileSha256(extensionTarget)) throw new Error("Extension is not hash-matching bridge-owned content");
  const { rmSync } = await import("node:fs"); rmSync(extensionTarget, { force: true }); rmSync(ownership, { force: true });
  return { status: "removed", path: extensionTarget, restartRequired: true };
}

export async function launchReaper(args, runtime) {
  if (!existsSync(reaperExe)) throw new Error("REAPER is not installed");
  const projectPath = args.projectPath ? requireAbsoluteRpp(args.projectPath) : null;
  if (projectPath && !existsSync(projectPath)) throw new Error("Project does not exist");
  const child = spawn(reaperExe, ["-newinst", ...(projectPath ? [projectPath] : [])], { detached: false, stdio: "ignore", windowsHide: false });
  const record = { schema: "reaper-bridge/process/v1", pid: child.pid, projectPath, launchedAt: new Date().toISOString() };
  atomicWrite(ownedFile(runtime.stateRoot, "processes", "current.json"), `${JSON.stringify(record, null, 2)}\n`);
  return { status: "launched", ...record };
}

export async function closeOwnedReaper(_args, runtime) {
  const file = ownedFile(runtime.stateRoot, "processes", "current.json"); if (!existsSync(file)) return { status: "absent" };
  const record = readJson(file); const observation = assertConnectedResult(await runtime.coordinator.dispatch("inspect", {}));
  if (observation.dirty) throw new Error("Owned REAPER project is dirty; refusing to close");
  process.kill(record.pid); return { status: "closed", pid: record.pid };
}

export async function inspectProject(_args, runtime) { return { status: "ok", ...assertNativeIdentity(await runtime.coordinator.dispatch("inspect", {})) }; }

export async function applyTransaction(args, runtime) {
  const projectPath = requireAbsoluteRpp(args.projectPath); const actions = (args.actions || []).map(validateAction);
  if (!actions.length || actions.length > 32) throw new Error("Transaction requires 1..32 actions");
  const before = assertNativeIdentity(await runtime.coordinator.dispatch("inspect", {}));
  if (before.dirty) throw new Error("Project is dirty");
  if (path.resolve(before.projectPath).toLowerCase() !== projectPath.toLowerCase()) throw new Error("Active project path mismatch");
  if (before.revision !== args.expectedRevision) throw new Error(`Stale revision: expected ${args.expectedRevision}, observed ${before.revision}`);
  const preBytes = readFileSync(projectPath); const preSha256 = sha256(preBytes); const provisional = sha256(Buffer.from(`${projectPath}\0${preSha256}\0${JSON.stringify(actions)}`));
  const checkpointPath = ownedFile(runtime.stateRoot, "checkpoints", `${provisional}.rpp`); ensureDir(path.dirname(checkpointPath)); if (!existsSync(checkpointPath)) atomicWrite(checkpointPath, preBytes);
  assertConnectedResult(await runtime.coordinator.dispatch("begin_undo", {}));
  try { for (const action of actions) assertConnectedResult(await runtime.coordinator.dispatch("action", action)); }
  catch (error) { await runtime.coordinator.dispatch("end_undo", { label: "Codex Bridge failed transaction" }).catch(() => {}); await runtime.coordinator.dispatch("undo_save", {}).catch(() => {}); throw error; }
  assertConnectedResult(await runtime.coordinator.dispatch("end_undo", { label: "Codex Bridge transaction" }));
  assertConnectedResult(await runtime.coordinator.dispatch("save", {}));
  const after = await waitForClean(runtime.coordinator); const postSha256 = fileSha256(projectPath);
  const core = { schema: "reaper-bridge/receipt/v1", projectPath, preSha256, postSha256, checkpointPath, preRevision: before.revision, postRevision: after.revision, actions, createdAt: new Date().toISOString() };
  const receiptId = `sha256:${sha256(Buffer.from(JSON.stringify(core)))}`; const receipt = { ...core, receiptId };
  atomicWrite(ownedFile(runtime.stateRoot, "receipts", `${receiptId.slice(7)}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  return { status: "applied", receiptId, observation: after, readback: { projectSha256: postSha256 } };
}

export async function rollbackReceipt(args, runtime) {
  if (!/^sha256:[a-f0-9]{64}$/.test(args.receiptId || "")) throw new Error("Invalid receipt ID");
  const file = ownedFile(runtime.stateRoot, "receipts", `${args.receiptId.slice(7)}.json`); const receipt = readJson(file);
  const before = await waitForClean(runtime.coordinator);
  if (before.dirty || path.resolve(before.projectPath).toLowerCase() !== path.resolve(receipt.projectPath).toLowerCase()) throw new Error("Rollback project mismatch or dirty state");
  assertConnectedResult(await runtime.coordinator.dispatch("undo_save", {})); await waitForClean(runtime.coordinator);
  let restored = fileSha256(receipt.projectPath); let checkpointApplied = false;
  if (restored !== receipt.preSha256) {
    if (!existsSync(receipt.checkpointPath) || fileSha256(receipt.checkpointPath) !== receipt.preSha256) throw new Error(`Rollback byte verification failed; checkpoint is missing or corrupt at ${receipt.checkpointPath}`);
    copyFileSync(receipt.checkpointPath, receipt.projectPath); checkpointApplied = true; restored = fileSha256(receipt.projectPath);
  }
  if (restored !== receipt.preSha256) throw new Error(`Exact checkpoint restoration failed at ${receipt.projectPath}`);
  return { status: "rolled-back", classification: "explicit-rollback", receiptId: args.receiptId, restoredSha256: restored, exactBytes: true, checkpointApplied };
}

export async function renderMaster(args, runtime) {
  const projectPath = requireAbsoluteRpp(args.projectPath); const outputPath = path.resolve(args.outputPath || "");
  if (!path.isAbsolute(args.outputPath || "")) throw new Error("outputPath must be absolute");
  const before = assertNativeIdentity(await runtime.coordinator.dispatch("inspect", {}));
  if (before.dirty || before.revision !== args.expectedRevision || path.resolve(before.projectPath).toLowerCase() !== projectPath.toLowerCase()) throw new Error("Render admission failed: dirty, stale, or wrong project");
  assertConnectedResult(await runtime.coordinator.dispatch("render", { outputPath })); await waitForFile(outputPath, 300_000);
  return { status: "rendered", outputPath, bytes: statSync(outputPath).size, sha256: fileSha256(outputPath), projectRevision: before.revision };
}

export const runtime = { stateRoot: stateRoot() };
