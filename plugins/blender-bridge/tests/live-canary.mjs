import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileSha } from "../mcp/state.mjs";
import { installExtension, removeExtension } from "../mcp/installation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blender = process.env.BLENDER_ENGINE_PATH || "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe";
const base = mkdtempSync(path.join(os.tmpdir(), "blender-live-canary-")); const project = path.join(base, "fixture.blend"); const initial = path.join(base, "initial.blend");
const canaryState = path.join(base, "state");
const extension = installExtension({ enginePath: blender }, { stateRoot: canaryState });
const create = spawnSync(blender, ["--background", "--factory-startup", "--python-expr", `import bpy; bpy.ops.wm.save_as_mainfile(filepath=r'${project.replaceAll("\\", "\\\\")}', check_existing=False)`], { encoding: "utf8", timeout: 120000, windowsHide: true }); if (create.status !== 0) throw new Error(create.stderr || create.stdout);
copyFileSync(project, initial); const initialSha = fileSha(initial);
try {
  const apply = spawnSync(blender, [project, "--background", "--python", path.join(root, "tests", "live_canary_driver.py"), "--", path.join(root, "blender-extension", "bridge_runtime.py")], { encoding: "utf8", timeout: 180000, windowsHide: true }); if (apply.status !== 0 || /Traceback/.test(apply.stdout + apply.stderr)) throw new Error(apply.stderr || apply.stdout);
  const mutatedSha = fileSha(project); if (mutatedSha === initialSha) throw new Error("native mutation did not change blend bytes");
  const outputs = path.join(base, "outputs"); mkdirSync(outputs); const jobs = [{ operation: "viewport", stagingPath: path.join(outputs, "viewport.png"), width: 320, height: 240 }, { operation: "render", stagingPath: path.join(outputs, "render.png") }, { operation: "export", format: "glb", stagingPath: path.join(outputs, "scene.glb"), options: {} }, { operation: "export", format: "usd", stagingPath: path.join(outputs, "scene.usd"), options: {} }];
  const evidence = [];
  for (const [index, request] of jobs.entries()) { const requestFile = path.join(base, `request-${index}.json`); const resultFile = path.join(base, `result-${index}.json`); writeFileSync(requestFile, JSON.stringify({ projectFile: project, ...request })); const result = spawnSync(blender, [project, "--background", "--python", path.join(root, "blender-extension", "batch_driver.py"), "--", requestFile, resultFile], { encoding: "utf8", timeout: 240000, windowsHide: true }); if (result.status !== 0 || /Traceback/.test(result.stdout + result.stderr) || !existsSync(resultFile)) throw new Error(result.stderr || result.stdout); const item = JSON.parse(readFileSync(resultFile)); if (item.status !== "completed" || fileSha(item.path) !== item.sha256) throw new Error(`native ${request.operation} readback failed`); evidence.push(item); }
  copyFileSync(initial, project); if (fileSha(project) !== initialSha) throw new Error("exact rollback failed");
  console.log(JSON.stringify({ schema: "blender-bridge/live-canary/v1", status: "passed", blender, initialSha256: initialSha, mutatedSha256: mutatedSha, exactRollback: true, independentReadback: true, artifacts: evidence.map(({ path: file, size, sha256, nativeReadback }) => ({ file, size, sha256, nativeReadback })) }, null, 2));
} finally { removeExtension({ enginePath: blender }, { stateRoot: canaryState }); rmSync(base, { recursive: true, force: true }); }
