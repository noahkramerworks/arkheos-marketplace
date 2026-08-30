import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { canonicalJson, operationId, sha256, slug } from "./canonical.mjs";
import { protectJson, unprotectJson } from "./dpapi.mjs";

function defaultRoot() {
  const codex = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(homedir(), ".codex");
  return path.join(codex, "state", "plugins", "arkheos", "v1");
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, file);
  await chmod(file, 0o600).catch(() => {});
}

export class ArkheosState {
  constructor({ root = defaultRoot(), dpapi } = {}) {
    this.root = path.resolve(root);
    this.dpapi = dpapi;
  }

  target(...parts) {
    const target = path.resolve(this.root, ...parts);
    const boundary = this.root + path.sep;
    if (target !== this.root && !target.startsWith(boundary)) throw new Error("State path escapes ArkheOS root");
    return target;
  }

  async initialize() {
    for (const directory of ["artifacts", "marketplaces", "plans", "receipts", "exports"]) await mkdir(this.target(directory), { recursive: true, mode: 0o700 });
    const identityFile = this.target("identity.json");
    let identity = await readJson(identityFile);
    if (!identity) {
      identity = { schema: "arkheos.identity/v1", installationId: operationId("installation"), createdAt: new Date().toISOString() };
      await writeJsonAtomic(identityFile, identity);
    }
    const installations = await readJson(this.target("installations.json"));
    if (!installations) await writeJsonAtomic(this.target("installations.json"), { schema: "arkheos.installations/v1", products: {} });
    return identity;
  }

  async identity() { await this.initialize(); return readJson(this.target("identity.json")); }
  async installations() { await this.initialize(); return readJson(this.target("installations.json")); }
  async writeInstallations(value) { await writeJsonAtomic(this.target("installations.json"), value); }
  async preStateDigest() { return sha256(await this.installations()); }

  async writeAuth(value) { await writeJsonAtomic(this.target("auth.json"), protectJson(value, this.dpapi)); }
  async readAuth() { const value = await readJson(this.target("auth.json")); return value ? unprotectJson(value, this.dpapi) : null; }
  async clearAuth() { await rm(this.target("auth.json"), { force: true }); }

  async cacheCatalog(catalog) { await writeJsonAtomic(this.target("catalog.json"), catalog); }
  async cachedCatalog() { return readJson(this.target("catalog.json")); }

  async writePlan(plan) { await writeJsonAtomic(this.target("plans", `${plan.id}.json`), plan); return plan; }
  async readPlan(id) { return readJson(this.target("plans", `${slug(id, "plan id")}.json`)); }
  async consumePlan(id, expectedDigest, now = new Date()) {
    const plan = await this.readPlan(id);
    if (!plan || plan.used) throw new Error("Plan is missing or already used");
    if (sha256(plan) !== expectedDigest) throw new Error("Plan digest mismatch");
    if (Date.parse(plan.expiresAt) <= now.getTime()) throw new Error("Plan expired");
    const current = await this.preStateDigest();
    if (current !== plan.preStateDigest) throw new Error("Local installation state changed");
    const used = { ...plan, used: true, usedAt: now.toISOString() };
    await this.writePlan(used);
    return plan;
  }

  async writeReceipt(input) {
    const createdAt = input.createdAt || new Date().toISOString();
    const unsigned = { schema: "arkheos.receipt/v1", ...input, createdAt };
    const receipt = { ...unsigned, id: sha256(unsigned) };
    const file = this.target("receipts", `${receipt.id}.json`);
    const existing = await readJson(file);
    if (existing && canonicalJson(existing) !== canonicalJson(receipt)) throw new Error("Receipt identity collision");
    if (!existing) await writeJsonAtomic(file, receipt);
    return receipt;
  }

  async receipt(id) { return readJson(this.target("receipts", `${String(id)}.json`)); }
  async receiptList() { try { return (await readdir(this.target("receipts"))).filter((name) => name.endsWith(".json")).sort(); } catch { return []; } }

  async safePurge() {
    const installations = await this.installations();
    if (Object.keys(installations.products || {}).length) throw new Error("Managed products remain installed");
    const resolved = path.resolve(this.root);
    if (!resolved.toLowerCase().includes(`${path.sep}state${path.sep}plugins${path.sep}arkheos${path.sep}v1`.toLowerCase())) throw new Error("Refusing unsafe state purge target");
    await rm(resolved, { recursive: true, force: true });
    return { purged: true, root: resolved };
  }
}

export { readJson, writeJsonAtomic, defaultRoot };
