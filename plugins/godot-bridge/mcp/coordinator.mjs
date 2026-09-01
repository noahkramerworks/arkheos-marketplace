import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { existsSync, rmSync } from "node:fs";
import { PROTOCOL } from "./protocol.mjs";
import { atomicWrite, projectId } from "./state.mjs";

const MAX_BODY = 2 * 1024 * 1024;

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Request body exceeds 2 MiB");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON body must be an object");
  return parsed;
}

function send(res, status, value = null) {
  if (value === null) { res.writeHead(status); res.end(); return; }
  const bytes = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { "content-type": "application/json", "content-length": bytes.length });
  res.end(bytes);
}

export class Coordinator {
  constructor({ stateRoot, timeoutMs = 30_000 } = {}) {
    this.stateRoot = stateRoot;
    this.timeoutMs = timeoutMs;
    this.token = randomBytes(32).toString("base64url");
    this.server = null;
    this.endpoint = null;
    this.runtimeFile = path.join(stateRoot, "runtime", `server-${process.pid}.json`);
    this.currentFile = path.join(stateRoot, "runtime", "current.json");
    this.connections = new Map();
    this.queues = new Map();
    this.pending = new Map();
  }

  async start() {
    if (this.server) return this;
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise((resolve, reject) => { this.server.once("error", reject); this.server.listen(0, "127.0.0.1", resolve); });
    const address = this.server.address();
    this.endpoint = `http://127.0.0.1:${address.port}`;
    const discovery = { protocol: PROTOCOL, endpoint: this.endpoint, token: this.token, pid: process.pid, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
    atomicWrite(this.runtimeFile, `${JSON.stringify(discovery, null, 2)}\n`, { mode: 0o600 });
    atomicWrite(this.currentFile, `${JSON.stringify(discovery, null, 2)}\n`, { mode: 0o600 });
    return this;
  }

  async close() {
    for (const pending of this.pending.values()) pending.reject(new Error("Godot Bridge coordinator stopped"));
    this.pending.clear();
    if (this.server) await new Promise((resolve) => this.server.close(resolve));
    this.server = null;
    for (const file of [this.runtimeFile, this.currentFile]) {
      try { if (existsSync(file)) rmSync(file, { force: true }); } catch {}
    }
  }

  auth(req) { return req.headers.authorization === `Bearer ${this.token}`; }

  key(raw) { return path.resolve(raw || "").toLowerCase(); }

  async handle(req, res) {
    try {
      if (!this.auth(req)) return send(res, 401, { error: "unauthorized" });
      const url = new URL(req.url, this.endpoint);
      if (req.method === "POST" && url.pathname === "/v1/connect") {
        const data = await body(req);
        if (data.protocol !== PROTOCOL || typeof data.projectRoot !== "string") return send(res, 400, { error: "invalid connection envelope" });
        const key = this.key(data.projectRoot);
        this.connections.set(key, { ...data, projectId: projectId(data.projectRoot), lastSeen: Date.now() });
        return send(res, 200, { protocol: PROTOCOL, projectId: projectId(data.projectRoot), accepted: true });
      }
      if (req.method === "GET" && url.pathname === "/v1/jobs/next") {
        const projectRoot = url.searchParams.get("projectRoot");
        const key = this.key(projectRoot);
        const connection = this.connections.get(key);
        if (connection) connection.lastSeen = Date.now();
        const queue = this.queues.get(key) || [];
        const job = queue.shift();
        this.queues.set(key, queue);
        return job ? send(res, 200, job) : send(res, 204);
      }
      const match = url.pathname.match(/^\/v1\/jobs\/([A-Za-z0-9-]+)\/complete$/);
      if (req.method === "POST" && match) {
        const data = await body(req);
        const pending = this.pending.get(match[1]);
        if (!pending) return send(res, 404, { error: "unknown or completed job" });
        this.pending.delete(match[1]);
        clearTimeout(pending.timer);
        pending.resolve(data);
        return send(res, 200, { accepted: true });
      }
      return send(res, 404, { error: "not found" });
    } catch (error) {
      return send(res, 400, { error: String(error.message).slice(0, 2000) });
    }
  }

  isConnected(projectRoot) {
    const connection = this.connections.get(this.key(projectRoot));
    return Boolean(connection && Date.now() - connection.lastSeen < 10_000);
  }

  disconnect(projectRoot) {
    const key = this.key(projectRoot);
    this.connections.delete(key);
    this.queues.delete(key);
    for (const [requestId, pending] of this.pending) {
      if (this.key(pending.projectRoot) !== key) continue;
      clearTimeout(pending.timer);
      pending.reject(new Error("Godot editor addon disconnected"));
      this.pending.delete(requestId);
    }
  }

  connection(projectRoot) { return this.connections.get(this.key(projectRoot)) || null; }

  async dispatch(projectRoot, operation, input = {}, timeoutMs = this.timeoutMs) {
    const key = this.key(projectRoot);
    if (!this.isConnected(projectRoot)) throw new Error("Godot editor addon is not connected");
    const requestId = randomUUID();
    const job = { protocol: PROTOCOL, requestId, projectId: projectId(projectRoot), projectRoot, operation, deadline: new Date(Date.now() + timeoutMs).toISOString(), input };
    const queue = this.queues.get(key) || [];
    queue.push(job);
    this.queues.set(key, queue);
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(`Godot ${operation} timed out`)); }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer, projectRoot, operation });
    });
  }
}
