import { applyScenePlan, inspectObs, rollbackReceipt } from "../mcp/operations.mjs";
import { sha256, stableStringify } from "../mcp/state.mjs";

const sceneName = "Bridge 0.2.0 Native Canary";
const inputName = "Bridge 0.2.0 Native Canary Color";
const plan = {
  planId: "obs-bridge-0.2.0-native-canary",
  actions: [
    { type: "ensure_scene", sceneName },
    { type: "ensure_input", sceneName, inputName, inputKind: "color_source_v3", inputSettings: { color: 4278190335, width: 320, height: 240 }, sceneItemEnabled: true },
  ],
};

const applied = await applyScenePlan(plan);
if (applied.status !== "verified" || applied.pluginVersion !== "0.2.0") throw new Error("OBS native apply did not verify the release version");
const observed = await inspectObs();
const scene = observed.scenes.find((item) => item.sceneName === sceneName);
const input = observed.inputs.find((item) => item.inputName === inputName);
if (!scene || !input || input.inputKind !== "color_source_v3") throw new Error("OBS native readback did not verify the canary resources");
if (applied.versions.obsVersion !== "32.2.1" || applied.versions.obsWebSocketVersion !== "5.7.4" || applied.versions.rpcVersion !== 1) throw new Error("OBS native canary did not match the admitted application protocol version");
const rollback = await rollbackReceipt({ receiptId: applied.receiptId });
if (rollback.status !== "rolled-back" || rollback.rollback?.status !== "verified-restored") throw new Error("OBS native rollback did not verify restoration");
const restored = await inspectObs();
if (restored.scenes.some((item) => item.sceneName === sceneName) || restored.inputs.some((item) => item.inputName === inputName)) throw new Error("OBS native rollback left canary resources behind");
const restoredFingerprint = `sha256:${sha256(stableStringify({ scenes: restored.scenes, inputs: restored.inputs, videoSettings: restored.videoSettings }))}`;
if (restoredFingerprint !== applied.preStateFingerprint) throw new Error("OBS native rollback did not restore the exact observed pre-state");

console.log(JSON.stringify({
  schema: "obs-bridge/live-canary/v1",
  status: "passed",
  versions: applied.versions,
  receiptId: applied.receiptId,
  rollbackReceiptId: rollback.receiptId,
  preStateFingerprint: applied.preStateFingerprint,
  restoredStateFingerprint: restoredFingerprint,
  independentReadback: { scene, input },
  exactRollback: true,
}, null, 2));
