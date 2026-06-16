import { z } from "zod";
import { config } from "../config/config.js";
import { database } from "../database/db.js";
import {
  parseMetadataInRow,
  parseMetadataInRows,
  serializeMetadata,
} from "../lib/metadata.js";

const DEFAULT_SEMANTIC_LIMIT = 20;

// ─── semantic_create ────────────────────────────────────────────────────────
const SemanticCreateInput = z.object({
  name: z
    .string()
    .min(1)
    .describe(
      "Short label naming the SUBJECT or topic of this fact — used for human scanning and as a coarse dedup key. Convention: snake_case noun phrase. Examples spanning different agent kinds: 'preferred_language', 'default_timezone', 'project_root', 'oncall_rotation', 'persona_voice', 'allowed_repos'. NOT indexed by FTS5 — this is a label, not a searchable phrase.",
    ),
  data: z
    .string()
    .min(1)
    .describe(
      "The fact itself as a self-contained DECLARATIVE statement. ONE sentence (target 100-400 chars; soft cap ~2000 — compress if larger, see SKILL.md). Third-person, present-tense, named subject (no bare 'user' / 'they'). State durable state, NOT events. If the fact derives from a logged episodic event, embed the source inline at the end as `[episodic id: <int>]` so a future agent can follow the link via episodic_get. Example: 'The user prefers concise bulleted summaries over long prose and expects markdown formatting by default [episodic id: 47].' If no episodic source exists (system prompt, user assertion, external knowledge), omit the bracket and set metadata.origin instead.",
    ),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe(
      "Optional key-value object for structured tags. Conventional keys: tags (list), confidence ('high'|'medium'|'low' or 0-1), origin (set when no episodic source bracket — 'system_prompt' / 'user_assertion' / 'external_kb' / 'inference'), valid_from / valid_until (ISO date for world-time validity), superseded_by (id of replacing row). Example: { tags: ['preferences','tooling'], confidence: 'high' }. NOT FTS5-indexed — bake searchable phrases into `data`. Stored as JSON; returned already parsed.",
    ),
});

async function handleSemanticCreate(
  input: z.infer<typeof SemanticCreateInput>,
) {
  if (!config.AGENT_NAME) {
    throw new Error(
      "AGENT_NAME is not set. Set it in the .mcp.json env block (or .env) before writing semantic memories.",
    );
  }
  const statement = database.prepare(`
    insert into semantic (agent, name, data, metadata)
    values (?, ?, ?, ?)
    returning *
  `);
  return parseMetadataInRow(
    statement.get(
      config.AGENT_NAME,
      input.name,
      input.data,
      serializeMetadata(input.metadata),
    ),
  );
}

export const SemanticCreate = {
  name: "semantic_create",
  description:
    "Store a stable per-agent fact in semantic memory — durable state the agent should treat as true unless or until contradicted (preferences, profiles, learned constants, configuration choices, taxonomy decisions). Semantic answers 'what is known'. Use episodic_create instead for one-off events even if they sound fact-like ('the user said X today'); use world_create when the fact should be visible to every agent on the server; use semantic_update (not a fresh create) when a row for this fact already exists. ALWAYS semantic_search the subject FIRST to avoid duplicating an existing row — duplicates poison future retrieval. Embed provenance inline in `data` as `[episodic id: <int>]` when the fact derives from a logged episodic event. Data is one declarative present-tense sentence with named subject; soft cap ~2000 chars (skill guidance). Returns the created row (id, agent, name, data, metadata, created_at, updated_at), automatically scoped to this MCP's AGENT_NAME.",
  input: SemanticCreateInput,
  handler: handleSemanticCreate,
};

// ─── semantic_get ───────────────────────────────────────────────────────────
const SemanticGetInput = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe(
      "Numeric id of the semantic fact to fetch — typically an id surfaced by a prior semantic_create, semantic_search, semantic_list, or semantic_update call.",
    ),
});

async function handleSemanticGet(input: z.infer<typeof SemanticGetInput>) {
  const statement = database.prepare(`
    select *
    from semantic
    where id = ?
  `);
  return parseMetadataInRow(statement.get(input.id));
}

