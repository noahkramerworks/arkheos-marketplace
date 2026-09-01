import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export function stateRoot() {
  const codexRoot = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || "", ".codex");
  return path.join(codexRoot, "state", "plugins", "krita-bridge", "v1");
}
export function ensureDir(dir) { mkdirSync(dir, { recursive: true }); return dir; }
export function atomicWrite(file, value, options = {}) {
  ensureDir(path.dirname(file)); const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, value, options); renameSync(temp, file);
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
export function waitFor(predicate, timeoutMs = 30_000, intervalMs = 100) {
  return new Promise((resolve, reject) => { const started = Date.now(); const tick = async () => {
    try { const value = await predicate(); if (value) return resolve(value); } catch {}
    if (Date.now() - started >= timeoutMs) return reject(new Error("Timed out waiting for native state"));
    setTimeout(tick, intervalMs);
  }; void tick(); });
}
export function fileExists(file) { return existsSync(file); }

