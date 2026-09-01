import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callKiCad } from "./kicad-client.mjs";
import { atomicWrite, canonicalJson, ensureDir, fileSha256, isWithin, ownedFile, readJson, sha256, stateRoot as defaultStateRoot, waitFor } from "./state.mjs";
import { preparePython } from "../scripts/setup-python.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userProfile = process.env.USERPROFILE || "C:\\Users\\rizek";
const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, "AppData", "Local");
const kicadRoot = process.env.KICAD_ROOT || path.join(localAppData, "Programs", "KiCad", "10.0");
export const PCBNEW = process.env.KICAD_PCBNEW || path.join(kicadRoot, "bin", "pcbnew.exe");
export const KICAD_CLI = process.env.KICAD_CLI || path.join(kicadRoot, "bin", "kicad-cli.exe");
export const API_SCHEMA = path.join(kicadRoot, "share", "kicad", "schemas", "api.v1.schema.json");
const EXPECTED = {
  pcbnew: "44d67ed60b3e5b8a99fa0df0eb7a5d986372258b8d650bf0214db03161d09ee8",
  cli: "fc142e3b4c13af868501fcbc9312dd94ad62d3c05882f97a23b6fd9f8118d0c3",
  schema: "a51ecc9cc4166fc857a0378b6361909c66a7957451146bd50123d52313fdea96"
};
const BOARD_PATTERN = /^[A-Za-z]:\\.*\.kicad_pcb$/i;
const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RECEIPT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ACTION_FIELDS = {
  create_text: ["type", "value", "xMm", "yMm", "layer"],
  move_owned_text: ["type", "textId", "dxMm", "dyMm"],
  set_title: ["type", "title"],
  delete_owned_text: ["type", "textId"]
};

export const runtime = { stateRoot: defaultStateRoot(), callKiCad, preparePython, spawn, execFileSync };

