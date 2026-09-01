import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { atomicWrite } from "./state.mjs";

export const PROTOCOL = "krita-bridge/1";
export const APPLICATION_VERSION = "5.3.3";
export const BRIDGE_VERSION = "0.1.0";
export const API_VERSION = "PyKrita 5.3.3";
const MAX_BODY = 2 * 1024 * 1024;

async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error("body exceeds 2 MiB"); chunks.push(chunk); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function send(res, status, value = null) {
  if (value === null) { res.writeHead(status); res.end(); return; }
  const bytes = Buffer.from(JSON.stringify(value)); res.writeHead(status, { "content-type": "application/json", "content-length": bytes.length }); res.end(bytes);
}

export class Coordinator {
  constructor({ stateRoot, timeoutMs = 30_000 } = {}) {
    this.stateRoot = stateRoot; this.timeoutMs = timeoutMs; this.token = randomBytes(32).toString("base64url");
    this.server = null; this.endpoint = null; this.connections = new Map(); this.queue = []; this.pending = new Map();
    this.currentFile = path.join(stateRoot, "runtime", "current.json");
  }
  async start() {
    if (this.server) return this;
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise((resolve, reject) => { this.server.once("error", reject); this.server.listen(0, "127.0.0.1", resolve); });
    this.endpoint = `http://127.0.0.1:${this.server.address().port}`;
    atomicWrite(this.currentFile, `${JSON.stringify({ protocol: PROTOCOL, endpoint: this.endpoint, token: this.token, pid: process.pid, expiresAt: new Date(Date.now() + 86400000).toISOString() }, null, 2)}\n`, { mode: 0o600 });
    return this;
  }
  async close() {
    for (const pending of this.pending.values()) pending.reject(new Error("Coordinator stopped")); this.pending.clear();
    if (this.server) await new Promise((resolve) => this.server.close(resolve)); this.server = null;
    try { if (existsSync(this.currentFile)) rmSync(this.currentFile, { force: true }); } catch {}
  }
  async handle(req, res) {
    try {
      if (req.headers.authorization !== `Bearer ${this.token}`) return send(res, 401, { error: "unauthorized" });
      const url = new URL(req.url, this.endpoint);
      if (req.method === "POST" && url.pathname === "/v1/connect") {
        const data = await body(req);
        if (data.protocol !== PROTOCOL || !Number.isInteger(data.pid) || data.applicationVersion !== APPLICATION_VERSION || data.bridgeVersion !== BRIDGE_VERSION || data.apiVersion !== API_VERSION || data.versionInt !== 50303) return send(res, 400, { error: "invalid or unsupported native identity" });
        this.connections.set(data.pid, { ...data, lastSeen: Date.now() }); return send(res, 200, { accepted: true, protocol: PROTOCOL });
      }
      if (req.method === "GET" && url.pathname === "/v1/jobs/next") {
        const pid = Number(url.searchParams.get("pid")); const connection = this.connections.get(pid);
        if (!connection) return send(res, 409, { error: "native client is not connected" });
        connection.lastSeen = Date.now(); const job = this.queue.shift(); return job ? send(res, 200, job) : send(res, 204);
      }
      const match = url.pathname.match(/^\/v1\/jobs\/([A-Za-z0-9-]+)\/complete$/);
      if (req.method === "POST" && match) {
        const result = await body(req); const pending = this.pending.get(match[1]); if (!pending) return send(res, 404, { error: "unknown job" });
        clearTimeout(pending.timer); this.pending.delete(match[1]); pending.resolve(result); return send(res, 200, { accepted: true });
      }
      return send(res, 404, { error: "not found" });
    } catch (error) { return send(res, 400, { error: String(error.message).slice(0, 1000) }); }
  }
  connection() { return [...this.connections.values()].filter((item) => Date.now() - item.lastSeen < 5000).sort((a, b) => b.lastSeen - a.lastSeen)[0] || null; }
  async dispatch(operation, input = {}, timeoutMs = this.timeoutMs) {
    if (!this.connection()) throw new Error("Krita extension is not connected");
    const id = randomUUID(); const job = { id, protocol: PROTOCOL, operation, input };
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Native operation timed out: ${operation}`)); }, timeoutMs);
      this.pending.set(id, { resolve: (result) => result?.ok === false ? reject(new Error(result.error || "native operation failed")) : resolve(result), reject, timer }); this.queue.push(job);
    });
  }
}
