import { z } from "zod";
import { database } from "../database/db.js";
import {
  parseMetadataInRow,
  parseMetadataInRows,
  serializeMetadata,
} from "../lib/metadata.js";

const DEFAULT_WORLD_LIMIT = 20;

// ─── world_create ───────────────────────────────────────────────────────────
const WorldCreateInput = z.object({
  name: z
    .string()
    .min(1)
    .describe(
      "Short label for this world fact — used for human scanning and as a coarse dedup key. Convention: snake_case noun phrase describing the fact's subject. Examples spanning different agent kinds: 'company_holidays_2026', 'shared_glossary', 'rate_limit_policy', 'canonical_team_roster', 'deployment_window_utc'.",
    ),
  data: z
    .string()
    .min(1)
    .describe(
      "The shared fact itself, in natural language — a self-contained statement that ANY agent on the server should be able to read and act on. State agent-agnostic durable truths, not per-agent state or one-off events. Example: 'The org's preferred contact channels in order are: email (primary), chat (urgent), phone (emergencies only) — agents should respect this hierarchy when initiating outreach.'",
    ),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe(
      "Optional key-value object for structured tags. Common shape: an origin (which agent first asserted this), a confidence level, an expiry, free-form tags. Example: { origin: 'oncall_bot', confidence: 'authoritative', tags: ['policy', 'deploys'] }. Stored as JSON; returned already parsed.",
    ),
});

async function handleWorldCreate(input: z.infer<typeof WorldCreateInput>) {
  const statement = database.prepare(`
    insert into world (name, data, metadata)
    values (?, ?, ?)
    returning *
  `);
  return parseMetadataInRow(
    statement.get(input.name, input.data, serializeMetadata(input.metadata)),
  );
}

export const WorldCreate = {
  name: "world_create",
  description:
    "Store a new fact in world memory — a piece of knowledge that should be visible to and trusted by *all* agents on this server, not just the writer. World holds canonical truths and cross-agent context: shared taxonomies, system-wide constants, organizational facts, integration metadata. Use episodic_create for one-off per-agent events, semantic_create for per-agent state, and world_create only when the fact is genuinely shared across the agent population. Returns the created row (id, name, data, metadata, created_at, updated_at); world rows are NOT scoped to AGENT_NAME — they are shared across the whole server.",
  input: WorldCreateInput,
  handler: handleWorldCreate,
};

// ─── world_get ──────────────────────────────────────────────────────────────
const WorldGetInput = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe(
      "Numeric id of the world fact to fetch — typically an id surfaced by a prior world_create, world_search, or world_update call.",
    ),
});

async function handleWorldGet(input: z.infer<typeof WorldGetInput>) {
  const statement = database.prepare(`
    select *
    from world
    where id = ?
  `);
  return parseMetadataInRow(statement.get(input.id));
}

export const WorldGet = {
  name: "world_get",
  description:
    "Fetch a single world fact by id. Use after world_search returns a candidate worth examining in detail, or to re-read a row you just created or updated. Returns the row with parsed metadata, or null if no row matched.",
  input: WorldGetInput,
  handler: handleWorldGet,
};

// ─── world_update ───────────────────────────────────────────────────────────
const WorldUpdateInput = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe(
      "Numeric id of the world fact to update — typically an id surfaced by a prior world_search or world_get call.",
    ),
  name: z
    .string()
    .min(1)
    .optional()
    .describe(
      "New name (optional). Same conventions as world_create.name. Omit to leave the existing name unchanged.",
    ),
  data: z
    .string()
    .min(1)
    .optional()
    .describe(
      "New data (optional). Same conventions as world_create.data — a self-contained statement any agent on the server could read and act on. Omit to leave the existing data unchanged.",
    ),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe(
      "Replacement metadata object (optional). Note: this REPLACES the metadata entirely; it does NOT merge with the existing object — if you want to preserve some existing keys, world_get the row first and pass the merged result. Omit to leave metadata unchanged.",
    ),
});

