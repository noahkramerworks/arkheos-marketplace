import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileSha } from "../mcp/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blender = process.env.BLENDER_ENGINE_PATH || "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe";
const driver = path.join(root, "tests", "api_admission_driver.py");
const runtime = path.join(root, "blender-extension", "bridge_runtime.py");
const base = mkdtempSync(path.join(os.tmpdir(), "blender-api-admission-"));
const project = path.join(base, "fixture.blend");
const baseline = path.join(base, "baseline.blend");

function digest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}
function run(mode, resultName, factory = false) {
  const resultFile = path.join(base, resultName);
  const args = [...(factory ? ["--factory-startup"] : [project]), "--background", "--python", driver, "--", mode, project, resultFile, runtime];
  const result = spawnSync(blender, args, { encoding: "utf8", timeout: 120000, windowsHide: true });
  if (result.status !== 0 || /Traceback/.test((result.stdout || "") + (result.stderr || "")) || !existsSync(resultFile)) throw new Error(result.stderr || result.stdout || "Blender admission probe failed");
  return JSON.parse(readFileSync(resultFile, "utf8"));
}

try {
  const version = spawnSync(blender, ["--version"], { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (version.status !== 0 || version.stdout.split(/\r?\n/)[0] !== "Blender 5.2.1 LTS") throw new Error("Blender 5.2.1 LTS is required");
  const created = run("baseline", "baseline.json", true);
  copyFileSync(project, baseline);
  const preSha256 = fileSha(project);
  const written = run("mutate", "written.json");
  const mutatedSha256 = fileSha(project);
  const writtenPose = written.animation.find((item) => item.name === "APIAdmissionPose");
  if (mutatedSha256 === preSha256 || !written.objects.includes("APIAdmissionObject") || !writtenPose?.semanticDigest || written.dirty) throw new Error("Typed bpy write did not persist");
  const observed = run("inspect", "observed.json");
  const observedPose = observed.animation.find((item) => item.name === "APIAdmissionPose");
  if (!observed.objects.includes("APIAdmissionObject") || !observed.blenderVersion.startsWith("5.2.1") || observedPose?.semanticDigest !== writtenPose.semanticDigest) throw new Error("Independent bpy readback failed");
  copyFileSync(baseline, project);
  const restoredSha256 = fileSha(project);
  if (restoredSha256 !== preSha256) throw new Error("Exact byte restoration failed");
  const restored = run("inspect", "restored.json");
  if (restored.objects.includes("APIAdmissionObject") || !restored.objects.includes("BaselineObject") || restored.animation.some((item) => item.name === "APIAdmissionPose")) throw new Error("Restored native state differs from baseline");
  console.log(JSON.stringify({
    schema: "blender-bridge/api-admission/v1",
    status: "admitted",
    application: "Blender 5.2.1 LTS",
    contractArtifact: blender,
    typedReads: ["inspect-scene-state", "inspect-dependency-graph", "inspect-animation-state", "inspect-render-state"],
    typedWrites: ["apply-scene-transaction", "write-pose-action", "save-project", "export-artifact"],
    readProbe: { capability: "inspect-scene-state", receiptDigest: digest(created), observationDigest: digest(observed) },
    writeProbe: { capability: "write-pose-action", receiptDigest: digest(written), observationDigest: digest({ mutatedSha256, objects: observed.objects, semanticDigest: observedPose.semanticDigest }) },
    independentObservationDigest: digest(observed),
    exactRollback: { preSha256, restoredSha256 },
  }, null, 2));
} finally {
  rmSync(base, { recursive: true, force: true });
}
