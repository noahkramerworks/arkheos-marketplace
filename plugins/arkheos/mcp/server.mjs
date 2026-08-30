import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMcpHandler } from "./handler.mjs";

export async function startStdioServer({ input = process.stdin, output = process.stdout, handler = createMcpHandler() } = {}) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on("line", async (line) => {
    if (!line.trim()) return;
    let request;
    try {
      request = JSON.parse(line);
      const value = await handler(request);
      if (request.id !== undefined) output.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: value }) + "\n");
    } catch (error) {
      const rpc = error.rpc || { code: -32603, message: "ArkheOS server error" };
      output.write(JSON.stringify({ jsonrpc: "2.0", id: request?.id ?? null, error: rpc }) + "\n");
    }
  });
  return lines;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await startStdioServer();
