import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PLUGIN_VERSION = "0.2.0";

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : stableStringify(value));
  return createHash("sha256").update(bytes).digest("hex");
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [/(password|secret|token|authorization|credential)/i.test(key) ? key : key, /(password|secret|token|authorization|credential)/i.test(key) ? "[REDACTED]" : redact(item)]));
}

export function resolveStateRoot(env = process.env, override = null) {
  if (override) return path.resolve(override);
  const codexHome = env.CODEX_HOME?.trim() || (env.USERPROFILE?.trim() ? path.join(env.USERPROFILE, ".codex") : null);
  if (!codexHome) throw new Error("Cannot resolve Codex state root from CODEX_HOME or USERPROFILE");
  return path.join(codexHome, "state", "plugins", "godot-bridge", "v1");
}

export function atomicWrite(file, bytes, { immutable = false, mode = 0o600 } = {}) {
  mkdirSync(path.dirname(file), { recursive: true });
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (immutable && existsSync(file)) {
    if (!readFileSync(file).equals(content)) throw new Error(`Immutable state collision: ${file}`);
    return;
  }
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { flag: "wx", mode });
    try { chmodSync(temporary, mode); } catch {}
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function writeJson(file, value, options = {}) {
  atomicWrite(file, `${JSON.stringify(redact(value), null, 2)}\n`, options);
  return value;
}

function assertNoLinkEscape(root) {
  const parsed = path.parse(root);
  let current = parsed.root;
  for (const part of root.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = lstatSync(current);
    if (info.isSymbolicLink()) throw new Error(`Symlink/reparse traversal is not admitted: ${current}`);
  }
}

export function resolveProjectRoot(raw) {
  if (typeof raw !== "string" || !path.isAbsolute(raw)) throw new Error("projectRoot must be an absolute path");
  const resolved = realpathSync.native(path.resolve(raw));
  assertNoLinkEscape(resolved);
  if (!statSync(resolved).isDirectory() || !existsSync(path.join(resolved, "project.godot"))) throw new Error("projectRoot must contain project.godot");
  return resolved;
}

export function resolveResPath(projectRoot, raw, { mustExist = false } = {}) {
  if (typeof raw !== "string" || !raw.startsWith("res://")) throw new Error("Godot paths must begin with res://");
  const relative = raw.slice(6).replaceAll("/", path.sep);
  if (!relative || relative.split(path.sep).some((part) => !part || part === "." || part === "..")) throw new Error(`Invalid project-relative path: ${raw}`);
  const target = path.resolve(projectRoot, relative);
  const prefix = `${path.resolve(projectRoot)}${path.sep}`.toLowerCase();
  if (!target.toLowerCase().startsWith(prefix)) throw new Error(`Path escapes project root: ${raw}`);
  let ancestor = target;
  while (!existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  if (existsSync(ancestor)) assertNoLinkEscape(realpathSync.native(ancestor));
  if (mustExist && !existsSync(target)) throw new Error(`Project path does not exist: ${raw}`);
  return { target, relative: relative.replaceAll(path.sep, "/"), resource: `res://${relative.replaceAll(path.sep, "/")}` };
}

function walkProject(root, current = root, files = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    const relative = path.relative(root, full).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) throw new Error(`Project contains symlink/reparse entry: ${relative}`);
    if (entry.isDirectory()) {
      if (entry.name === ".godot" || entry.name === ".git" || relative === "addons/codex_godot_bridge") continue;
      walkProject(root, full, files);
    } else if (!entry.name.endsWith(".import")) files.push({ full, relative });
  }
  return files;
}

export function projectRevision(projectRoot) {
  const records = walkProject(projectRoot).sort((a, b) => a.relative.localeCompare(b.relative)).map(({ full, relative }) => ({ path: relative, sha256: sha256(readFileSync(full)) }));
  return `sha256:${sha256(stableStringify(records))}`;
}

export function legacyProjectRevision(projectRoot) {
  const records = walkProject(projectRoot).filter(({ relative }) => relative === "project.godot" || /\.(gd|gdshader|tscn|tres|res|cfg)$/i.test(relative)).sort((a, b) => a.relative.localeCompare(b.relative)).map(({ full, relative }) => ({ path: relative, sha256: sha256(readFileSync(full)) }));
  return `sha256:${sha256(stableStringify(records))}`;
}

