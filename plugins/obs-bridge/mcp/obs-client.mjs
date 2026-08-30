import { createHash, randomUUID } from "node:crypto";

function authResponse(password, salt, challenge) {
  const secret = createHash("sha256").update(`${password}${salt}`).digest("base64");
  return createHash("sha256").update(`${secret}${challenge}`).digest("base64");
}

function messageText(data) {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  return String(data);
}

export class ObsClient {
  constructor({ endpoint, password = "", timeoutMs = 8_000, WebSocketImpl = globalThis.WebSocket } = {}) {
    if (!WebSocketImpl) throw new Error("WebSocket implementation is unavailable");
    this.endpoint = endpoint;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.WebSocketImpl = WebSocketImpl;
    this.pendingOps = new Map();
    this.pendingRequests = new Map();
    this.socket = null;
    this.connected = false;
  }

  waitFor(map, key, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        map.delete(key);
        reject(new Error(`${label} timed out`));
      }, this.timeoutMs);
      map.set(key, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
  }

  failAll(error) {
    for (const map of [this.pendingOps, this.pendingRequests]) {
      for (const pending of map.values()) pending.reject(error);
      map.clear();
    }
  }

  async connect() {
    if (this.connected) return;
    const helloPromise = this.waitFor(this.pendingOps, 0, "OBS Hello");
    const socket = new this.WebSocketImpl(this.endpoint);
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      let payload;
      try {
        payload = JSON.parse(messageText(event.data));
      } catch {
        this.failAll(new Error("OBS returned malformed JSON"));
        return;
      }
      const opPending = this.pendingOps.get(payload.op);
      if (opPending) {
        this.pendingOps.delete(payload.op);
        opPending.resolve(payload.d || {});
      }
      if (payload.op === 7) {
        const requestId = payload.d?.requestId;
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          if (payload.d?.requestStatus?.result) pending.resolve(payload.d.responseData || {});
          else pending.reject(new Error(`OBS ${payload.d?.requestType || "request"} failed (${payload.d?.requestStatus?.code ?? "unknown"}): ${payload.d?.requestStatus?.comment || "no comment"}`));
        }
      }
    });
    socket.addEventListener("error", () => this.failAll(new Error("OBS WebSocket connection error")));
    socket.addEventListener("close", (event) => {
      this.connected = false;
      this.failAll(new Error(`OBS WebSocket closed (${event.code ?? "unknown"})`));
    });

    const hello = await helloPromise;
    const identify = { rpcVersion: 1, eventSubscriptions: 0 };
    if (hello.authentication) {
      if (!this.password) throw new Error("OBS WebSocket requires OBS_WEBSOCKET_PASSWORD");
      identify.authentication = authResponse(this.password, hello.authentication.salt, hello.authentication.challenge);
    }
    const identifiedPromise = this.waitFor(this.pendingOps, 2, "OBS Identified");
    socket.send(JSON.stringify({ op: 1, d: identify }));
    const identified = await identifiedPromise;
    this.connected = true;
    this.hello = hello;
    this.negotiatedRpcVersion = identified.negotiatedRpcVersion;
  }

  async call(requestType, requestData = undefined) {
    if (!this.connected || !this.socket) throw new Error("OBS client is not connected");
    const requestId = randomUUID();
    const promise = this.waitFor(this.pendingRequests, requestId, `OBS ${requestType}`);
    const data = { requestType, requestId };
    if (requestData !== undefined) data.requestData = requestData;
    this.socket.send(JSON.stringify({ op: 6, d: data }));
    return promise;
  }

  close() {
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }
}

export { authResponse };
