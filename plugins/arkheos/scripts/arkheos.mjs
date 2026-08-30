#!/usr/bin/env node
import { createMcpHandler } from "../mcp/handler.mjs";

const [command, value] = process.argv.slice(2);
const map = { status: ["account_status", {}], catalog: ["catalog_inspect", value ? { product: value } : {}], receipts: ["receipt_inspect", value ? { receiptId: value } : {}] };
if (!map[command]) throw new Error("Usage: node scripts/arkheos.mjs <status|catalog [product]|receipts [receipt-id]>");
const [name, args] = map[command];
const handler = createMcpHandler();
const response = await handler({ method: "tools/call", params: { name, arguments: args } });
process.stdout.write(response.content[0].text + "\n");
if (response.isError) process.exitCode = 1;
