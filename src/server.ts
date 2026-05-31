#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { paths } from "./config/config.js";
import { database } from "./database/db.js";
import { registerTool } from "./lib/register-tool.js";
import {
  KnowledgeRead,
  KnowledgeWrite,
  MemoryCreate,
  MemoryDelete,
  MemoryList,
  MemorySearch,
} from "./tools/index.js";

mkdirSync(paths.globalMem, { recursive: true });
mkdirSync(paths.agentMem, { recursive: true });

const server = new McpServer({ name: "memora", version: "0.1.0" });

registerTool(
  server,
  KnowledgeRead.name,
  KnowledgeRead.description,
  KnowledgeRead.input,
  KnowledgeRead.handler,
);
registerTool(
  server,
  KnowledgeWrite.name,
  KnowledgeWrite.description,
  KnowledgeWrite.input,
  KnowledgeWrite.handler,
);
registerTool(
  server,
  MemoryCreate.name,
  MemoryCreate.description,
  MemoryCreate.input,
  MemoryCreate.handler,
);
registerTool(
  server,
  MemorySearch.name,
  MemorySearch.description,
  MemorySearch.input,
  MemorySearch.handler,
);
registerTool(
  server,
  MemoryList.name,
  MemoryList.description,
  MemoryList.input,
  MemoryList.handler,
);
registerTool(
  server,
  MemoryDelete.name,
  MemoryDelete.description,
  MemoryDelete.input,
  MemoryDelete.handler,
);

function shutdown() {
  try {
    database.close();
  } catch {}
  process.exit(0);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGHUP", shutdown);
  process.stdin.on("end", shutdown);
}

main().catch((err) => {
  const errMsg = err instanceof Error ? err.stack : String(err);
  console.log(`Memory server stopped with error: ${errMsg}`);
  process.exit(1);
});
