import { createHash, randomUUID } from "node:crypto";

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? value
    : Buffer.from(typeof value === "string" ? value : canonicalJson(value));
  return createHash("sha256").update(bytes).digest("hex");
}

export function slug(value, label = "identity") {
  const result = String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").replace(/-{2,}/g, "-");
  if (!result || result.length > 64) throw new TypeError(`${label} must normalize to 1-64 lowercase hyphenated characters`);
  return result;
}

export function operationId(prefix) {
  return `${slug(prefix)}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function clone(value) {
  return structuredClone(value);
}