export const SemanticGet = {
  name: "semantic_get",
  description:
    "Fetch a single semantic fact by id. Use after semantic_search or semantic_list returns a candidate worth examining in detail, to re-read a row you just created or updated, or to fetch the current value before calling semantic_update so you can preserve unchanged metadata keys (metadata REPLACES on update) AND the existing inline `[episodic id: <int>]` provenance brackets in `data` (which must be preserved + appended-to on update). Returns the row with parsed metadata, or null if no row matched.",
  input: SemanticGetInput,
  handler: handleSemanticGet,
};

// ─── semantic_list ──────────────────────────────────────────────────────────
const SemanticListInput = z.object({
  agent: z
    .string()
    .optional()
    .describe(
      "Filter to one agent's semantic store. Defaults to this MCP's AGENT_NAME; pass another agent name to read that agent's store. Omit and leave AGENT_NAME unset to list across all agents.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Max results (default 20). Lean small for spot checks; bump higher for a full sweep of what's known about an agent — useful at boot to ground yourself in the agent's persisted state before deciding what to do.",
    ),
});

async function handleSemanticList(input: z.infer<typeof SemanticListInput>) {
  const agent = input.agent || config.AGENT_NAME;
  const limit = input.limit || DEFAULT_SEMANTIC_LIMIT;

  if (agent) {
    const statement = database.prepare(`
      select *
      from semantic
      where agent = ?
      order by created_at desc
      limit ?
    `);
    return parseMetadataInRows(statement.all(agent, limit));
  }

  const statement = database.prepare(`
    select *
    from semantic
    order by created_at desc
    limit ?
  `);
  return parseMetadataInRows(statement.all(limit));
}

export const SemanticList = {
  name: "semantic_list",
  description:
    "List semantic facts newest-first across an agent's store, with no keyword filter. Use to scan what's known about a given agent — profile, preferences, learned constants — or for a boot-time grounding pass; reach for semantic_search instead when you have keywords or a topic in mind. Defaults to this MCP's AGENT_NAME; pass an explicit `agent` to read another agent's store. Returns rows with parsed metadata.",
  input: SemanticListInput,
  handler: handleSemanticList,
};

// ─── semantic_update ────────────────────────────────────────────────────────
const SemanticUpdateInput = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe(
      "Numeric id of the semantic fact to update — typically an id surfaced by a prior semantic_search, semantic_get, or semantic_list call.",
    ),
  name: z
    .string()
    .min(1)
    .optional()
    .describe(
      "New name (optional). Same conventions as semantic_create.name. Omit to leave the existing name unchanged.",
    ),
  data: z
    .string()
    .min(1)
    .optional()
    .describe(
      "New data (optional). Same conventions as semantic_create.data — one declarative present-tense sentence, soft cap ~2000 chars. When the update was prompted by a fresh observation, PRESERVE existing `[episodic id: <int>]` brackets and APPEND new ones (the audit trail accumulates). semantic_get the row first if you don't have the prior data text. Example: existing 'X prefers Y [episodic id: 47].' becomes 'X prefers Y [episodic id: 47][episodic id: 89].'. Omit to leave existing data unchanged.",
    ),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe(
      "Replacement metadata object (optional). REPLACES the metadata entirely; it does NOT merge — if you want to preserve some existing keys, semantic_get the row first and pass the merged result. Omit to leave metadata unchanged.",
    ),
});

