import { z } from "zod";
import { config } from "../config/config.js";
import { database } from "../database/db.js";

const DEFAULT_MEMORY_LIMIT = 20;

// ─── memory_create ──────────────────────────────────────────────────────────
const MemoryCreateInput = z.object({
  data: z.string().min(1).describe("The text to remember."),
});

async function handleMemoryCreate(input: z.infer<typeof MemoryCreateInput>) {
  if (!config.AGENT_NAME) {
    throw new Error(
      "AGENT_NAME is not set. Set it in the .mcp.json env block (or .env) before writing memories.",
    );
  }
  const statement = database.prepare(`
    insert into memories (agent, data)
    values (?, ?)
    returning *
  `);
  return statement.get(config.AGENT_NAME, input.data);
}

export const MemoryCreate = {
  name: "memory_create",
  description:
    "Store a new memory under this MCP's AGENT_NAME. Returns the created row.",
  input: MemoryCreateInput,
  handler: handleMemoryCreate,
};

// ─── memory_search ──────────────────────────────────────────────────────────
const MemorySearchInput = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "FTS5 MATCH expression. Words match as AND; supports OR, NOT, and quoted phrases.",
    ),
  agent: z
    .string()
    .optional()
    .describe(
      "Filter to one agent's memories. Defaults to this MCP's AGENT_NAME; pass a different name to read theirs. If AGENT_NAME is unset and this is omitted, returns memories from all agents.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max results (default 20)."),
});

async function handleMemorySearch(input: z.infer<typeof MemorySearchInput>) {
  const agent = input.agent || config.AGENT_NAME;
  const limit = input.limit || DEFAULT_MEMORY_LIMIT;

  if (agent) {
    const statement = database.prepare(`
      select m.*
      from memories_fts f
      join memories m on m.id = f.rowid
      where memories_fts match ?
        and m.agent = ?
      order by rank
      limit ?
    `);
    return statement.all(input.query, agent, limit);
  }

  const statement = database.prepare(`
    select m.*
    from memories_fts f
    join memories m on m.id = f.rowid
    where memories_fts match ?
    order by rank
    limit ?
  `);
  return statement.all(input.query, limit);
}

export const MemorySearch = {
  name: "memory_search",
  description:
    "Full-text search memories ranked by relevance. Returns an array of matching rows.",
  input: MemorySearchInput,
  handler: handleMemorySearch,
};

// ─── memory_list ────────────────────────────────────────────────────────────
const MemoryListInput = z.object({
  agent: z
    .string()
    .optional()
    .describe(
      "Filter to one agent's memories. Defaults to this MCP's AGENT_NAME; pass a different name to read theirs. If AGENT_NAME is unset and this is omitted, returns memories from all agents.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max results (default 20)."),
});

async function handleMemoryList(input: z.infer<typeof MemoryListInput>) {
  const agent = input.agent || config.AGENT_NAME;
  const limit = input.limit || DEFAULT_MEMORY_LIMIT;

  if (agent) {
    const statement = database.prepare(`
      select *
      from memories
      where agent = ?
      order by created_at desc
      limit ?
    `);
    return statement.all(agent, limit);
  }

  const statement = database.prepare(`
    select *
    from memories
    order by created_at desc
    limit ?
  `);
  return statement.all(limit);
}

export const MemoryList = {
  name: "memory_list",
  description:
    "List memories newest-first. Returns an array of rows.",
  input: MemoryListInput,
  handler: handleMemoryList,
};

// ─── memory_delete ──────────────────────────────────────────────────────────
const MemoryDeleteInput = z.object({
  id: z.number().int().positive().describe("Memory id to delete."),
});

async function handleMemoryDelete(input: z.infer<typeof MemoryDeleteInput>) {
  const statement = database.prepare(`
    delete from memories
    where id = ?
    returning *
  `);
  return statement.get(input.id);
}

export const MemoryDelete = {
  name: "memory_delete",
  description:
    "Delete a memory by id. Returns the deleted row, or null if no row matched.",
  input: MemoryDeleteInput,
  handler: handleMemoryDelete,
};
