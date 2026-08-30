import test from "node:test";
import assert from "node:assert/strict";
import { validateArchive } from "../mcp/core/crypto.mjs";
import { sha256 } from "../mcp/core/canonical.mjs";

function archive(files) { return Buffer.from(JSON.stringify({ schema: "arkheos.product-archive/v1", product: "demo", version: "1.0.0", files: files.map(({ path, content = "x", type = "file" }) => { const bytes = Buffer.from(content); return { path, type, content: bytes.toString("base64"), length: bytes.length, sha256: sha256(bytes) }; }) })); }

test("archive validation rejects traversal, links, duplicates, and missing marketplace identity", () => {
  assert.throws(() => validateArchive(archive([{ path: "../escape" }]), { product: "demo" }), /Unsafe/u);
  assert.throws(() => validateArchive(archive([{ path: ".agents/plugins/marketplace.json", type: "link" }]), { product: "demo" }), /Unsafe|Malformed/u);
  assert.throws(() => validateArchive(archive([{ path: ".agents/plugins/marketplace.json" }, { path: ".agents/plugins/marketplace.json" }]), { product: "demo" }), /Duplicate/u);
  assert.throws(() => validateArchive(archive([{ path: "plugins/demo/file" }]), { product: "demo" }), /missing/u);
});
