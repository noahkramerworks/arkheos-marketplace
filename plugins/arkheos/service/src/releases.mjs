import { json } from "./domain.mjs";

export async function release(env, product, channel) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(product) || channel !== "stable") return json({ code: "INVALID_RELEASE" }, 400);
  const value = await env.CONFIG.get(`release:${product}:${channel}`, "json");
  return value?.schema === "arkheos.release/v1" ? json(value, 200, { "cache-control": "private, max-age=60" }) : json({ code: "RELEASE_UNAVAILABLE" }, 503);
}

export async function artifact(request, env, sha, entitlement) {
  if (!/^[a-f0-9]{64}$/u.test(sha)) return json({ code: "INVALID_ARTIFACT" }, 400);
  if (!entitlement.mutating) return json({ code: "MEMBERSHIP_REQUIRED", mode: entitlement.mode }, 403);
  const record = await env.DB.prepare("SELECT r2_key,length FROM artifacts WHERE sha256=?").bind(sha).first();
  const key = record?.r2_key || `sha256/${sha}`;
  const object = await env.ARTIFACTS.get(key);
  if (!object || (record && Number(record.length) !== object.size)) return json({ code: "NOT_FOUND" }, 404);
  return new Response(object.body, { headers: { "content-type": "application/octet-stream", "content-length": String(object.size), etag: `\"${sha}\"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
