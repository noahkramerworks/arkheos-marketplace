import { ObsClient } from "./obs-client.mjs";
import { normalizeEndpoint, readReceipt, redact, resolveStateRoot, sha256, stableStringify, writeEnrollment, writeReceipt } from "./state.mjs";

const INSPECT_REQUESTS = ["GetVersion", "GetSceneList", "GetInputList", "GetInputKindList", "GetVideoSettings"];
const APPLY_REQUESTS = [...INSPECT_REQUESTS, "GetSceneItemList", "CreateScene", "CreateInput", "RemoveInput", "RemoveScene"];
const MAX_ITEMS = 500;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label} contains unknown field: ${key}`);
}

function name(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 160) throw new Error(`${label} must be a non-empty string of at most 160 characters`);
  return value.trim();
}

function endpointArgs(args) {
  object(args, "arguments");
  exactKeys(args, ["endpoint"], "arguments");
  return normalizeEndpoint(args.endpoint || process.env.OBS_WEBSOCKET_URL || "ws://127.0.0.1:4455");
}

function assertRequests(version, required) {
  const available = new Set(version.availableRequests || []);
  const missing = required.filter((request) => !available.has(request));
  if (missing.length) throw new Error(`OBS WebSocket is missing required requests: ${missing.join(", ")}`);
}

async function connect(endpoint, options = {}) {
  const clientFactory = options.clientFactory || ((config) => new ObsClient(config));
  const client = clientFactory({ endpoint, password: (options.env || process.env).OBS_WEBSOCKET_PASSWORD || "" });
  await client.connect();
  const version = await client.call("GetVersion");
  return { client, version };
}

function bounded(items) {
  return Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [];
}

async function observe(client, version) {
  const [sceneData, inputData, kindData, videoSettings] = await Promise.all([
    client.call("GetSceneList"),
    client.call("GetInputList"),
    client.call("GetInputKindList"),
    client.call("GetVideoSettings"),
  ]);
  return {
    version: {
      obsVersion: version.obsVersion,
      obsWebSocketVersion: version.obsWebSocketVersion,
      rpcVersion: version.rpcVersion,
      availableRequests: bounded(version.availableRequests).sort(),
    },
    scenes: bounded(sceneData.scenes).map(({ sceneName, sceneUuid, sceneIndex }) => ({ sceneName, sceneUuid, sceneIndex })),
    inputs: bounded(inputData.inputs).map(({ inputName, inputUuid, inputKind, unversionedInputKind }) => ({ inputName, inputUuid, inputKind, unversionedInputKind })),
    inputKinds: bounded(kindData.inputKinds).sort(),
    videoSettings: redact(videoSettings),
  };
}

function enrollment(endpoint, observation) {
  return {
    schema: "obs-bridge/enrollment/v1",
    endpoint,
    observedAt: new Date().toISOString(),
    obsVersion: observation.version.obsVersion,
    obsWebSocketVersion: observation.version.obsWebSocketVersion,
    rpcVersion: observation.version.rpcVersion,
  };
}

export async function inspectObs(args = {}, options = {}) {
  const endpoint = endpointArgs(args);
  const stateRoot = resolveStateRoot(options.env || process.env, options.stateRoot);
  const { client, version } = await connect(endpoint, options);
  try {
    assertRequests(version, INSPECT_REQUESTS);
    const observation = await observe(client, version);
    writeEnrollment(stateRoot, enrollment(endpoint, observation));
    return { schema: "obs-bridge/observation/v1", status: "observed", endpoint, observedAt: new Date().toISOString(), ...observation };
  } finally {
    client.close();
  }
}

function validatePlan(args) {
  object(args, "arguments");
  exactKeys(args, ["endpoint", "planId", "actions"], "arguments");
  const planId = name(args.planId, "planId");
  if (!Array.isArray(args.actions) || args.actions.length < 1 || args.actions.length > 50) throw new Error("actions must contain between 1 and 50 entries");
  const sceneNames = new Set();
  const inputNames = new Set();
  const actions = args.actions.map((raw, index) => {
    object(raw, `actions[${index}]`);
    if (raw.type === "ensure_scene") {
      exactKeys(raw, ["type", "sceneName"], `actions[${index}]`);
      const sceneName = name(raw.sceneName, `actions[${index}].sceneName`);
      if (sceneNames.has(sceneName)) throw new Error(`duplicate ensure_scene: ${sceneName}`);
      sceneNames.add(sceneName);
      return { type: "ensure_scene", sceneName };
    }
    if (raw.type === "ensure_input") {
      exactKeys(raw, ["type", "sceneName", "inputName", "inputKind", "inputSettings", "sceneItemEnabled"], `actions[${index}]`);
      const action = {
        type: "ensure_input",
        sceneName: name(raw.sceneName, `actions[${index}].sceneName`),
        inputName: name(raw.inputName, `actions[${index}].inputName`),
        inputKind: name(raw.inputKind, `actions[${index}].inputKind`),
        inputSettings: object(raw.inputSettings, `actions[${index}].inputSettings`),
        sceneItemEnabled: raw.sceneItemEnabled,
      };
      if (typeof action.sceneItemEnabled !== "boolean") throw new Error(`actions[${index}].sceneItemEnabled must be boolean`);
      if (inputNames.has(action.inputName)) throw new Error(`duplicate ensure_input: ${action.inputName}`);
      inputNames.add(action.inputName);
      return action;
    }
    throw new Error(`actions[${index}].type is unsupported`);
  });
  return { endpoint: normalizeEndpoint(args.endpoint || process.env.OBS_WEBSOCKET_URL || "ws://127.0.0.1:4455"), planId, actions };
}

async function sceneItems(client, sceneName) {
  const data = await client.call("GetSceneItemList", { sceneName });
  return bounded(data.sceneItems);
}

async function preflight(client, observation, plan) {
  const scenes = new Set(observation.scenes.map((item) => item.sceneName));
  const inputs = new Map(observation.inputs.map((item) => [item.inputName, item]));
  const kinds = new Set(observation.inputKinds);
  const plannedScenes = new Set(plan.actions.filter((action) => action.type === "ensure_scene").map((action) => action.sceneName));
  const sceneItemCache = new Map();
  const effects = [];
  for (const action of plan.actions) {
    if (action.type === "ensure_scene") {
      effects.push({ action, disposition: scenes.has(action.sceneName) ? "reuse" : "create" });
      continue;
    }
    if (!scenes.has(action.sceneName) && !plannedScenes.has(action.sceneName)) throw new Error(`ensure_input references missing scene: ${action.sceneName}`);
    if (!kinds.has(action.inputKind)) throw new Error(`unsupported OBS input kind: ${action.inputKind}`);
    const existing = inputs.get(action.inputName);
    if (!existing) {
      effects.push({ action, disposition: "create" });
      continue;
    }
    if (existing.inputKind !== action.inputKind && existing.unversionedInputKind !== action.inputKind) throw new Error(`existing input kind conflict: ${action.inputName}`);
    if (!scenes.has(action.sceneName)) throw new Error(`existing input cannot belong to a scene that does not yet exist: ${action.inputName}`);
    if (!sceneItemCache.has(action.sceneName)) sceneItemCache.set(action.sceneName, await sceneItems(client, action.sceneName));
    const item = sceneItemCache.get(action.sceneName).find((candidate) => candidate.sourceName === action.inputName);
    if (!item) throw new Error(`existing input is not owned by requested scene: ${action.inputName}`);
    effects.push({ action, disposition: "reuse" });
  }
  return effects;
}

async function verifyResource(client, resource) {
  if (resource.type === "scene") {
    const data = await client.call("GetSceneList");
    return data.scenes.some((scene) => scene.sceneName === resource.sceneName);
  }
  const inputs = await client.call("GetInputList");
  const inputPresent = inputs.inputs.some((input) => input.inputName === resource.inputName && (input.inputKind === resource.inputKind || input.unversionedInputKind === resource.inputKind));
  if (!inputPresent) return false;
  try {
    const items = await sceneItems(client, resource.sceneName);
    return items.some((item) => item.sourceName === resource.inputName);
  } catch {
    return true;
  }
}

async function verifyAbsent(client, resource, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!await verifyResource(client, resource)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function rollbackCreated(client, created) {
  const steps = [];
  let uncertain = false;
  for (const resource of [...created].reverse()) {
    try {
      if (resource.type === "input") await client.call("RemoveInput", { inputName: resource.inputName });
      else await client.call("RemoveScene", { sceneName: resource.sceneName });
      steps.push({ resource, status: "remove-requested" });
    } catch (error) {
      steps.push({ resource, status: "failed", error: error.message });
      uncertain = true;
    }
  }
  for (const step of steps.filter((item) => item.status === "remove-requested")) {
    const absent = await verifyAbsent(client, step.resource);
    step.status = absent ? "removed" : "readback-mismatch";
    if (!absent) uncertain = true;
  }
  return { status: uncertain ? "manual-recovery-required" : "rolled-back", steps };
}

function receiptBody({ plan, endpoint, observation, preStateFingerprint, created, reused, effects, status, classification, rollback = null, error = null }) {
  return {
    schema: "obs-bridge/receipt/v1",
    pluginVersion: "0.1.2",
    planId: plan.planId,
    status,
    classification,
    createdAt: new Date().toISOString(),
    endpoint,
    versions: observation.version,
    input: redact({ actions: plan.actions }),
    preStateFingerprint,
    effects,
    created,
    reused,
    rollback,
    error: error ? { message: error.message } : null,
  };
}

export async function applyScenePlan(args, options = {}) {
  const plan = validatePlan(args);
  const stateRoot = resolveStateRoot(options.env || process.env, options.stateRoot);
  const { client, version } = await connect(plan.endpoint, options);
  const created = [];
  const reused = [];
  const effectLog = [];
  let observation;
  let preStateFingerprint;
  try {
    assertRequests(version, APPLY_REQUESTS);
    observation = await observe(client, version);
    writeEnrollment(stateRoot, enrollment(plan.endpoint, observation));
    preStateFingerprint = `sha256:${sha256(stableStringify({ scenes: observation.scenes, inputs: observation.inputs, videoSettings: observation.videoSettings }))}`;
    const effects = await preflight(client, observation, plan);
    for (const effect of effects) {
      const action = effect.action;
      if (effect.disposition === "reuse") {
        const resource = action.type === "ensure_scene"
          ? { type: "scene", sceneName: action.sceneName, createdByBridge: false }
          : { type: "input", sceneName: action.sceneName, inputName: action.inputName, inputKind: action.inputKind, createdByBridge: false };
        if (!await verifyResource(client, resource)) throw new Error(`reuse readback failed: ${action.type}`);
        reused.push(resource);
        effectLog.push({ action: action.type, status: "reused", resource });
        continue;
      }
      if (action.type === "ensure_scene") {
        await client.call("CreateScene", { sceneName: action.sceneName });
        const resource = { type: "scene", sceneName: action.sceneName, createdByBridge: true };
        created.push(resource);
        if (!await verifyResource(client, resource)) throw new Error(`scene readback failed: ${action.sceneName}`);
        effectLog.push({ action: action.type, status: "created-and-verified", resource });
      } else {
        await client.call("CreateInput", {
          sceneName: action.sceneName,
          inputName: action.inputName,
          inputKind: action.inputKind,
          inputSettings: action.inputSettings,
          sceneItemEnabled: action.sceneItemEnabled,
        });
        const resource = { type: "input", sceneName: action.sceneName, inputName: action.inputName, inputKind: action.inputKind, createdByBridge: true };
        created.push(resource);
        if (!await verifyResource(client, resource)) throw new Error(`input readback failed: ${action.inputName}`);
        effectLog.push({ action: action.type, status: "created-and-verified", resource });
      }
    }
    const body = receiptBody({ plan, endpoint: plan.endpoint, observation, preStateFingerprint, created, reused, effects: effectLog, status: "verified", classification: "outcome-verified" });
    return writeReceipt(stateRoot, body).receipt;
  } catch (error) {
    const rollback = created.length ? await rollbackCreated(client, created) : { status: "not-required", steps: [] };
    const safeObservation = observation || { version: { obsVersion: version.obsVersion, obsWebSocketVersion: version.obsWebSocketVersion, rpcVersion: version.rpcVersion } };
    const body = receiptBody({
      plan,
      endpoint: plan.endpoint,
      observation: safeObservation,
      preStateFingerprint: preStateFingerprint || null,
      created,
      reused,
      effects: effectLog,
      status: rollback.status === "manual-recovery-required" ? "manual-recovery-required" : "rolled-back",
      classification: "plan-failed",
      rollback,
      error,
    });
    return writeReceipt(stateRoot, body).receipt;
  } finally {
    client.close();
  }
}

async function currentResource(client, resource) {
  if (resource.type === "scene") {
    const scenes = await client.call("GetSceneList");
    return scenes.scenes.find((scene) => scene.sceneName === resource.sceneName) || null;
  }
  const inputs = await client.call("GetInputList");
  return inputs.inputs.find((input) => input.inputName === resource.inputName) || null;
}

export async function rollbackReceipt(args, options = {}) {
  object(args, "arguments");
  exactKeys(args, ["endpoint", "receiptId"], "arguments");
  const endpoint = normalizeEndpoint(args.endpoint || process.env.OBS_WEBSOCKET_URL || "ws://127.0.0.1:4455");
  const stateRoot = resolveStateRoot(options.env || process.env, options.stateRoot);
  const { receipt: source } = readReceipt(stateRoot, args.receiptId);
  if (source.schema !== "obs-bridge/receipt/v1") throw new Error("Unsupported receipt schema");
  if (source.status !== "verified") throw new Error(`Receipt is not rollback-eligible: ${source.status}`);
  const { client, version } = await connect(endpoint, options);
  try {
    assertRequests(version, ["GetVersion", "GetSceneList", "GetInputList", "GetSceneItemList", "RemoveInput", "RemoveScene"]);
    const createdInputs = new Set(source.created.filter((item) => item.type === "input").map((item) => item.inputName));
    const steps = [];
    let uncertain = false;
    for (const resource of [...source.created].reverse()) {
      const current = await currentResource(client, resource);
      if (!current) {
        steps.push({ resource, status: "already-absent" });
        continue;
      }
      if (resource.type === "input") {
        const currentKind = current.inputKind || current.unversionedInputKind;
        if (currentKind !== resource.inputKind && current.unversionedInputKind !== resource.inputKind) {
          steps.push({ resource, status: "stale-kind-conflict" });
          uncertain = true;
          continue;
        }
        await client.call("RemoveInput", { inputName: resource.inputName });
      } else {
        const items = await sceneItems(client, resource.sceneName);
        const foreign = items.filter((item) => !createdInputs.has(item.sourceName));
        if (foreign.length) {
          steps.push({ resource, status: "stale-scene-has-foreign-items", foreignSources: foreign.map((item) => item.sourceName) });
          uncertain = true;
          continue;
        }
        await client.call("RemoveScene", { sceneName: resource.sceneName });
      }
      steps.push({ resource, status: "remove-requested" });
    }
    for (const step of steps.filter((item) => item.status === "remove-requested")) {
      const absent = await verifyAbsent(client, step.resource);
      step.status = absent ? "removed" : "readback-mismatch";
      if (!absent) uncertain = true;
    }
    const rollbackBody = {
      schema: "obs-bridge/receipt/v1",
      pluginVersion: "0.1.2",
      planId: `rollback:${source.receiptId}`,
      status: uncertain ? "manual-recovery-required" : "rolled-back",
      classification: "explicit-rollback",
      createdAt: new Date().toISOString(),
      endpoint,
      sourceReceiptId: source.receiptId,
      created: [],
      reused: [],
      effects: steps,
      rollback: { status: uncertain ? "manual-recovery-required" : "verified-restored", steps },
    };
    return writeReceipt(stateRoot, rollbackBody).receipt;
  } finally {
    client.close();
  }
}

export const contracts = { INSPECT_REQUESTS, APPLY_REQUESTS };
