import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export function stateRoot() {
  const root = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || "", ".codex");
  return path.join(root, "state", "plugins", "reaper-bridge", "v1");
}
export function ensureDir(dir) { mkdirSync(dir, { recursive: true }); return dir; }
export function atomicWrite(file, value, options = {}) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, value, options);
  renameSync(temp, file);
}
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function fileSha256(file) { return sha256(readFileSync(file)); }
export function readJson(file) { return JSON.parse(readFileSync(file, "utf8")); }
export function ownedFile(root, ...parts) {
  const result = path.resolve(root, ...parts);
  if (result !== path.resolve(root) && !result.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("State path escaped bridge root");
  return result;
}
export function waitForFile(file, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (existsSync(file)) return resolve(file);
      if (Date.now() - started >= timeoutMs) return reject(new Error(`Timed out waiting for ${file}`));
      setTimeout(tick, 100);
    };
    tick();
  });
}

