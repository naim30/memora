import { z } from "zod";
import { config } from "../config/config.js";
import { database } from "../database/db.js";

const DEFAULT_MEMORY_LIMIT = 20;

// ─── memory_create ──────────────────────────────────────────────────────────
const MemoryCreateInput = z.object({
  agent: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Identifier of the agent storing this memory. Defaults to the AGENT_NAME env var set in .mcp.json; required if AGENT_NAME is empty.",
    ),
  data: z.string().min(1).describe("The text to remember."),
});

async function handleMemoryCreate(input: z.infer<typeof MemoryCreateInput>) {
  const agent = input.agent || config.AGENT_NAME;
  if (!agent) {
    throw new Error(
      "agent is required: pass it in the tool call, or set AGENT_NAME in .mcp.json env.",
    );
  }
  const statement = database.prepare(`
    insert into memories (agent, data)
    values (?, ?)
    returning *
  `);
  return statement.get(agent, input.data);
}

export const MemoryCreate = {
  name: "memory_create",
  description:
    "Store a note in long-term memory. Returns the created memory row.",
  input: MemoryCreateInput,
  handler: handleMemoryCreate,
};

// ─── memory_search ──────────────────────────────────────────────────────────
const MemorySearchInput = z.object({
  query: z
    .string()
    .min(1)
    .describe("FTS5 MATCH query, e.g. 'shopify recruiter'."),
  agent: z
    .string()
    .optional()
    .describe("Optionally restrict to memories from a specific agent."),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max results (default 10)."),
});

async function handleMemorySearch(input: z.infer<typeof MemorySearchInput>) {
  const limit = input.limit ?? DEFAULT_MEMORY_LIMIT;

  if (input.agent) {
    const statement = database.prepare(`
      select m.*
      from memories_fts f
      join memories m on m.id = f.rowid
      where memories_fts match ?
        and m.agent = ?
      order by rank
      limit ?
    `);
    return statement.all(input.query, input.agent, limit);
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
    "Full-text search memories ranked by relevance, optionally scoped to one agent. Returns an array of memory rows.",
  input: MemorySearchInput,
  handler: handleMemorySearch,
};

// ─── memory_list ────────────────────────────────────────────────────────────
const MemoryListInput = z.object({
  agent: z
    .string()
    .optional()
    .describe("Optionally restrict to memories from a specific agent."),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(`Max results (default ${DEFAULT_MEMORY_LIMIT}).`),
});

async function handleMemoryList(input: z.infer<typeof MemoryListInput>) {
  const limit = input.limit || DEFAULT_MEMORY_LIMIT;

  if (input.agent) {
    const statement = database.prepare(`
      select *
      from memories
      where agent = ?
      order by created_at desc
      limit ?
    `);
    return statement.all(input.agent, limit);
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
    "List memories newest-first, optionally scoped to one agent. Returns an array of memory rows.",
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
    "Delete a memory by id. Returns the deleted memory row, or null if no row matched.",
  input: MemoryDeleteInput,
  handler: handleMemoryDelete,
};