async function handleSemanticUpdate(
  input: z.infer<typeof SemanticUpdateInput>,
) {
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
    update semantic
    set ${sets.join(", ")}
    where id = ?
    returning *
  `);
  return parseMetadataInRow(statement.get(...params));
}

export const SemanticUpdate = {
  name: "semantic_update",
  description:
    "Update a semantic fact in place — mutate name, data, and/or metadata of an existing row and bump updated_at. Use whenever a fact has been refined, corrected, or contradicted; semantic is mutable in place — revise rather than delete+recreate (which would lose the row id and any external references). Unlike episodic (append-only), semantic and world are both mutable. Two contract behaviors to remember: (1) metadata REPLACES — semantic_get first if you need to preserve other keys; (2) when the update is prompted by a fresh episodic event, the new `data` text must PRESERVE existing `[episodic id: <int>]` brackets and APPEND a new one — the audit trail accumulates inside `data`. The FTS5 mirror refreshes via trigger. Provide at least one of name / data / metadata. Returns the updated row, or null if no row matched.",
  input: SemanticUpdateInput,
  handler: handleSemanticUpdate,
};

// ─── semantic_delete ────────────────────────────────────────────────────────
const SemanticDeleteInput = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe(
      "Numeric id of the semantic fact to delete — typically an id surfaced by a prior semantic_create, semantic_search, semantic_list, or semantic_update call.",
    ),
});

async function handleSemanticDelete(
  input: z.infer<typeof SemanticDeleteInput>,
) {
  const statement = database.prepare(`
    delete from semantic
    where id = ?
    returning *
  `);
  return parseMetadataInRow(statement.get(input.id));
}

export const SemanticDelete = {
  name: "semantic_delete",
  description:
    "Delete a single semantic fact by id. Use only when a fact no longer applies AT ALL — when a fact has merely changed or been refined, prefer semantic_update for in-place revision (which preserves the row id, the audit trail in `data` brackets, and any external references); when the fact has been promoted to world_*, delete here only AFTER the world row is in place. The FTS5 mirror is kept in sync via trigger. Returns the deleted row, or null if no row matched.",
  input: SemanticDeleteInput,
  handler: handleSemanticDelete,
};

// ─── semantic_search ────────────────────────────────────────────────────────
const SemanticSearchInput = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'FTS5 MATCH expression evaluated against the `data` column ONLY — `name` and `metadata` are NOT indexed and NOT searchable. Words match as AND implicitly; use uppercase OR, NOT, or "quoted phrases" for finer control. Avoid bare `=` (FTS5 rejects it) and bare ISO date fragments like 2026-06-16 (parsed as column references — wrap them in quotes). No stemming. Example: \'preferred OR preferences\'. To reverse-lookup which semantic rows cite a given episodic event, use a quoted phrase: \'"episodic id: 47"\'.',
    ),
  agent: z
    .string()
    .optional()
    .describe(
      "Filter to one agent's semantic store. Defaults to this MCP's AGENT_NAME; pass another agent name to read that agent's store. Omit and leave AGENT_NAME unset (rare) to search across all agents.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Max results to return (default 20). Keep small for targeted lookups; bump higher when grabbing a wide swath of an agent's state in one pass.",
    ),
  sort: z
    .enum(["relevant", "recent"])
    .optional()
    .describe(
      "'relevant' (default) = FTS5 BM25 rank — best when keyword density signals importance. 'recent' = newest matching fact first by created_at — use when a fact has likely been re-recorded and you want the freshest entry over an older, denser one.",
    ),
});

async function handleSemanticSearch(
  input: z.infer<typeof SemanticSearchInput>,
) {
  const agent = input.agent || config.AGENT_NAME;
  const limit = input.limit || DEFAULT_SEMANTIC_LIMIT;
  const orderBy =
    input.sort === "recent" ? "m.created_at desc, m.id desc" : "rank";

  if (agent) {
    const statement = database.prepare(`
      select m.*
      from semantic_fts f
      join semantic m on m.id = f.rowid
      where semantic_fts match ?
        and m.agent = ?
      order by ${orderBy}
      limit ?
    `);
    return parseMetadataInRows(statement.all(input.query, agent, limit));
  }

  const statement = database.prepare(`
    select m.*
    from semantic_fts f
    join semantic m on m.id = f.rowid
    where semantic_fts match ?
    order by ${orderBy}
    limit ?
  `);
  return parseMetadataInRows(statement.all(input.query, limit));
}

export const SemanticSearch = {
  name: "semantic_search",
  description:
    "Full-text search semantic facts (durable per-agent state) via SQLite FTS5 / BM25. The `data` column is the ONLY indexed field — `name` and `metadata` are not searchable; phrase data at write time the way a future agent would search for it. Reach for this when looking up what is *known* — profile attributes, preferences, learned constants, taxonomy decisions. ALWAYS call this before semantic_create to avoid duplicating a row; if a near-match exists, use semantic_update instead. Inline `[episodic id: <int>]` provenance brackets in `data` are searchable as quoted phrases (e.g. '\"episodic id: 47\"') for reverse-lookup. Default sort is FTS5 relevance; switch to sort='recent' for the freshest match. Returns matching rows with parsed metadata.",
  input: SemanticSearchInput,
  handler: handleSemanticSearch,
};
