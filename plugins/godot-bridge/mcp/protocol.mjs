import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { resolveResPath } from "./state.mjs";

export const PROTOCOL = "godot-bridge/ipc/v1";
export const ACTION_TYPES = ["scene.create", "scene.instantiate", "scene.save", "node.create", "node.remove", "node.move", "node.rename", "node.duplicate", "node.set_property", "script.write", "script.attach", "script.detach", "signal.connect", "signal.disconnect", "resource.create", "resource.set_property", "project.input_action.ensure", "asset.import"];
const ACTION_SET = new Set(ACTION_TYPES);
export const SCENE_ACTION_TYPES = new Set(["scene.create", "scene.instantiate", "scene.save", "node.create", "node.remove", "node.move", "node.rename", "node.duplicate", "node.set_property", "script.attach", "script.detach", "signal.connect", "signal.disconnect"]);
const VARIANT_TYPES = new Set(["Vector2", "Vector3", "Vector4", "Color", "Rect2", "Transform2D", "Transform3D", "Basis", "Quaternion", "NodePath", "Resource", "Alias"]);
const RESOURCE_TYPES = new Set(["StandardMaterial3D", "ShaderMaterial", "Theme", "StyleBoxFlat", "Gradient", "GradientTexture1D", "Curve", "Curve2D", "Curve3D", "Animation", "AnimationLibrary", "BoxMesh", "SphereMesh", "CapsuleMesh", "QuadMesh", "RectangleShape2D", "CircleShape2D", "BoxShape3D", "SphereShape3D", "CapsuleShape3D"]);
const TAGGED_ARRAY_LENGTHS = { Vector2: 2, Vector3: 3, Vector4: 4, Color: 4, Rect2: 4, Transform2D: 6, Transform3D: 12, Basis: 9, Quaternion: 4 };

export function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

export function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label} contains unknown field: ${key}`);
}

export function boundedString(value, label, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} must be a non-empty string of at most ${max} characters`);
  return value.trim();
}

function identifier(value, label, max = 160) {
  const text = boundedString(value, label, max);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) throw new Error(`${label} must be an identifier`);
  return text;
}

function resourcePath(projectRoot, value, label, extensions = []) {
  const resolved = resolveResPath(projectRoot, value);
  const extension = path.extname(resolved.relative).slice(1).toLowerCase();
  if (extensions.length && !extensions.includes(extension)) throw new Error(`${label} must use .${extensions.join(" or .")}`);
  return resolved;
}