async function handleWorldUpdate(input: z.infer<typeof WorldUpdateInput>) {
  if (
    input.name === undefined &&
    input.data === undefined &&
    input.metadata === undefined
  ) {
    throw new Error("Provide name, data, metadata, or any combination.");
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    sets.push("name = ?");
    params.push(input.name);
  }
  if (input.data !== undefined) {
    sets.push("data = ?");
    params.push(input.data);
  }
  if (input.metadata !== undefined) {
    sets.push("metadata = ?");
    params.push(serializeMetadata(input.metadata));
  }
  sets.push("updated_at = datetime('now')");
  params.push(input.id);

  const statement = database.prepare(`
    update world
    set ${sets.join(", ")}
    where id = ?
    returning *
  `);
  return parseMetadataInRow(statement.get(...params));
}

export const WorldUpdate = {
  name: "world_update",
  description:
    "Update a world fact in place — mutate name, data, and/or metadata of an existing row and bump updated_at. World is the singular source of truth across all agents (NOT an append stream like episodic), so prefer updating a stale or contradicted fact in place over creating a new row; the FTS5 mirror refreshes via trigger. You must provide at least one of name, data, or metadata. Returns the updated row, or null if no row matched.",
  input: WorldUpdateInput,
  handler: handleWorldUpdate,
};

// ─── world_delete ───────────────────────────────────────────────────────────
const WorldDeleteInput = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe(
      "Numeric id of the world fact to delete — typically an id surfaced by a prior world_search or world_get call.",
    ),
});

async function handleWorldDelete(input: z.infer<typeof WorldDeleteInput>) {
  const statement = database.prepare(`
    delete from world
    where id = ?
    returning *
  `);
  return parseMetadataInRow(statement.get(input.id));
}

export const WorldDelete = {
  name: "world_delete",
  description:
    "Delete a single world fact by id. Use when a fact has been retracted across the system, was wrong, or has been consolidated into a different world row during compaction. The FTS5 mirror is kept in sync via trigger. Returns the deleted row, or null if no row matched. World deletions affect every agent on the server — apply more caution here than in episodic or semantic, and prefer world_update for in-place corrections.",
  input: WorldDeleteInput,
  handler: handleWorldDelete,
};

// ─── world_search ───────────────────────────────────────────────────────────
const WorldSearchInput = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'FTS5 MATCH expression evaluated against the `data` column. Words match as AND implicitly; use uppercase OR, NOT, or "quoted phrases" for finer control. Avoid bare `=` (FTS5 rejects it) and bare ISO date fragments like 2026-06-16 (parsed as column references — wrap them in quotes). Example: \'"deployment window" OR "release freeze"\'.',
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Max results to return (default 20). Keep small for targeted lookups; bump higher when grabbing a wide swath of shared knowledge in one pass.",
    ),
  sort: z
    .enum(["relevant", "recent"])
    .optional()
    .describe(
      "'relevant' (default) = FTS5 BM25 rank — best when keyword density signals importance. 'recent' = most recently *updated* matching fact first (world sorts by updated_at, NOT created_at, because world rows mutate in place) — use to surface freshly-revised facts after a known world_update.",
    ),
});

async function handleWorldSearch(input: z.infer<typeof WorldSearchInput>) {
  const limit = input.limit || DEFAULT_WORLD_LIMIT;
  const orderBy =
    input.sort === "recent" ? "m.updated_at desc, m.id desc" : "rank";

  const statement = database.prepare(`
    select m.*
    from world_fts f
    join world m on m.id = f.rowid
    where world_fts match ?
    order by ${orderBy}
    limit ?
  `);
  return parseMetadataInRows(statement.all(input.query, limit));
}

export const WorldSearch = {
  name: "world_search",
  description:
    "Full-text search world memory (cross-agent shared facts) via SQLite FTS5 / BM25. Reach for this when looking up canonical truths the whole system should know — shared taxonomies, system constants, organizational facts; use semantic_search for per-agent state and episodic_search for timestamped events. Default sort is FTS5 relevance — switch to sort='recent' when you want the most recently updated matching fact (world sorts by updated_at, not created_at, because world rows mutate in place). Returns matching rows with parsed metadata.",
  input: WorldSearchInput,
  handler: handleWorldSearch,
};
