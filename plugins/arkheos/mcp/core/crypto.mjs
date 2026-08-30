import { createPublicKey, verify } from "node:crypto";
import { canonicalJson, sha256 } from "./canonical.mjs";

const SHA = /^[a-f0-9]{64}$/;
const SAFE_PATH = /^(?![A-Za-z]:)(?!\/)(?!\\)(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[A-Za-z0-9._@+\-/]+$/;

export function decodeBase64url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError("Invalid base64url value");
  return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4), "base64");
}

export function unsignedPayload(record) {
  const { signature, ...unsigned } = record;
  return Buffer.from(canonicalJson(unsigned));
}

export function verifySignedRecord(record, trustedKeys, expectedSchema, now = new Date()) {
  if (!record || record.schema !== expectedSchema) throw new Error(`Expected ${expectedSchema}`);
  const signature = record.signature;
  if (signature?.algorithm !== "Ed25519" || !signature.keyId || !signature.value) throw new Error("Signed record is missing an Ed25519 signature");
  const jwk = trustedKeys?.[signature.keyId];
  if (!jwk) throw new Error(`Untrusted signing key: ${signature.keyId}`);
  const valid = verify(null, unsignedPayload(record), createPublicKey({ key: jwk, format: "jwk" }), decodeBase64url(signature.value));
  if (!valid) throw new Error("Invalid signed record");
  if (record.issuedAt && Date.parse(record.issuedAt) > now.getTime() + 300000) throw new Error("Signed record is from the future");
  if (record.expiresAt && Date.parse(record.expiresAt) <= now.getTime()) throw new Error("Signed record is expired");
  return { valid: true, digest: sha256(record), keyId: signature.keyId };
}

export function verifyArtifact(bytes, expected) {
  if (!expected || !SHA.test(expected.sha256 || "") || !Number.isSafeInteger(expected.length) || expected.length < 1) throw new Error("Malformed artifact descriptor");
  if (bytes.length !== expected.length) throw new Error("Artifact length mismatch");
  const observed = sha256(bytes);
  if (observed !== expected.sha256) throw new Error("Artifact digest mismatch");
  return { sha256: observed, length: bytes.length };
}

export function validateArchive(bytes, { product, maximumBytes = 64 * 1024 * 1024 } = {}) {
  if (bytes.length > maximumBytes) throw new Error("Archive exceeds maximum size");
  let archive;
  try { archive = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("Archive is not valid JSON"); }
  if (archive?.schema !== "arkheos.product-archive/v1" || archive.product !== product || !Array.isArray(archive.files) || archive.files.length === 0) throw new Error("Malformed product archive");
  const seen = new Set();
  const files = archive.files.map((entry) => {
    if (!entry || entry.type !== "file" || typeof entry.path !== "string" || !SAFE_PATH.test(entry.path) || entry.path.includes("//") || entry.path.split("/").some((part) => part === "." || part === ".." || !part)) throw new Error("Unsafe archive path");
    const normalized = entry.path.replaceAll("\\", "/");
    if (seen.has(normalized.toLowerCase())) throw new Error("Duplicate archive path");
    seen.add(normalized.toLowerCase());
    const content = Buffer.from(entry.content || "", "base64");
    if (!Number.isSafeInteger(entry.length) || content.length !== entry.length || !SHA.test(entry.sha256 || "") || sha256(content) !== entry.sha256) throw new Error("Archive entry identity mismatch");
    return { path: normalized, content, sha256: entry.sha256, length: entry.length };
  });
  const requiredManifest = ".agents/plugins/marketplace.json";
  if (!files.some((file) => file.path === requiredManifest)) throw new Error(`Archive is missing ${requiredManifest}`);
  return { schema: archive.schema, product: archive.product, version: archive.version, files };
}