function assertClosed(value, allowed, required = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Input must be a closed object");
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`forbidden or unsupported fields: ${extras.join(", ")}`);
  for (const key of required) if (!(key in value)) throw new Error(`missing required field: ${key}`);
}
function verifyIdentity() {
  for (const [label, file, digest] of [["pcbnew", PCBNEW, EXPECTED.pcbnew], ["kicad-cli", KICAD_CLI, EXPECTED.cli], ["IPC schema", API_SCHEMA, EXPECTED.schema]]) {
    if (!existsSync(file) || fileSha256(file) !== digest) throw new Error(`${label} identity drift`);
  }
  return { pcbnew: { path: PCBNEW, sha256: EXPECTED.pcbnew }, cli: { path: KICAD_CLI, sha256: EXPECTED.cli }, schema: { path: API_SCHEMA, sha256: EXPECTED.schema } };
}
function enrollmentFile(root) { return ownedFile(root, "enrollments.json"); }
function processFile(root) { return ownedFile(root, "owned-process.json"); }
function synchronizationFile(root) { return ownedFile(root, "synchronized-state.json"); }
function readEnrollments(root) { return existsSync(enrollmentFile(root)) ? readJson(enrollmentFile(root)).roots : []; }
function canonicalExistingRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || !existsSync(value) || !statSync(value).isDirectory()) throw new Error("rootPath must be an existing absolute directory");
  return path.resolve(value);
}
function admittedBoard(value, root) {
  if (typeof value !== "string" || !BOARD_PATTERN.test(value) || !path.isAbsolute(value)) throw new Error("boardPath must be an absolute .kicad_pcb path");
  const board = path.resolve(value); if (!existsSync(board) || !statSync(board).isFile()) throw new Error("boardPath does not exist");
  const admitted = readEnrollments(root).some((enrolled) => isWithin(enrolled, board)); if (!admitted) throw new Error("boardPath is outside enrolled roots");
  return board;
}
function nativeContext(root) {
  if (!existsSync(processFile(root))) throw new Error("No bridge-owned KiCad process is recorded");
  const record = readJson(processFile(root));
  if (!Number.isInteger(record.pid) || record.pid <= 0 || typeof record.socketPath !== "string" || typeof record.boardPath !== "string") throw new Error("Owned process record is invalid");
  try { process.kill(record.pid, 0); } catch { throw new Error("Bridge-owned KiCad process is not running"); }
  return record;
}
function writeSynchronization(root, observation) {
  const synchronized = { schema: "kicad-bridge/synchronized-state/v1", boardPath: observation.board.path, savedSha256: observation.board.sha256, memorySha256: observation.board.memorySha256, revision: observation.revision, observedAt: new Date().toISOString() };
  atomicWrite(synchronizationFile(root), `${JSON.stringify(synchronized, null, 2)}\n`, "utf8"); return synchronized;
}
function deriveCleanState(root, observation) {
  const synchronized = existsSync(synchronizationFile(root)) ? readJson(synchronizationFile(root)) : null;
  const clean = Boolean(synchronized && synchronized.boardPath.toLowerCase() === observation.board.path.toLowerCase() && synchronized.savedSha256 === observation.board.sha256 && synchronized.memorySha256 === observation.board.memorySha256 && synchronized.revision === observation.revision);
  return { ...observation, dirty: !clean, synchronization: { basis: "bridge-owned launch/save pair", synchronizedRevision: synchronized?.revision || null, savedMatches: synchronized?.savedSha256 === observation.board.sha256, memoryMatches: synchronized?.memorySha256 === observation.board.memorySha256 } };
}
function inspectNative(root, call = callKiCad) {
  const record = nativeContext(root); const boardPath = admittedBoard(record.boardPath, root);
  return deriveCleanState(root, call("inspect", { socketPath: record.socketPath, boardPath }, { stateRoot: root }));
}
function validateActions(actions) {
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > 32) throw new Error("actions must contain 1..32 closed actions");
  for (const action of actions) {
    if (!action || typeof action !== "object" || Array.isArray(action) || !ACTION_FIELDS[action.type]) throw new Error("unsupported transaction action");
    const fields = Object.keys(action).sort(); const expected = [...ACTION_FIELDS[action.type]].sort();
    if (JSON.stringify(fields) !== JSON.stringify(expected)) throw new Error("forbidden or unsupported fields in action");
    if (action.type === "create_text") {
      if (!/^ARKHEOS_BRIDGE:[A-Za-z0-9 _-]{1,64}$/.test(action.value) || !["Cmts.User", "Dwgs.User"].includes(action.layer)) throw new Error("create_text ownership or layer is invalid");
      for (const key of ["xMm", "yMm"]) if (typeof action[key] !== "number" || !Number.isFinite(action[key]) || Math.abs(action[key]) > 1000) throw new Error("create_text coordinate is invalid");
    } else if (action.type === "move_owned_text") {
      if (action.textId !== "@last_created" && !/^[0-9a-fA-F-]{36}$/.test(action.textId)) throw new Error("move_owned_text ID is invalid");
      for (const key of ["dxMm", "dyMm"]) if (typeof action[key] !== "number" || !Number.isFinite(action[key]) || Math.abs(action[key]) > 250) throw new Error("move_owned_text delta is invalid");
    } else if (action.type === "set_title") {
      if (typeof action.title !== "string" || !/^[A-Za-z0-9 ._()/-]{1,96}$/.test(action.title)) throw new Error("title is invalid");
    } else if (!/^[0-9a-fA-F-]{36}$/.test(action.textId)) throw new Error("delete_owned_text ID is invalid");
  }
}
function ensureIsolatedProfile(root) {
  const profile = ownedFile(root, "profile"); const configDir = ownedFile(profile, "10.0"); const temp = ownedFile(root, "temp"); const documents = ownedFile(root, "documents");
  ensureDir(configDir); ensureDir(temp); ensureDir(documents);
  const config = {
    api: { enable_server: true, interpreter_path: ownedFile(root, "runtime", "python", "Scripts", "pythonw.exe") },
    do_not_show_again: { update_check_prompt: true, data_collection_prompt: true },
    meta: { version: 6 }
  };
  const suite = {
    meta: { version: 0 },
    pcm: { check_for_updates: false, last_download_dir: "", lib_auto_add: true, lib_auto_remove: true, lib_prefix: "PCM_", repositories: [] },
    system: { check_for_kicad_updates: false, file_history: [], first_run_shown: false, last_received_update: "", last_update_check_time: "", open_projects: [] }
  };
  atomicWrite(path.join(configDir, "kicad_common.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  atomicWrite(path.join(configDir, "kicad.json"), `${JSON.stringify(suite, null, 2)}\n`, "utf8");
  atomicWrite(path.join(configDir, "sym-lib-table"), "(sym_lib_table\n  (version 7)\n)\n", "utf8");
  atomicWrite(path.join(configDir, "fp-lib-table"), "(fp_lib_table\n  (version 7)\n)\n", "utf8");
  atomicWrite(path.join(configDir, "design-block-lib-table"), "(design_block_lib_table\n  (version 7)\n)\n", "utf8");
  return { profile, temp, documents, socketPath: `ipc://${path.join(temp, "kicad", "api.sock")}` };
}

export async function bridgeStatus(args = {}, options = runtime) {
  assertClosed(args, []); const root = options.stateRoot || defaultStateRoot(); const identity = verifyIdentity();
  let ownedProcess = null; let native = null;
  if (existsSync(processFile(root))) {
    ownedProcess = readJson(processFile(root));
    try { process.kill(ownedProcess.pid, 0); native = options.callKiCad("status", { socketPath: ownedProcess.socketPath }, { stateRoot: root }); } catch (cause) { native = { ok: false, error: String(cause.message) }; }
  }
  return { status: "ok", bridgeVersion: "0.1.0", application: "KiCad 10.0.5", identity, pythonRuntimePrepared: existsSync(ownedFile(root, "runtime", "manifest.json")), enrolledRoots: readEnrollments(root), ownedProcess, native };
}

export async function setupBridge(args, options = runtime) {
  assertClosed(args, ["action", "rootPath", "boardPath"], ["action"]); const root = options.stateRoot || defaultStateRoot(); verifyIdentity(); ensureDir(root);
  if (args.action === "prepare_runtime") {
    if ("rootPath" in args || "boardPath" in args) throw new Error("prepare_runtime accepts no path fields");
    const python = options.preparePython({ stateRoot: root }); const isolated = ensureIsolatedProfile(root); return { status: "prepared", python, isolated: { profile: isolated.profile, temp: isolated.temp } };
  }
  if (args.action === "enroll_root") {
    if (!("rootPath" in args) || "boardPath" in args) throw new Error("enroll_root requires only rootPath");
    const admitted = canonicalExistingRoot(args.rootPath); const roots = [...new Set([...readEnrollments(root), admitted])].sort((a, b) => a.localeCompare(b));
    atomicWrite(enrollmentFile(root), `${JSON.stringify({ schema: "kicad-bridge/enrollments/v1", roots }, null, 2)}\n`, "utf8"); return { status: "enrolled", rootPath: admitted, roots };
  }
  if (args.action === "launch_board") {
    if (!("boardPath" in args) || "rootPath" in args) throw new Error("launch_board requires only boardPath");
    const boardPath = admittedBoard(args.boardPath, root); options.preparePython({ stateRoot: root }); const isolated = ensureIsolatedProfile(root);
    if (existsSync(processFile(root))) { const prior = readJson(processFile(root)); try { process.kill(prior.pid, 0); throw new Error("A bridge-owned KiCad process is already running"); } catch (cause) { if (cause.message.includes("already running")) throw cause; } }
    const child = options.spawn(PCBNEW, [boardPath], { cwd: path.dirname(boardPath), detached: false, windowsHide: false, stdio: "ignore", env: { ...process.env, KICAD_CONFIG_HOME: isolated.profile, KICAD_DOCUMENTS_HOME: isolated.documents, TEMP: isolated.temp, TMP: isolated.temp, KICAD_API_SOCKET: isolated.socketPath } });
    child.unref(); const record = { schema: "kicad-bridge/owned-process/v1", pid: child.pid, executable: PCBNEW, executableSha256: EXPECTED.pcbnew, boardPath, socketPath: isolated.socketPath, launchedAt: new Date().toISOString() };
    atomicWrite(processFile(root), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    try {
      await waitFor(() => { try { process.kill(child.pid, 0); } catch { throw new Error("Bridge-owned KiCad process exited before IPC admission"); } return options.callKiCad("status", { socketPath: isolated.socketPath }, { stateRoot: root }); }, 90_000, 500);
      const rawObservation = options.callKiCad("inspect", { socketPath: isolated.socketPath, boardPath }, { stateRoot: root }); writeSynchronization(root, rawObservation); const observation = deriveCleanState(root, rawObservation); return { status: "launched", pid: child.pid, socketPath: isolated.socketPath, observation };
    } catch (cause) { try { process.kill(child.pid); } catch {} try { rmSync(processFile(root), { force: true }); } catch {} throw cause; }
  }
  if (args.action === "close_owned_process") {
    if ("rootPath" in args || "boardPath" in args) throw new Error("close_owned_process accepts no path fields");
    const record = nativeContext(root); const observation = inspectNative(root, options.callKiCad);
    if (observation.dirty) throw new Error("Refusing to close a dirty bridge-owned KiCad process");
    process.kill(record.pid); rmSync(processFile(root), { force: true }); return { status: "closed", pid: record.pid, boardPath: record.boardPath };
  }
  throw new Error("Unsupported closed setup action");
}

export async function inspectBoard(args = {}, options = runtime) {
  assertClosed(args, []); return inspectNative(options.stateRoot || defaultStateRoot(), options.callKiCad);
}

export async function applyTransaction(args, options = runtime) {
  assertClosed(args, ["boardPath", "expectedRevision", "actions"], ["boardPath", "expectedRevision", "actions"]); const root = options.stateRoot || defaultStateRoot();
  if (!REVISION_PATTERN.test(args.expectedRevision)) throw new Error("expectedRevision is invalid"); validateActions(args.actions); const boardPath = admittedBoard(args.boardPath, root);
  const context = nativeContext(root); if (path.resolve(context.boardPath).toLowerCase() !== boardPath.toLowerCase()) throw new Error("boardPath is not the bridge-owned open board");
  const before = deriveCleanState(root, options.callKiCad("inspect", { socketPath: context.socketPath, boardPath }, { stateRoot: root }));
  if (before.dirty) throw new Error("Refusing to mutate a dirty board"); if (before.revision !== args.expectedRevision) throw new Error("Stale expectedRevision");
  const preBytes = readFileSync(boardPath); const preSha256 = sha256(preBytes); if (preSha256 !== before.board.sha256) throw new Error("Saved board readback drift before mutation");
  const checkpointPath = ownedFile(root, "checkpoints", `${preSha256}.kicad_pcb`); if (existsSync(checkpointPath) && fileSha256(checkpointPath) !== preSha256) throw new Error("Foreign checkpoint collision");
  if (!existsSync(checkpointPath)) atomicWrite(checkpointPath, preBytes);
  try {
    options.callKiCad("apply", { socketPath: context.socketPath, boardPath, actions: args.actions }, { stateRoot: root, timeoutMs: 60_000 });
    const rawReadback = options.callKiCad("inspect", { socketPath: context.socketPath, boardPath }, { stateRoot: root });
    const postSha256 = fileSha256(boardPath); if (rawReadback.board.sha256 !== postSha256 || postSha256 === preSha256) throw new Error("Independent saved-state readback failed"); writeSynchronization(root, rawReadback); const readback = deriveCleanState(root, rawReadback); if (readback.dirty) throw new Error("Independent synchronized-state readback failed");
    const body = { schema: "kicad-bridge/receipt/v1", boardPath, preSha256, postSha256, preMemorySha256: before.board.memorySha256, postMemorySha256: readback.board.memorySha256, checkpointPath, preRevision: before.revision, postRevision: readback.revision, actions: args.actions, createdAt: new Date().toISOString() };
    const receiptId = `sha256:${sha256(Buffer.from(canonicalJson(body)))}`; const receipt = { ...body, receiptId }; const receiptPath = ownedFile(root, "receipts", `${receiptId.slice(7)}.json`);
    if (existsSync(receiptPath)) throw new Error("Receipt identity collision"); atomicWrite(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    return { status: "applied", receiptId, checkpointPath, observation: readback, readback: { boardSha256: postSha256, independentClient: true } };
  } catch (cause) {
    if (fileSha256(boardPath) !== preSha256) { atomicWrite(boardPath, preBytes); try { const restored = options.callKiCad("revert", { socketPath: context.socketPath, boardPath }, { stateRoot: root }); writeSynchronization(root, restored); } catch {} }
    throw cause;
  }
}

export async function exportArtifact(args, options = runtime) {
  assertClosed(args, ["boardPath", "expectedRevision", "format"], ["boardPath", "expectedRevision", "format"]); const root = options.stateRoot || defaultStateRoot();
  if (!REVISION_PATTERN.test(args.expectedRevision) || !["png", "jpeg"].includes(args.format)) throw new Error("Export revision or format is invalid"); const boardPath = admittedBoard(args.boardPath, root);
  const observation = inspectNative(root, options.callKiCad); if (observation.board.path.toLowerCase() !== boardPath.toLowerCase() || observation.revision !== args.expectedRevision || observation.dirty) throw new Error("Export requires the clean exact open revision");
  const outputPath = ownedFile(root, "exports", `${args.expectedRevision.slice(7)}.${args.format === "jpeg" ? "jpg" : "png"}`); ensureDir(path.dirname(outputPath));
  options.execFileSync(KICAD_CLI, ["pcb", "render", "--output", outputPath, "--width", "1440", "--height", "900", "--side", "top", "--background", "opaque", "--quality", "high", "--preset", "follow_plot_settings", boardPath], { encoding: "utf8", windowsHide: true, timeout: 120_000 });
  if (!existsSync(outputPath) || statSync(outputPath).size < 100) throw new Error("KiCad CLI did not produce an admitted artifact"); return { status: "exported", format: args.format, outputPath, sha256: fileSha256(outputPath), bytes: statSync(outputPath).size, sourceRevision: args.expectedRevision, surface: "kicad-cli 10.0.5 pcb render" };
}

export async function rollbackReceipt(args, options = runtime) {
  assertClosed(args, ["receiptId"], ["receiptId"]); if (!RECEIPT_PATTERN.test(args.receiptId)) throw new Error("receiptId is invalid"); const root = options.stateRoot || defaultStateRoot();
  const receiptPath = ownedFile(root, "receipts", `${args.receiptId.slice(7)}.json`); if (!existsSync(receiptPath)) throw new Error("Receipt does not exist"); const receipt = readJson(receiptPath);
  if (receipt.receiptId !== args.receiptId || receipt.schema !== "kicad-bridge/receipt/v1") throw new Error("Foreign receipt rejected"); const boardPath = admittedBoard(receipt.boardPath, root); const context = nativeContext(root);
  if (context.boardPath.toLowerCase() !== boardPath.toLowerCase()) throw new Error("Receipt board is not the bridge-owned open board"); const current = deriveCleanState(root, options.callKiCad("inspect", { socketPath: context.socketPath, boardPath }, { stateRoot: root }));
  if (current.dirty || current.revision !== receipt.postRevision || fileSha256(boardPath) !== receipt.postSha256) throw new Error("Rollback refused because post-state drifted"); if (!existsSync(receipt.checkpointPath) || fileSha256(receipt.checkpointPath) !== receipt.preSha256) throw new Error("Checkpoint identity drift");
  atomicWrite(boardPath, readFileSync(receipt.checkpointPath)); options.callKiCad("revert", { socketPath: context.socketPath, boardPath }, { stateRoot: root }); const rawRestored = options.callKiCad("inspect", { socketPath: context.socketPath, boardPath }, { stateRoot: root }); writeSynchronization(root, rawRestored); const restored = deriveCleanState(root, rawRestored);
  const restoredSha256 = fileSha256(boardPath); const exactBytes = restoredSha256 === receipt.preSha256 && restored.board.sha256 === receipt.preSha256 && restored.board.memorySha256 === receipt.preMemorySha256 && restored.revision === receipt.preRevision && !restored.dirty;
  if (!exactBytes) throw new Error("Exact native restoration failed"); return { status: "rolled-back", receiptId: args.receiptId, boardPath, restoredSha256, restoredRevision: restored.revision, exactBytes: true, observation: restored };
}
