import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : stableStringify(value));
  return createHash("sha256").update(bytes).digest("hex");
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /(password|secret|token|authorization|credential|challenge|salt)/i.test(key) ? "[REDACTED]" : redact(item),
  ]));
}

export function normalizeEndpoint(raw = "ws://127.0.0.1:4455") {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("endpoint must be a valid WebSocket URL");
  }
  if (!["ws:", "wss:"].includes(url.protocol)) throw new Error("endpoint protocol must be ws or wss");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("endpoint must resolve to loopback");
  if (url.username || url.password || url.search || url.hash) throw new Error("endpoint must not contain credentials, query, or fragment");
  return url.toString().replace(/\/$/, "");
}

export function resolveStateRoot(env = process.env, override = null) {
  if (override) return path.resolve(override);
  const codexHome = env.CODEX_HOME?.trim() || (env.USERPROFILE?.trim() ? path.join(env.USERPROFILE, ".codex") : null);
  if (!codexHome) throw new Error("Cannot resolve Codex state root from CODEX_HOME or USERPROFILE");
  return path.join(codexHome, "state", "plugins", "obs-bridge", "v1");
}

function atomicWrite(file, content, { immutable = false } = {}) {
  mkdirSync(path.dirname(file), { recursive: true });
  if (immutable && existsSync(file)) {
    if (readFileSync(file, "utf8") !== content) throw new Error(`Immutable state collision: ${path.basename(file)}`);
    return;
  }
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function writeEnrollment(stateRoot, enrollment) {
  const clean = redact(enrollment);
  atomicWrite(path.join(stateRoot, "enrollment.json"), `${JSON.stringify(clean, null, 2)}\n`);
  return clean;
}

export function writeReceipt(stateRoot, body) {
  const clean = redact(body);
  const digest = sha256(clean);
  const receipt = { ...clean, receiptId: `sha256:${digest}` };
  const file = path.join(stateRoot, "receipts", `${digest}.json`);
  atomicWrite(file, `${JSON.stringify(receipt, null, 2)}\n`, { immutable: true });
  return { receipt, file };
}

export function readReceipt(stateRoot, receiptId) {
  if (!/^sha256:[a-f0-9]{64}$/.test(receiptId || "")) throw new Error("receiptId must be sha256:<64 lowercase hex characters>");
  const file = path.join(stateRoot, "receipts", `${receiptId.slice(7)}.json`);
  if (!existsSync(file)) throw new Error("Unknown OBS Bridge receipt");
  const receipt = JSON.parse(readFileSync(file, "utf8"));
  if (receipt.receiptId !== receiptId) throw new Error("Receipt identity mismatch");
  return { receipt, file };
}
