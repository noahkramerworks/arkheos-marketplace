import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sha256 } from "./state.mjs";

const owned = new Map();

function projectRecords(projectRoot) {
  return [...owned.values()].filter((entry) => entry.projectRoot.toLowerCase() === projectRoot.toLowerCase());
}

function latestProjectRecord(projectRoot, { runningOnly = false } = {}) {
  const records = projectRecords(projectRoot);
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    const running = !record.exited && record.process.exitCode === null && record.process.signalCode === null;
    if (!runningOnly || running) return record;
  }
  return null;
}

export function resolveEngine(raw, env = process.env) {
  const candidates = [raw, env.GODOT_ENGINE_PATH,
    "C:\\Users\\rizek\\Documents\\Codex\\2026-07-31\\ch\\work\\toolchains\\godot-4.7.1\\Godot_v4.7.1-stable_win64_console.exe",
    "C:\\Users\\rizek\\Documents\\Codex\\2026-08-13\\unreal-engine-vs-godot-for-making\\.toolchains\\godot\\4.7.1\\Godot_v4.7.1-stable_win64_console.exe",
  ].filter(Boolean);
  const found = candidates.find((candidate) => path.isAbsolute(candidate) && existsSync(candidate));
  if (!found) throw new Error("Godot executable was not found; supply enginePath");
  return path.resolve(found);
}

export function inspectEngine(raw, env = process.env) {
  const enginePath = resolveEngine(raw, env);
  const result = spawnSync(enginePath, ["--version"], { encoding: "utf8", timeout: 10_000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Godot version probe failed: ${result.error?.message || result.stderr || result.status}`);
  const bytes = readFileSync(enginePath);
  return { enginePath, version: result.stdout.trim(), sha256: `sha256:${sha256(bytes)}`, bytes: bytes.length };
}

export function openEditor({ enginePath, projectRoot, mode = "editor", discovery }) {
  if (!["editor", "headless"].includes(mode)) throw new Error("mode must be editor or headless");
  const existing = latestProjectRecord(projectRoot, { runningOnly: true });
  if (existing) return { status: "already-owned", processId: existing.process.pid, launchId: existing.launchId, mode: existing.mode };
  const args = ["--editor", "--path", projectRoot];
  if (mode === "headless") args.unshift("--headless");
  const env = { ...process.env, GODOT_BRIDGE_COORDINATOR_URL: discovery.endpoint, GODOT_BRIDGE_TOKEN: discovery.token, GODOT_BRIDGE_PROJECT_ROOT: projectRoot };
  const child = spawn(enginePath, args, { cwd: projectRoot, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const launchId = randomUUID();
  const record = { launchId, projectRoot, enginePath, mode, process: child, startedAt: new Date().toISOString(), stdout: [], stderr: [], exited: false, exitCode: null, exitSignal: null };
  record.exitPromise = new Promise((resolve) => child.once("exit", (code, signal) => {
    record.exited = true; record.exitCode = code; record.exitSignal = signal; resolve(true);
  }));
  child.stdout.on("data", (chunk) => { record.stdout.push(chunk.toString("utf8")); if (record.stdout.length > 200) record.stdout.shift(); });
  child.stderr.on("data", (chunk) => { record.stderr.push(chunk.toString("utf8")); if (record.stderr.length > 200) record.stderr.shift(); });
  owned.set(launchId, record);
  return { status: "started", processId: child.pid, launchId, mode };
}

export function closeOwned(projectRoot) {
  const record = latestProjectRecord(projectRoot, { runningOnly: true });
  if (!record) return { status: "not-owned", stopped: false };
  record.process.kill();
  return { status: "stop-requested", stopped: true, processId: record.process.pid, launchId: record.launchId };
}

export async function waitForOwnedExit(projectRoot, timeoutMs = 15_000) {
  const record = latestProjectRecord(projectRoot);
  if (!record) return true;
  if (record.exited || record.process.exitCode !== null) { await new Promise((resolve) => setTimeout(resolve, 250)); return true; }
  const exited = await Promise.race([
    record.exitPromise,
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
  if (exited) { await new Promise((resolve) => setTimeout(resolve, 250)); return true; }
  try { process.kill(record.process.pid, 0); } catch { record.exited = true; await new Promise((resolve) => setTimeout(resolve, 250)); return true; }
  return false;
}

export function ownedProcess(projectRoot) {
  const record = latestProjectRecord(projectRoot);
  if (!record) return null;
  return { launchId: record.launchId, processId: record.process.pid, mode: record.mode, startedAt: record.startedAt, running: !record.exited && record.process.exitCode === null, exitCode: record.exitCode ?? record.process.exitCode, exitSignal: record.exitSignal, stdout: record.stdout.slice(-50), stderr: record.stderr.slice(-50) };
}
