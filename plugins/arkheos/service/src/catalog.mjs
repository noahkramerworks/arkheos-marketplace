import { json } from "./domain.mjs";

export async function catalog(env) {
  const value = await env.CONFIG.get("catalog:current", "json");
  return value?.schema === "arkheos.catalog/v1" ? json(value, 200, { "cache-control": "public, max-age=60" }) : json({ code: "CATALOG_UNAVAILABLE" }, 503);
}
