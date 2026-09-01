import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ownedFile, stateRoot as defaultStateRoot } from "./state.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const operations = new Set(["status", "inspect", "apply", "revert"]);

export function pythonPath(root = defaultStateRoot()) {
  return ownedFile(root, "runtime", "python", "Scripts", "python.exe");
}

export function callKiCad(operation, payload = {}, options = {}) {
  if (!operations.has(operation)) throw new Error("Unsupported fixed KiCad client operation");
  const root = options.stateRoot || defaultStateRoot(); const python = options.pythonPath || pythonPath(root);
  if (!existsSync(python)) throw new Error("KiCad Bridge Python runtime is not prepared");
  const client = path.join(sourceRoot, "kicad-adapter", "adapter", "client.py");
  const input = JSON.stringify({ operation, ...payload });
  let output;
  try {
    output = execFileSync(python, [client], {
      cwd: sourceRoot, input, encoding: "utf8", windowsHide: true,
      timeout: options.timeoutMs || 30_000,
      env: { ...process.env, PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1" }
    });
  } catch (cause) {
    const detail = String(cause.stdout || cause.stderr || cause.message).trim();
    throw new Error(detail.slice(0, 2000) || "KiCad IPC client process failed");
  }
  const result = JSON.parse(output);
  if (!result || result.ok !== true) throw new Error(result?.error || "KiCad IPC client rejected the operation");
  return result;
}
