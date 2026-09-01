#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { atomicWrite, ensureDir, fileSha256, ownedFile, readJson, stateRoot as defaultStateRoot } from "../mcp/state.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userProfile = process.env.USERPROFILE || "C:\\Users\\rizek";
const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, "AppData", "Local");
const kicadRoot = process.env.KICAD_ROOT || path.join(localAppData, "Programs", "KiCad", "10.0");
const bundledPython = path.join(kicadRoot, "bin", "python.exe");
const expectedPythonSha256 = "2930134f11de75eaa1827e7f05d2500ad94155f79bc489bcd7d597e247548d81";

export function preparePython(options = {}) {
  const stateRoot = options.stateRoot || defaultStateRoot();
  const vendorRoot = path.join(sourceRoot, "kicad-adapter", "vendor");
  const provenance = readJson(path.join(vendorRoot, "PROVENANCE.json"));
  if (!existsSync(bundledPython) || fileSha256(bundledPython) !== expectedPythonSha256) throw new Error("KiCad bundled Python identity drift");
  for (const item of provenance.files) {
    const wheel = path.join(vendorRoot, item.name);
    if (!existsSync(wheel) || fileSha256(wheel) !== item.sha256) throw new Error(`Vendored wheel identity drift: ${item.name}`);
  }
  const environmentRoot = ownedFile(stateRoot, "runtime", "python");
  const python = path.join(environmentRoot, "Scripts", "python.exe");
  if (!existsSync(python)) {
    ensureDir(path.dirname(environmentRoot));
    execFileSync(bundledPython, ["-m", "venv", environmentRoot], { encoding: "utf8", windowsHide: true, timeout: 120_000 });
    execFileSync(python, ["-m", "pip", "install", "--disable-pip-version-check", "--no-index", "--find-links", vendorRoot, "kicad-python==0.7.1"], { encoding: "utf8", windowsHide: true, timeout: 120_000 });
  }
  const observed = execFileSync(python, ["-c", "import importlib.metadata as m; import kipy; print(m.version('kicad-python'))"], { encoding: "utf8", windowsHide: true, timeout: 30_000, env: { ...process.env, PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1" } }).trim();
  if (observed !== "0.7.1") throw new Error(`kicad-python version drift: ${observed}`);
  const manifest = { schema: "kicad-bridge/python-runtime/v1", python, pythonSha256: fileSha256(python), basePython: bundledPython, basePythonSha256: expectedPythonSha256, kicadPython: observed, vendorProvenanceSha256: fileSha256(path.join(vendorRoot, "PROVENANCE.json")) };
  atomicWrite(ownedFile(stateRoot, "runtime", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.stdout.write(`${JSON.stringify(preparePython(), null, 2)}\n`);
