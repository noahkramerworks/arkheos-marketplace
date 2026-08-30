import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { operationId, sha256, slug } from "./canonical.mjs";
import { validateArchive, verifyArtifact } from "./crypto.mjs";

function localPlatform() {
  return process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
}

function codexExecutable(platform = process.platform) {
  return platform === "win32" ? "codex.exe" : "codex";
}

function defaultCli() {
  const executable = codexExecutable();
  const run = (args) => {
    const output = execFileSync(executable, args, { encoding: "utf8", windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    try { return JSON.parse(output); } catch { return { raw: output.trim() }; }
  };
  return {
    marketplaceAdd: (root) => run(["plugin", "marketplace", "add", root, "--json"]),
    pluginAdd: (product) => run(["plugin", "add", `${product}@arkheos-products`, "--json"]),
    pluginRemove: (product) => run(["plugin", "remove", `${product}@arkheos-products`, "--json"])
  };
}

async function materialize(root, archive) {
  for (const file of archive.files) {
    const target = path.resolve(root, file.path);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Archive target escaped staging root");
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, file.content, { mode: 0o600, flag: "wx" });
  }
  const registry = JSON.parse(await readFile(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
  if (registry.name !== "arkheos-products" || !Array.isArray(registry.plugins) || registry.plugins.length !== 1 || registry.plugins[0]?.name !== archive.product) throw new Error("Archive marketplace identity mismatch");
  return registry;
}

export { codexExecutable };

export class ArkheosOperations {
  constructor({ state, api, cli = defaultCli(), now = () => new Date(), platform = localPlatform() } = {}) {
    if (!state || !api) throw new TypeError("ArkheosOperations requires state and API");
    this.state = state; this.api = api; this.cli = cli; this.now = now; this.platform = platform;
  }

  async prepare({ kind, product, version, channel = "stable" }) {
    product = slug(product, "product");
    if (!new Set(["install", "update"]).has(kind)) throw new TypeError("Operation kind must be install or update");
    const current = await this.state.installations();
    if (kind === "install" && current.products[product]) throw new Error("Product is already installed; use update");
    if (kind === "update" && !current.products[product]) throw new Error("Product is not installed");
    const account = await this.api.accountStatus();
    if (!account.authorized || !account.entitlement?.mutating) throw new Error("Trial, paid, or grace membership is required");
    const { release, verification } = await this.api.release(product, channel, version);
    if (version && release.version !== version) throw new Error("Requested version is not the signed release version");
    const artifact = release.artifacts.find((entry) => entry.platform === this.platform);
    if (!artifact) throw new Error(`No signed artifact for ${this.platform}`);
    const createdAt = this.now();
    const plan = {
      schema: "arkheos.operation-plan/v1",
      id: operationId(kind), kind, product, targetVersion: release.version,
      releaseDigest: verification.digest, release, artifact, platform: this.platform,
      preStateDigest: await this.state.preStateDigest(),
      current: current.products[product] || null,
      intended: { marketplace: "arkheos-products", plugin: `${product}@arkheos-products`, version: release.version },
      rollback: current.products[product] ? { version: current.products[product].version, receipt: current.products[product].receipt } : { removeInstalledProduct: true },
      createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime() + 15 * 60 * 1000).toISOString(), used: false
    };
    await this.state.writePlan(plan);
    return { plan, digest: sha256(plan) };
  }

  async execute({ planId, expectedDigest, confirm }) {
    if (confirm !== true) throw new Error("Execution confirmation is required");
    const plan = await this.state.consumePlan(planId, expectedDigest, this.now());
    const stages = [{ stage: "requested", ok: true, plan: plan.id }];
    const active = this.state.target("marketplaces", "arkheos-products");
    const staging = this.state.target("marketplaces", `.staging-${plan.id}`);
    const backup = this.state.target("marketplaces", `.backup-${plan.id}`);
    let movedPrior = false;
    let activated = false;
    let installAttempted = false;
    try {
      const bytes = await this.api.artifact(plan.artifact);
      const artifact = verifyArtifact(bytes, plan.artifact);
      stages.push({ stage: "artifact", ok: true, ...artifact });
      const archive = validateArchive(bytes, { product: plan.product });
      if (archive.version !== plan.targetVersion) throw new Error("Archive version differs from release");
      stages.push({ stage: "archive", ok: true, files: archive.files.length });
      await rm(staging, { recursive: true, force: true });
      await mkdir(staging, { recursive: true, mode: 0o700 });
      await materialize(staging, archive);
      try { await rename(active, backup); movedPrior = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
      await rename(staging, active);
      activated = true;
      stages.push({ stage: "marketplace-materialized", ok: true, root: active });
      const marketplace = await this.cli.marketplaceAdd(active);
      stages.push({ stage: "marketplace-registered", ok: true, response: marketplace });
      installAttempted = true;
      const installed = await this.cli.pluginAdd(plan.product);
      stages.push({ stage: "plugin-installed", ok: true, response: installed });
      const installations = await this.state.installations();
      const prior = installations.products[plan.product] || null;
      const receiptSeed = { operation: plan.kind, product: plan.product, version: plan.targetVersion, releaseDigest: plan.releaseDigest, artifact: plan.artifact.sha256, stages };
      const receipt = await this.state.writeReceipt({ ...receiptSeed, status: "verified" });
      installations.products[plan.product] = { product: plan.product, version: plan.targetVersion, releaseDigest: plan.releaseDigest, artifact: plan.artifact.sha256, archiveFileCount: archive.files.length, receipt: receipt.id, prior, installedAt: this.now().toISOString() };
      await this.state.writeInstallations(installations);
      await writeFile(this.state.target("artifacts", `${plan.artifact.sha256}.json`), bytes, { flag: "wx", mode: 0o600 }).catch((error) => { if (error.code !== "EEXIST") throw error; });
      if (movedPrior) await rm(backup, { recursive: true, force: true });
      return receipt;
    } catch (error) {
      stages.push({ stage: "failure", ok: false, code: error.code || "ARKHEOS_INSTALL_FAILED", message: error.message });
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      if (activated) await rm(active, { recursive: true, force: true }).catch(() => {});
      if (movedPrior) {
        await rename(backup, active).catch(() => {});
        try { stages.push({ stage: "rollback-marketplace", ok: true, response: await this.cli.marketplaceAdd(active) }); } catch (rollbackError) { stages.push({ stage: "rollback-marketplace", ok: false, message: rollbackError.message }); }
        if (installAttempted) {
          try { stages.push({ stage: "rollback-plugin", ok: true, response: await this.cli.pluginAdd(plan.product) }); } catch (rollbackError) { stages.push({ stage: "rollback-plugin", ok: false, message: rollbackError.message }); }
        }
      } else if (installAttempted) {
        try { stages.push({ stage: "rollback-plugin-remove", ok: true, response: await this.cli.pluginRemove(plan.product) }); } catch (rollbackError) { stages.push({ stage: "rollback-plugin-remove", ok: false, message: rollbackError.message }); }
      }
      const receipt = await this.state.writeReceipt({ operation: plan.kind, product: plan.product, version: plan.targetVersion, status: "failed", stages });
      error.receipt = receipt.id;
      throw error;
    }
  }

  async verify(product) {
    product = slug(product, "product");
    const installations = await this.state.installations();
    const record = installations.products[product];
    if (!record) throw new Error("Managed installation not found");
    const file = this.state.target("artifacts", `${record.artifact}.json`);
    const bytes = await readFile(file);
    const valid = sha256(bytes) === record.artifact;
    return { schema: "arkheos.installation-verification/v1", product, version: record.version, artifact: record.artifact, localArchiveValid: valid, installedCacheVerified: false, freshTaskDiscoveryVerified: false };
  }

  async export(product) {
    const verification = await this.verify(product);
    if (!verification.localArchiveValid) throw new Error("Local archive failed verification");
    const source = this.state.target("artifacts", `${verification.artifact}.json`);
    const destination = this.state.target("exports", `${verification.artifact}.json`);
    const bytes = await readFile(source);
    await writeFile(destination, bytes, { flag: "wx", mode: 0o600 }).catch((error) => { if (error.code !== "EEXIST") throw error; });
    return this.state.writeReceipt({ operation: "export", product: slug(product), status: "exported", stages: [{ stage: "verified", ok: true, artifact: verification.artifact }, { stage: "exported", ok: true, destination }] });
  }

  async remove(product) {
    product = slug(product, "product");
    const installations = await this.state.installations();
    if (!installations.products[product]) throw new Error("Managed installation not found");
    const response = await this.cli.pluginRemove(product);
    delete installations.products[product];
    await this.state.writeInstallations(installations);
    return this.state.writeReceipt({ operation: "remove", product, status: "removed", stages: [{ stage: "plugin-removed", ok: true, response }, { stage: "state-updated", ok: true }] });
  }

  async rollback(receiptId) {
    const receipt = await this.state.receipt(receiptId);
    if (!receipt || !new Set(["install", "update"]).has(receipt.operation)) throw new Error("Receipt is not rollback-eligible");
    const installations = await this.state.installations();
    const current = installations.products[receipt.product];
    if (!current || current.receipt !== receipt.id) throw new Error("Only the current product receipt can roll back");
    if (!current.prior) return this.remove(receipt.product);
    const prior = current.prior;
    const bytes = await readFile(this.state.target("artifacts", `${prior.artifact}.json`));
    verifyArtifact(bytes, { sha256: prior.artifact, length: bytes.length });
    const archive = validateArchive(bytes, { product: receipt.product });
    if (archive.version !== prior.version) throw new Error("Retained prior archive version mismatch");
    const active = this.state.target("marketplaces", "arkheos-products");
    const staging = this.state.target("marketplaces", `.rollback-${receipt.id}`);
    const backup = this.state.target("marketplaces", `.rollback-backup-${receipt.id}`);
    const stages = [{ stage: "requested", ok: true, sourceReceipt: receipt.id, from: current.version, to: prior.version }];
    let movedCurrent = false;
    let activated = false;
    try {
      await rm(staging, { recursive: true, force: true });
      await mkdir(staging, { recursive: true, mode: 0o700 });
      await materialize(staging, archive);
      await rename(active, backup); movedCurrent = true;
      await rename(staging, active); activated = true;
      stages.push({ stage: "marketplace-restored", ok: true, root: active });
      stages.push({ stage: "marketplace-registered", ok: true, response: await this.cli.marketplaceAdd(active) });
      stages.push({ stage: "plugin-restored", ok: true, response: await this.cli.pluginAdd(receipt.product) });
      const rollbackReceipt = await this.state.writeReceipt({ operation: "rollback", product: receipt.product, version: prior.version, status: "rolled-back", sourceReceipt: receipt.id, stages });
      installations.products[receipt.product] = { ...prior, receipt: rollbackReceipt.id, rolledBackFrom: current.version, restoredAt: this.now().toISOString() };
      await this.state.writeInstallations(installations);
      await rm(backup, { recursive: true, force: true });
      return rollbackReceipt;
    } catch (error) {
      stages.push({ stage: "failure", ok: false, code: error.code || "ARKHEOS_ROLLBACK_FAILED", message: error.message });
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      if (activated) await rm(active, { recursive: true, force: true }).catch(() => {});
      if (movedCurrent) {
        await rename(backup, active).catch(() => {});
        try { stages.push({ stage: "restore-current-marketplace", ok: true, response: await this.cli.marketplaceAdd(active) }); } catch (restoreError) { stages.push({ stage: "restore-current-marketplace", ok: false, message: restoreError.message }); }
        try { stages.push({ stage: "restore-current-plugin", ok: true, response: await this.cli.pluginAdd(receipt.product) }); } catch (restoreError) { stages.push({ stage: "restore-current-plugin", ok: false, message: restoreError.message }); }
      }
      const failed = await this.state.writeReceipt({ operation: "rollback", product: receipt.product, version: prior.version, status: "failed", sourceReceipt: receipt.id, stages });
      error.receipt = failed.id;
      throw error;
    }
  }
}
