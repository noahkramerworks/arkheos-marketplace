import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export function stateRoot() {
  const codexRoot = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || "", ".codex");
  return path.join(codexRoot, "state", "plugins", "kicad-bridge", "v1");
}
export function ensureDir(dir) { mkdirSync(dir, { recursive: true }); return dir; }
export function atomicWrite(file, value, options = {}) {
  ensureDir(path.dirname(file)); const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, value, options); renameSync(temporary, file);
}
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function fileSha256(file) { return sha256(readFileSync(file)); }
export function readJson(file) { return JSON.parse(readFileSync(file, "utf8")); }
export function ownedFile(root, ...parts) {
  const base = path.resolve(root); const result = path.resolve(base, ...parts);
  if (result !== base && !result.toLowerCase().startsWith(`${base.toLowerCase()}${path.sep}`)) throw new Error("State path escaped bridge root");
  return result;
}
export function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
export function fileExists(file) { return existsSync(file); }
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function waitFor(predicate, timeoutMs = 60_000, intervalMs = 250) {
  const started = Date.now(); let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try { const value = await predicate(); if (value) return value; } catch (cause) { lastError = cause; }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for native KiCad state${lastError ? `: ${lastError.message}` : ""}`);
}