export function projectId(projectRoot) {
  return `sha256:${sha256(path.resolve(projectRoot).toLowerCase())}`;
}

export function enrollmentFile(stateRoot, projectRoot) {
  return path.join(stateRoot, "enrollments", `${projectId(projectRoot).slice(7)}.json`);
}

export function readEnrollment(stateRoot, projectRoot) {
  const file = enrollmentFile(stateRoot, projectRoot);
  if (!existsSync(file)) throw new Error("Project is not enrolled in Godot Bridge");
  return { file, enrollment: JSON.parse(readFileSync(file, "utf8")) };
}

export function createCheckpoint(stateRoot, projectRoot, targets, transactionId) {
  const id = sha256(stableStringify({ projectRoot, targets: [...targets].sort(), transactionId, nonce: randomUUID() }));
  const root = path.join(stateRoot, "checkpoints", id);
  mkdirSync(path.join(root, "files"), { recursive: true });
  const entries = [];
  for (const resource of [...new Set(targets)].sort()) {
    const { target, relative } = resolveResPath(projectRoot, resource);
    const existed = existsSync(target);
    const entry = { resource, relative, existed, preSha256: existed ? sha256(readFileSync(target)) : null };
    if (existed) {
      const stored = path.join(root, "files", relative);
      mkdirSync(path.dirname(stored), { recursive: true });
      copyFileSync(target, stored);
    }
    entries.push(entry);
  }
  writeJson(path.join(root, "index.json"), { schema: "godot-bridge/checkpoint/v1", checkpointId: `sha256:${id}`, projectRoot, transactionId, entries }, { immutable: true });
  return { checkpointId: `sha256:${id}`, root, entries };
}

export function restoreCheckpoint(stateRoot, checkpointId, projectRoot) {
  if (!/^sha256:[a-f0-9]{64}$/.test(checkpointId || "")) throw new Error("Invalid checkpoint identity");
  const root = path.join(stateRoot, "checkpoints", checkpointId.slice(7));
  const index = JSON.parse(readFileSync(path.join(root, "index.json"), "utf8"));
  if (path.resolve(index.projectRoot).toLowerCase() !== path.resolve(projectRoot).toLowerCase()) throw new Error("Checkpoint project identity mismatch");
  for (const entry of index.entries) {
    const { target } = resolveResPath(projectRoot, entry.resource);
    if (entry.existed) {
      const stored = path.join(root, "files", entry.relative);
      mkdirSync(path.dirname(target), { recursive: true });
      atomicWrite(target, readFileSync(stored));
    } else if (existsSync(target)) rmSync(target, { force: true });
  }
  return index;
}

export function writeReceipt(stateRoot, body) {
  const clean = redact({ ...body, schema: "godot-bridge/receipt/v1", pluginVersion: PLUGIN_VERSION });
  const digest = sha256(clean);
  const receipt = { ...clean, receiptId: `sha256:${digest}` };
  const file = path.join(stateRoot, "receipts", `${digest}.json`);
  writeJson(file, receipt, { immutable: true });
  return { receipt, file };
}

export function writeExportReceipt(stateRoot, body) {
  const clean = redact({ ...body, schema: "godot-bridge/export-receipt/v1", pluginVersion: PLUGIN_VERSION });
  const digest = sha256(clean);
  const receipt = { ...clean, receiptId: `sha256:${digest}` };
  const file = path.join(stateRoot, "export-receipts", `${digest}.json`);
  writeJson(file, receipt, { immutable: true });
  return { receipt, file };
}

export function readReceipt(stateRoot, receiptId) {
  if (!/^sha256:[a-f0-9]{64}$/.test(receiptId || "")) throw new Error("receiptId must be sha256:<64 lowercase hex characters>");
  const file = path.join(stateRoot, "receipts", `${receiptId.slice(7)}.json`);
  if (!existsSync(file)) throw new Error("Unknown Godot Bridge receipt");
  const receipt = JSON.parse(readFileSync(file, "utf8"));
  if (receipt.receiptId !== receiptId) throw new Error("Receipt identity mismatch");
  return { receipt, file };
}
