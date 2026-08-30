import { verifySignedRecord } from "./crypto.mjs";

const ORIGIN = "https://api.arkheos.ai";
const ALLOWED = new Set([
  "/v1/catalog", "/v1/device/code", "/oauth/token", "/v1/trial",
  "/v1/billing/checkout", "/v1/billing/portal", "/v1/entitlement"
]);

function safeProduct(value) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(value || "")) throw new TypeError("Invalid product identity");
  return value;
}

function safeChannel(value = "stable") {
  if (value !== "stable") throw new TypeError("Only the stable channel is admitted");
  return value;
}

function safeVersion(value) {
  if (value !== undefined && !/^[0-9]+(?:\.[0-9]+){2}(?:-[0-9A-Za-z.-]+)?$/u.test(value)) throw new TypeError("Invalid release version");
  return value;
}

export class ArkheosApi {
  constructor({ state, transport, trustedKeys = {}, now = () => new Date() } = {}) {
    if (!state) throw new TypeError("ArkheosApi requires state");
    this.state = state;
    this.transport = transport || this.#fetch.bind(this);
    this.trustedKeys = trustedKeys;
    this.now = now;
  }

  async #fetch({ method = "GET", path, body, token, binary = false }) {
    const allowedDynamic = /^\/v1\/products\/[a-z0-9][a-z0-9-]{0,63}\/releases\/stable(?:\/[0-9]+(?:\.[0-9]+){2}(?:-[0-9A-Za-z.-]+)?)?$/u.test(path) || /^\/v1\/artifacts\/[a-f0-9]{64}$/u.test(path);
    if (!ALLOWED.has(path) && !allowedDynamic) throw new Error("API path is not admitted");
    const headers = { accept: binary ? "application/octet-stream" : "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "error" });
    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      try { code = (await response.json()).code || code; } catch {}
      const error = new Error(`ArkheOS service rejected the request: ${code}`);
      error.code = code;
      error.status = response.status;
      throw error;
    }
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }

  async catalog() {
    const catalog = await this.transport({ method: "GET", path: "/v1/catalog" });
    const verification = verifySignedRecord(catalog, this.trustedKeys, "arkheos.catalog/v1", this.now());
    await this.state.cacheCatalog(catalog);
    return { catalog, verification };
  }

  async authorizationBegin() {
    const identity = await this.state.identity();
    const result = await this.transport({ method: "POST", path: "/v1/device/code", body: { installationId: identity.installationId } });
    if (!result.device_code || !result.user_code || !result.verification_uri) throw new Error("Malformed device authorization response");
    await this.state.writeAuth({ pending: { deviceCode: result.device_code, expiresAt: new Date(this.now().getTime() + Number(result.expires_in || 600) * 1000).toISOString(), interval: Math.max(2, Number(result.interval || 5)) } });
    return { status: "pending", userCode: result.user_code, verificationUri: result.verification_uri, verificationUriComplete: result.verification_uri_complete || null, expiresIn: Number(result.expires_in || 600), interval: Math.max(2, Number(result.interval || 5)) };
  }

  async authorizationPoll() {
    const auth = await this.state.readAuth();
    if (!auth?.pending) return { status: auth?.tokens ? "authorized" : "not-started" };
    if (Date.parse(auth.pending.expiresAt) <= this.now().getTime()) { await this.state.clearAuth(); return { status: "expired" }; }
    try {
      const result = await this.transport({ method: "POST", path: "/oauth/token", body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: auth.pending.deviceCode } });
      if (!result.access_token || !result.refresh_token) throw new Error("Malformed token response");
      await this.state.writeAuth({ tokens: { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: new Date(this.now().getTime() + Number(result.expires_in || 900) * 1000).toISOString(), family: result.refresh_family || null } });
      return { status: "authorized", expiresIn: Number(result.expires_in || 900) };
    } catch (error) {
      if (["authorization_pending", "slow_down"].includes(error.code)) return { status: "pending", retryAfter: auth.pending.interval + (error.code === "slow_down" ? 5 : 0) };
      throw error;
    }
  }

  async #accessToken() {
    const auth = await this.state.readAuth();
    if (!auth?.tokens) return null;
    if (Date.parse(auth.tokens.expiresAt) > this.now().getTime() + 30000) return auth.tokens.accessToken;
    const result = await this.transport({ method: "POST", path: "/oauth/token", body: { grant_type: "refresh_token", refresh_token: auth.tokens.refreshToken } });
    if (!result.access_token || !result.refresh_token) throw new Error("Malformed refresh response");
    await this.state.writeAuth({ tokens: { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: new Date(this.now().getTime() + Number(result.expires_in || 900) * 1000).toISOString(), family: result.refresh_family || auth.tokens.family || null } });
    return result.access_token;
  }

  async accountStatus() {
    const token = await this.#accessToken();
    if (!token) return { authorized: false, entitlement: { schema: "arkheos.entitlement/v1", mode: "recovery", mutating: false, preserved: ["inspect", "export", "verify", "recover", "rollback", "remove", "undo", "receipt"], evaluatedAt: this.now().toISOString() } };
    return { authorized: true, entitlement: await this.transport({ method: "GET", path: "/v1/entitlement", token }) };
  }

  async activateTrial() {
    const token = await this.#accessToken();
    if (!token) throw new Error("Authorization required");
    return this.transport({ method: "POST", path: "/v1/trial", token, body: {} });
  }

  async checkout(plan) {
    if (!new Set(["monthly", "annual"]).has(plan)) throw new TypeError("Plan must be monthly or annual");
    const token = await this.#accessToken();
    if (!token) throw new Error("Authorization required");
    const identity = await this.state.identity();
    return this.transport({ method: "POST", path: "/v1/billing/checkout", token, body: { plan, installationId: identity.installationId } });
  }

  async portal() {
    const token = await this.#accessToken();
    if (!token) throw new Error("Authorization required");
    return this.transport({ method: "POST", path: "/v1/billing/portal", token, body: {} });
  }

  async release(product, channel = "stable", version) {
    product = safeProduct(product); channel = safeChannel(channel); version = safeVersion(version);
    const token = await this.#accessToken();
    if (!token) throw new Error("Authorization required");
    const release = await this.transport({ method: "GET", path: `/v1/products/${product}/releases/${channel}${version === undefined ? "" : `/${version}`}`, token });
    const verification = verifySignedRecord(release, this.trustedKeys, "arkheos.release/v1", this.now());
    return { release, verification };
  }

  async artifact(descriptor) {
    const token = await this.#accessToken();
    if (!token) throw new Error("Authorization required");
    return this.transport({ method: "GET", path: `/v1/artifacts/${descriptor.sha256}`, token, binary: true });
  }

  async signOut() {
    const auth = await this.state.readAuth();
    let serverRevoked = false;
    try {
      if (auth?.tokens?.refreshToken) {
        const result = await this.transport({ method: "POST", path: "/oauth/token", body: { grant_type: "urn:arkheos:params:oauth:grant-type:revoke", refresh_token: auth.tokens.refreshToken } });
        serverRevoked = result?.revoked === true;
      }
    } finally {
      await this.state.clearAuth();
    }
    return { signedOut: true, serverRevoked };
  }
}

export { ORIGIN };