function validateSourceFile(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute path`);
  const target = path.resolve(value);
  if (!existsSync(target) || !statSync(target).isFile()) throw new Error(`${label} must identify an existing file`);
  let current = target;
  while (true) {
    if (lstatSync(current).isSymbolicLink()) throw new Error(`${label} cannot traverse a symlink or reparse point`);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  realpathSync.native(target);
}

function validateVariant(value, label, projectRoot, aliases, depth = 0) {
  if (depth > 16) throw new Error(`${label} exceeds maximum nesting`);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error(`${label} must be finite`); return; }
  if (typeof value === "string") { if (value.length > 1_048_576) throw new Error(`${label} string is too large`); return; }
  if (Array.isArray(value)) {
    if (value.length > 2048) throw new Error(`${label} array is too large`);
    value.forEach((item, index) => validateVariant(item, `${label}[${index}]`, projectRoot, aliases, depth + 1));
    return;
  }
  object(value, label);
  if (typeof value.$type === "string") {
    if (!VARIANT_TYPES.has(value.$type)) throw new Error(`${label} has unsupported variant type: ${value.$type}`);
    if (value.$type === "Alias") {
      exactKeys(value, ["$type", "alias"], label);
      const alias = identifier(value.alias, `${label}.alias`, 80);
      if (!aliases.has(alias)) throw new Error(`${label} references unknown or forward alias: ${alias}`);
      return;
    }
    if (value.$type === "NodePath") {
      exactKeys(value, ["$type", "path"], label); boundedString(value.path, `${label}.path`, 1024); return;
    }
    if (value.$type === "Resource") {
      exactKeys(value, ["$type", "path"], label); resourcePath(projectRoot, value.path, `${label}.path`); return;
    }
    exactKeys(value, ["$type", "value"], label);
    const length = TAGGED_ARRAY_LENGTHS[value.$type];
    if (!Array.isArray(value.value) || value.value.length !== length || value.value.some((item) => typeof item !== "number" || !Number.isFinite(item))) throw new Error(`${label}.value must contain exactly ${length} finite numbers`);
    return;
  }
  if (Object.keys(value).length > 2048) throw new Error(`${label} dictionary is too large`);
  for (const [key, item] of Object.entries(value)) {
    if (key.length > 160) throw new Error(`${label} has an overlong key`);
    validateVariant(item, `${label}.${key}`, projectRoot, aliases, depth + 1);
  }
}

function nodeReference(value, label, projectRoot, aliases) {
  if (typeof value === "string") { boundedString(value, label, 1024); return; }
  validateVariant(value, label, projectRoot, aliases);
  if (value?.$type !== "Alias") throw new Error(`${label} must be a NodePath string or prior Alias`);
}

function requireFields(action, fields, label) {
  for (const field of fields) if (!(field in action)) throw new Error(`${label}.${field} is required`);
}

function actionContract(action, label, projectRoot, aliases) {
  const contracts = {
    "scene.create": { required: ["path", "rootType", "rootName"], allowed: ["type", "path", "rootType", "rootName", "alias"] },
    "scene.instantiate": { required: ["path", "parent"], allowed: ["type", "path", "parent", "alias"] },
    "scene.save": { required: [], allowed: ["type"] },
    "node.create": { required: ["parent", "nodeType", "name"], allowed: ["type", "parent", "nodeType", "name", "alias"] },
    "node.remove": { required: ["target"], allowed: ["type", "target"] },
    "node.move": { required: ["target", "parent"], allowed: ["type", "target", "parent"] },
    "node.rename": { required: ["target", "name"], allowed: ["type", "target", "name"] },
    "node.duplicate": { required: ["target"], allowed: ["type", "target", "parent", "name", "alias"] },
    "node.set_property": { required: ["target", "property", "value"], allowed: ["type", "target", "property", "value"] },
    "script.write": { required: ["path", "content"], allowed: ["type", "path", "content"] },
    "script.attach": { required: ["target", "scriptPath"], allowed: ["type", "target", "scriptPath"] },
    "script.detach": { required: ["target"], allowed: ["type", "target"] },
    "signal.connect": { required: ["source", "signal", "target", "method"], allowed: ["type", "source", "signal", "target", "method"] },
    "signal.disconnect": { required: ["source", "signal", "target", "method"], allowed: ["type", "source", "signal", "target", "method"] },
    "resource.create": { required: ["resourceType", "path"], allowed: ["type", "resourceType", "path", "properties", "alias"] },
    "resource.set_property": { required: ["path", "property", "value"], allowed: ["type", "path", "property", "value"] },
    "project.input_action.ensure": { required: ["name"], allowed: ["type", "name", "deadzone"] },
    "asset.import": { required: ["sourcePath", "targetPath"], allowed: ["type", "sourcePath", "targetPath"] },
  };
  const contract = contracts[action.type];
  exactKeys(action, contract.allowed, label); requireFields(action, contract.required, label);
  switch (action.type) {
    case "scene.create": resourcePath(projectRoot, action.path, `${label}.path`, ["tscn"]); identifier(action.rootType, `${label}.rootType`); boundedString(action.rootName, `${label}.rootName`, 255); break;
    case "scene.instantiate": resourcePath(projectRoot, action.path, `${label}.path`, ["tscn"]); nodeReference(action.parent, `${label}.parent`, projectRoot, aliases); break;
    case "node.create": nodeReference(action.parent, `${label}.parent`, projectRoot, aliases); identifier(action.nodeType, `${label}.nodeType`); boundedString(action.name, `${label}.name`, 255); break;
    case "node.remove": case "script.detach": nodeReference(action.target, `${label}.target`, projectRoot, aliases); break;
    case "node.move": nodeReference(action.target, `${label}.target`, projectRoot, aliases); nodeReference(action.parent, `${label}.parent`, projectRoot, aliases); break;
    case "node.rename": nodeReference(action.target, `${label}.target`, projectRoot, aliases); boundedString(action.name, `${label}.name`, 255); break;
    case "node.duplicate": nodeReference(action.target, `${label}.target`, projectRoot, aliases); if (action.parent !== undefined) nodeReference(action.parent, `${label}.parent`, projectRoot, aliases); if (action.name !== undefined) boundedString(action.name, `${label}.name`, 255); break;
    case "node.set_property": nodeReference(action.target, `${label}.target`, projectRoot, aliases); identifier(action.property, `${label}.property`); validateVariant(action.value, `${label}.value`, projectRoot, aliases); break;
    case "script.write": resourcePath(projectRoot, action.path, `${label}.path`, ["gd"]); if (typeof action.content !== "string" || action.content.length > 1_048_576 || Buffer.from(action.content, "utf8").toString("utf8") !== action.content) throw new Error(`${label}.content must be exact UTF-8 text of at most 1 MiB`); break;
    case "script.attach": nodeReference(action.target, `${label}.target`, projectRoot, aliases); resourcePath(projectRoot, action.scriptPath, `${label}.scriptPath`, ["gd"]); break;
    case "signal.connect": case "signal.disconnect": nodeReference(action.source, `${label}.source`, projectRoot, aliases); nodeReference(action.target, `${label}.target`, projectRoot, aliases); identifier(action.signal, `${label}.signal`); identifier(action.method, `${label}.method`); break;
    case "resource.create": resourcePath(projectRoot, action.path, `${label}.path`, ["tres", "res"]); if (!RESOURCE_TYPES.has(action.resourceType)) throw new Error(`${label}.resourceType is not admitted`); if (action.properties !== undefined) { object(action.properties, `${label}.properties`); if (Object.keys(action.properties).length > 512) throw new Error(`${label}.properties is too large`); for (const [property, value] of Object.entries(action.properties)) { identifier(property, `${label}.properties key`); validateVariant(value, `${label}.properties.${property}`, projectRoot, aliases); } } break;
    case "resource.set_property": resourcePath(projectRoot, action.path, `${label}.path`, ["tres", "res"]); identifier(action.property, `${label}.property`); validateVariant(action.value, `${label}.value`, projectRoot, aliases); break;
    case "project.input_action.ensure": identifier(action.name, `${label}.name`); if (action.deadzone !== undefined && (typeof action.deadzone !== "number" || !Number.isFinite(action.deadzone) || action.deadzone < 0 || action.deadzone > 1)) throw new Error(`${label}.deadzone must be between 0 and 1`); break;
    case "asset.import": validateSourceFile(action.sourcePath, `${label}.sourcePath`); resourcePath(projectRoot, action.targetPath, `${label}.targetPath`); break;
  }
}

export function validateTransaction(args, projectRoot) {
  object(args, "arguments");
  exactKeys(args, ["projectRoot", "transactionId", "expectedRevision", "scenePath", "actions"], "arguments");
  const transactionId = boundedString(args.transactionId, "transactionId");
  if (!/^[A-Za-z0-9._:-]+$/.test(transactionId)) throw new Error("transactionId contains unsupported characters");
  if (!/^sha256:[a-f0-9]{64}$/.test(args.expectedRevision || "")) throw new Error("expectedRevision must be sha256:<64 lowercase hex characters>");
  if (!Array.isArray(args.actions) || args.actions.length < 1 || args.actions.length > 50) throw new Error("actions must contain between 1 and 50 entries");
  if (args.scenePath) resourcePath(projectRoot, args.scenePath, "scenePath", ["tscn"]);
  const aliases = new Set();
  const actions = args.actions.map((raw, index) => {
    const action = object(structuredClone(raw), `actions[${index}]`);
    if (!ACTION_SET.has(action.type)) throw new Error(`actions[${index}].type is unsupported`);
    actionContract(action, `actions[${index}]`, projectRoot, aliases);
    if (action.alias !== undefined) {
      const alias = boundedString(action.alias, `actions[${index}].alias`, 80);
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(alias) || aliases.has(alias)) throw new Error(`actions[${index}].alias is invalid or duplicated`);
      aliases.add(alias);
    }
    return action;
  });
  const creates = actions.filter((action) => action.type === "scene.create");
  if (creates.length > 1 || (creates.length === 1 && actions[0] !== creates[0])) throw new Error("scene.create may appear at most once and must be the first action");
  if (creates.length === 1 && args.scenePath && creates[0].path !== args.scenePath) throw new Error("scene.create path must equal transaction scenePath");
  return { projectRoot, transactionId, expectedRevision: args.expectedRevision, scenePath: args.scenePath || null, actions };
}

export function changedTargets(transaction) {
  const targets = new Set();
  if (transaction.scenePath && transaction.actions.some((action) => SCENE_ACTION_TYPES.has(action.type))) targets.add(transaction.scenePath);
  for (const action of transaction.actions) {
    const resource = action.type === "asset.import" ? action.targetPath : ["scene.create", "script.write", "resource.create", "resource.set_property"].includes(action.type) ? action.path : null;
    if (resource) { targets.add(resource); if (/\.(gd|gdshader)$/i.test(resource)) targets.add(`${resource}.uid`); }
    if (action.type === "project.input_action.ensure") targets.add("res://project.godot");
  }
  return [...targets].sort();
}
