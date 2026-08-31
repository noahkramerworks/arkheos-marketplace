import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the public sales page leads new customers through the complete install path", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /NOW AVAILABLE — STREAM SHOWRUNNER/u);
  assert.match(html, /href="#install">Install the free bootstrap/u);
  assert.match(html, /codex plugin marketplace add noahkramerworks\/arkheos-marketplace --ref main/u);
  assert.match(html, /codex plugin add arkheos@arkheos/u);
  assert.match(html, /codex plugin add obs-bridge@arkheos/u);
  assert.match(html, /@ArkheOS authorize my account, start my trial, and install Stream Showrunner/u);
  assert.match(html, /7-day no-card trial/u);
  assert.match(html, /\$10 monthly/u);
  assert.match(html, /\$99 annually/u);
  assert.doesNotMatch(html, /class="primary" href="https:\/\/account\.arkheos\.ai\/">Start/u);
});
