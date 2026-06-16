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
      "Short label naming the SUBJECT of this shared fact — used for human scanning and as a coarse dedup key. Convention: snake_case noun phrase. Examples spanning different agent kinds: 'company_holidays_2026', 'shared_glossary', 'rate_limit_policy', 'canonical_team_roster', 'deployment_window_utc'. NOT indexed by FTS5 — this is a label, not a searchable phrase.",
    ),
  data: z
    .string()
    .min(1)
    .describe(
      "The shared fact itself as a self-contained DECLARATIVE statement that ANY agent on the server can read and act on. ONE sentence (target 100-500 chars; soft cap ~2000 — compress in place if larger, see SKILL.md). Third-person, present-tense, NO 'I/you/the agent' — name actors explicitly so another agent can act on it. If the fact derives from logged episodic events, embed source(s) inline as `[episodic id: <agent_name>/<int>]` — the <agent_name>/ prefix is REQUIRED because episodic ids are not globally unique across agents. Example: 'Public API rate limit is 100 req/min per IP; bypass requires written sign-off from oncall [episodic id: ops_agent/102][episodic id: support_bot/47].' If no episodic source exists, omit the bracket and set metadata.origin instead.",
    ),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe(
      "Optional key-value object for structured tags. Conventional keys: tags (list), confidence ('high'|'medium'|'low' or 0-1), origin (when no episodic source bracket — 'system_prompt' / 'external_kb' / etc.), valid_from / valid_until (ISO date for world-time validity, distinct from system created_at/updated_at). Example: { tags: ['policy','deploys'], confidence: 'authoritative' }. NOT FTS5-indexed — bake searchable phrases into `data`. Stored as JSON; returned already parsed.",
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
    "Store a new fact in world memory — knowledge visible to and trusted by ALL agents on this server, not just the writer. World holds canonical truths and cross-agent context: shared taxonomies, system-wide constants, organizational facts, integration metadata. Use episodic_create for one-off per-agent events, semantic_create for per-agent state, and world_create only when the fact is genuinely shared across the agent population. ALWAYS world_search first to avoid duplicating a shared fact; if a near-match exists, use world_update to merge in place. World rows are NOT scoped to AGENT_NAME — every agent reads them. Embed provenance inline in `data` as `[episodic id: <agent_name>/<int>]` when the fact derives from logged episodic events — the <agent_name>/ prefix is REQUIRED because episodic ids are not globally unique across agents. Data soft cap ~2000 chars (skill guidance — world never splits; merge in place). Returns the created row (id, name, data, metadata, created_at, updated_at).",
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
    "Fetch a single world fact by id. Use after world_search returns a candidate worth examining, to re-read a row you just created or updated, or to fetch the current value before calling world_update so you can preserve unchanged metadata keys (metadata REPLACES on update) AND the existing inline `[episodic id: <agent_name>/<int>]` provenance brackets in `data` (which must be preserved + appended-to on update). Returns the row with parsed metadata, or null if no row matched.",
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
      "New data (optional). Same conventions as world_create.data — agent-agnostic declarative statement, soft cap ~2000 chars. World facts merge in place: when revising, world_get the current data, summarize-merge the new content with existing content, PRESERVE existing `[episodic id: <agent_name>/<int>]` brackets and APPEND new ones. Example: existing 'X is Y [episodic id: a/47].' becomes 'X is Y; also Z [episodic id: a/47][episodic id: b/89].'. Omit to leave existing data unchanged.",
    ),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe(
      "Replacement metadata object (optional). REPLACES the metadata entirely; it does NOT merge — if you want to preserve some existing keys, world_get the row first and pass the merged result. Omit to leave metadata unchanged.",
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
    "Update a world fact in place — mutate name, data, and/or metadata of an existing row and bump updated_at. World is the singular source of truth across all agents (NOT an append stream like episodic) — mutate rather than create a parallel row, and NEVER split when oversized; instead world_get the current data, summarize-merge new + existing under the size cap, and write back. Two contract behaviors to remember: (1) metadata REPLACES — world_get first if you need to preserve other keys; (2) when the update is prompted by a fresh episodic event, the new `data` text must PRESERVE existing `[episodic id: <agent_name>/<int>]` brackets and APPEND new ones — the cross-agent audit trail accumulates inside `data`. The FTS5 mirror refreshes via trigger. Provide at least one of name / data / metadata. Returns the updated row, or null if no row matched.",
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
    "Delete a single world fact by id. Use when a fact has been retracted across the system, was wrong, or has been consolidated into a different world row during compaction. The FTS5 mirror is kept in sync via trigger. Returns the deleted row, or null if no row matched. World deletions affect every agent on the server — apply more caution here than in episodic / semantic; prefer world_update for in-place corrections (which preserves the audit trail in `data` brackets).",
  input: WorldDeleteInput,
  handler: handleWorldDelete,
};

// ─── world_search ───────────────────────────────────────────────────────────
const WorldSearchInput = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'FTS5 MATCH expression evaluated against the `data` column ONLY — `name` and `metadata` are NOT indexed and NOT searchable. Words match as AND implicitly; use uppercase OR, NOT, or "quoted phrases" for finer control. Avoid bare `=` (FTS5 rejects it) and bare ISO date fragments like 2026-06-16 (parsed as column references — wrap them in quotes). No stemming. Example: \'"deployment window" OR "release freeze"\'. To reverse-lookup which world rows cite a given episodic event, use a quoted phrase (FTS5 tokenizer drops the slash — use a space): \'"episodic id: ops_agent 102"\'.',
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
    "Full-text search world memory (cross-agent shared facts) via SQLite FTS5 / BM25. The `data` column is the ONLY indexed field — `name` and `metadata` are not searchable. Reach for this when looking up canonical truths the whole system should know — shared taxonomies, system constants, organizational facts. ALWAYS call this before world_create to avoid duplicating a shared fact; if a near-match exists, use world_update to merge in place. Inline `[episodic id: <agent_name>/<int>]` provenance brackets in `data` are searchable as quoted phrases for reverse-lookup. Default sort is FTS5 relevance; switch to sort='recent' for the freshest update (world sorts by updated_at, not created_at). Returns matching rows with parsed metadata.",
  input: WorldSearchInput,
  handler: handleWorldSearch,
};
