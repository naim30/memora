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
  WorldCreate,
  WorldGet,
  WorldUpdate,
  WorldDelete,
  WorldSearch,
  EpisodicCreate,
  EpisodicGet,
  EpisodicList,
  EpisodicDelete,
  EpisodicSearch,
  SemanticCreate,
  SemanticGet,
  SemanticList,
  SemanticUpdate,
  SemanticDelete,
  SemanticSearch,
} from "./tools/index.js";

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
  WorldCreate.name,
  WorldCreate.description,
  WorldCreate.input,
  WorldCreate.handler,
);
registerTool(
  server,
  WorldGet.name,
  WorldGet.description,
  WorldGet.input,
  WorldGet.handler,
);
registerTool(
  server,
  WorldUpdate.name,
  WorldUpdate.description,
  WorldUpdate.input,
  WorldUpdate.handler,
);
registerTool(
  server,
  WorldDelete.name,
  WorldDelete.description,
  WorldDelete.input,
  WorldDelete.handler,
);
registerTool(
  server,
  WorldSearch.name,
  WorldSearch.description,
  WorldSearch.input,
  WorldSearch.handler,
);
registerTool(
  server,
  EpisodicCreate.name,
  EpisodicCreate.description,
  EpisodicCreate.input,
  EpisodicCreate.handler,
);
registerTool(
  server,
  EpisodicGet.name,
  EpisodicGet.description,
  EpisodicGet.input,
  EpisodicGet.handler,
);
registerTool(
  server,
  EpisodicList.name,
  EpisodicList.description,
  EpisodicList.input,
  EpisodicList.handler,
);
registerTool(
  server,
  EpisodicSearch.name,
  EpisodicSearch.description,
  EpisodicSearch.input,
  EpisodicSearch.handler,
);
registerTool(
  server,
  EpisodicDelete.name,
  EpisodicDelete.description,
  EpisodicDelete.input,
  EpisodicDelete.handler,
);
registerTool(
  server,
  SemanticCreate.name,
  SemanticCreate.description,
  SemanticCreate.input,
  SemanticCreate.handler,
);
registerTool(
  server,
  SemanticGet.name,
  SemanticGet.description,
  SemanticGet.input,
  SemanticGet.handler,
);
registerTool(
  server,
  SemanticList.name,
  SemanticList.description,
  SemanticList.input,
  SemanticList.handler,
);
registerTool(
  server,
  SemanticUpdate.name,
  SemanticUpdate.description,
  SemanticUpdate.input,
  SemanticUpdate.handler,
);
registerTool(
  server,
  SemanticDelete.name,
  SemanticDelete.description,
  SemanticDelete.input,
  SemanticDelete.handler,
);
registerTool(
  server,
  SemanticSearch.name,
  SemanticSearch.description,
  SemanticSearch.input,
  SemanticSearch.handler,
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
  console.log(`Memora server stopped with error: ${errMsg}`);
  process.exit(1);
});
