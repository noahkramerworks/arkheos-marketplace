import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileSha } from "../mcp/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blender = process.env.BLENDER_ENGINE_PATH || "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe";
const base = mkdtempSync(path.join(os.tmpdir(), "blender-live-canary-"));
const project = path.join(base, "fixture.blend");
const initial = path.join(base, "initial.blend");
const driverResult = path.join(base, "driver-animation.json");

function run(args, timeout = 240000, cwd = root) {
  const result = spawnSync(blender, args, { cwd, encoding: "utf8", timeout, windowsHide: true });
  if (result.status !== 0 || /Traceback/.test(`${result.stdout || ""}${result.stderr || ""}`)) throw new Error(result.stderr || result.stdout || `Blender exited ${result.status}`);
  return result;
}
function parseGlb(file) {
  const bytes = readFileSync(file);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error("Invalid GLB header");
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset); const type = bytes.readUInt32LE(offset + 4); offset += 8;
    if (type === 0x4e4f534a) return JSON.parse(bytes.subarray(offset, offset + length).toString("utf8").replace(/[\u0000\u0020]+$/u, ""));
    offset += length;
  }
  throw new Error("GLB JSON chunk is missing");
}

try {
  const version = run(["--version"], 30000);
  if (version.stdout.split(/\r?\n/)[0] !== "Blender 5.2.1 LTS") throw new Error("Blender 5.2.1 LTS is required");
  run(["--command", "extension", "validate"], 60000, path.join(root, "blender-extension"));
  const extensionArchive = path.join(base, "blender_bridge-0.3.0.zip");
  run(["--command", "extension", "build", "--output-filepath", extensionArchive], 120000, path.join(root, "blender-extension"));
  if (!existsSync(extensionArchive) || fileSha(extensionArchive).length !== 64) throw new Error("Extension build was not independently hashed");

  run(["--background", "--factory-startup", "--python-expr", `import bpy; bpy.ops.wm.save_as_mainfile(filepath=r'${project.replaceAll("\\", "\\\\")}', check_existing=False)`], 120000);
  copyFileSync(project, initial);
  const initialSha = fileSha(initial);
  run([project, "--background", "--python", path.join(root, "tests", "live_canary_driver.py"), "--", path.join(root, "blender-extension", "bridge_runtime.py"), driverResult], 180000);
  const mutatedSha = fileSha(project);
  if (mutatedSha === initialSha) throw new Error("Native mutation did not change blend bytes");
  const directAnimation = JSON.parse(readFileSync(driverResult, "utf8"));

  const independentResult = path.join(base, "independent.json");
  run([project, "--background", "--python", path.join(root, "blender-extension", "inspect_driver.py"), "--", independentResult], 120000);
  const independent = JSON.parse(readFileSync(independentResult, "utf8"));
  const reopenedAnimation = independent.animation.find((item) => item.name === "CanaryPoseAction");
  if (!reopenedAnimation || reopenedAnimation.semanticDigest !== directAnimation.semanticDigest || reopenedAnimation.channelCount !== 10 || reopenedAnimation.keyCount !== 20) throw new Error("Independent pose-action digest mismatch");
  if (independent.addonVersion !== "0.3.0") throw new Error("Independent adapter version mismatch");

  const outputs = path.join(base, "outputs"); mkdirSync(outputs);
  const jobs = [
    { operation: "viewport", stagingPath: path.join(outputs, "viewport.png"), width: 320, height: 240 },
    { operation: "render", stagingPath: path.join(outputs, "render.png") },
    { operation: "export", format: "glb", stagingPath: path.join(outputs, "scene-full.glb"), options: { animation: true, materials: true, extras: true } },
    { operation: "export", format: "glb", stagingPath: path.join(outputs, "scene-stripped.glb"), options: { animation: false, materials: false, extras: false } },
    { operation: "export", format: "usd", stagingPath: path.join(outputs, "scene.usd"), options: {} },
  ];
  const evidence = [];
  for (const [index, request] of jobs.entries()) {
    const requestFile = path.join(base, `request-${index}.json`); const resultFile = path.join(base, `result-${index}.json`);
    writeFileSync(requestFile, JSON.stringify({ projectFile: project, ...request }));
    run([project, "--background", "--python", path.join(root, "blender-extension", "batch_driver.py"), "--", requestFile, resultFile]);
    if (!existsSync(resultFile)) throw new Error(`Native ${request.operation} result is missing`);
    const item = JSON.parse(readFileSync(resultFile, "utf8"));
    if (item.status !== "completed" || fileSha(item.path) !== item.sha256) throw new Error(`Native ${request.operation} readback failed`);
    evidence.push(item);
  }

  const full = parseGlb(path.join(outputs, "scene-full.glb"));
  const stripped = parseGlb(path.join(outputs, "scene-stripped.glb"));
  if (!(full.animations || []).some((item) => item.name === "CanaryPoseAction") || (full.animations || []).flatMap((item) => item.channels || []).length < 3) throw new Error("GLB animation option did not preserve pose channels");
  if (!(full.materials || []).length) throw new Error("GLB materials option did not preserve materials");
  if (!(full.nodes || []).some((item) => item.extras?.semantic_tag === "pose-canary")) throw new Error("GLB extras option did not preserve semantic extras");
  if ((stripped.animations || []).length || (stripped.materials || []).length || (stripped.nodes || []).some((item) => item.extras)) throw new Error("Disabled GLB animation/material/extras options leaked data");

  copyFileSync(initial, project);
  if (fileSha(project) !== initialSha) throw new Error("Exact rollback failed");
  const restoredResult = path.join(base, "restored.json");
  run([project, "--background", "--python", path.join(root, "blender-extension", "inspect_driver.py"), "--", restoredResult], 120000);
  const restored = JSON.parse(readFileSync(restoredResult, "utf8"));
  if (restored.animation.some((item) => item.name === "CanaryPoseAction")) throw new Error("Restored native state retained the canary action");

  console.log(JSON.stringify({
    schema: "blender-bridge/live-canary/v1",
    status: "passed",
    blender,
    extensionArchiveSha256: fileSha(extensionArchive),
    initialSha256: initialSha,
    mutatedSha256: mutatedSha,
    poseAction: reopenedAnimation,
    glb: { fullAnimations: full.animations?.length || 0, fullMaterials: full.materials?.length || 0, fullExtras: true, strippedAnimations: stripped.animations?.length || 0, strippedMaterials: stripped.materials?.length || 0, strippedExtras: false },
    exactRollback: true,
    independentReadback: true,
    artifacts: evidence.map(({ path: file, size, sha256, nativeReadback }) => ({ file, size, sha256, nativeReadback })),
  }, null, 2));
} finally {
  rmSync(base, { recursive: true, force: true });
}
