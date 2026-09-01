#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite, fileSha256, ownedFile } from "../../mcp/state.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "batch.py");
const command = process.env.FREECAD_CMD_EXE || "C:\\Program Files\\FreeCAD 1.1\\bin\\FreeCADCmd.exe";

export function runBatch(job, runtime) {
  if (!existsSync(command)) throw new Error("FreeCADCmd.exe is missing");
  if (!["step", "stl"].includes(job.format)) throw new Error("batch format is not admitted");
  const jobFile = ownedFile(runtime.stateRoot, "jobs", `${job.jobId}.json`);
  atomicWrite(jobFile, `${JSON.stringify(job, null, 2)}\n`);
  const output = execFileSync(command, [script], { encoding: "utf8", timeout: 180_000, windowsHide: true, env: { ...process.env, ARKHEOS_FREECAD_JOB: jobFile } });
  if (!existsSync(job.outputPath)) throw new Error(`FreeCAD batch output is missing: ${output.slice(-1000)}`);
  return { output: output.slice(-2000), sha256: fileSha256(job.outputPath) };
}
