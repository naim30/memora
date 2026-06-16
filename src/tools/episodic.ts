import { z } from "zod";
import { config } from "../config/config.js";
import { database } from "../database/db.js";
import {
  parseMetadataInRow,
  parseMetadataInRows,
  serializeMetadata,
} from "../lib/metadata.js";

const DEFAULT_EPISODIC_LIMIT = 20;

// ─── episodic_create ────────────────────────────────────────────────────────
const EpisodicCreateInput = z.object({
  name: z
    .string()
    .min(1)
    .describe(
      "Short label naming this event — used for human scanning and as a coarse dedup key. Convention: snake_case verb-or-noun phrase tied to the action or outcome. Examples spanning different agent kinds: 'task_completed', 'user_correction_received', 'tool_call_failed', 'pull_request_merged', 'data_sync_succeeded', 'meeting_summary_drafted'. NOT indexed by FTS5 — this is a label, not a searchable phrase.",
    ),
  data: z
    .string()
    .min(1)
    .describe(
      "The event itself, in natural language — what happened, who/what was involved, the outcome or next step. ONE self-contained sentence (target 100-500 chars; soft cap ~2000 — compress if larger, see SKILL.md). Past tense, named actor (no bare 'user' / 'they'). Store the derived signal, not the raw transcript. Example: 'support_bot resolved the user-reported failure in the nightly job; root cause was a rotated credential; updated the config and verified the next run succeeded.' The id returned by this call is what future semantic_* or world_* rows will cite as inline `[episodic id: <int>]` brackets.",
    ),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe(
      "Optional key-value object for structured tags. Common keys: tags (list), source (external system the event came from, e.g. 'github' / 'zendesk'), refs (related ids — PR numbers, ticket ids), priority/severity, outcome/status. Example: { tags: ['cron','ops'], source: 'github', refs: ['issue_214'], outcome: 'resolved' }. Stored as JSON; returned already parsed. NOT FTS5-indexed.",
    ),
});

async function handleEpisodicCreate(
  input: z.infer<typeof EpisodicCreateInput>,
) {
  const statement = database.prepare(`
    insert into episodic (agent, name, data, metadata)
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

export const EpisodicCreate = {
  name: "episodic_create",
  description:
    "Append a timestamped per-agent event to episodic memory — an observation of something that happened (action taken, outcome reached, decision made, externally-observed change). Episodic is the append-only substrate from which stable facts (semantic_*) and shared knowledge (world_*) are later derived; the returned `id` is what those derived rows will cite via inline `[episodic id: <int>]` brackets in their `data`. Use semantic_create instead for durable per-agent facts that describe state (preferences, profiles, learned constants); use world_create for facts shared across all agents; do not use episodic for raw transcripts, plans you have not acted on, speculation, or restatements of items already in semantic. Data is one self-contained past-tense sentence with named actors; soft cap ~2000 chars (skill guidance). Returns the created row (id, agent, name, data, metadata, created_at, updated_at), automatically scoped to this MCP's AGENT_NAME.",
  input: EpisodicCreateInput,
  handler: handleEpisodicCreate,
};

// ─── episodic_get ───────────────────────────────────────────────────────────
const EpisodicGetInput = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe(
      "Numeric id of the episodic event to fetch — typically an id surfaced by a prior episodic_create, episodic_search, or episodic_list call, or by following an `[episodic id: <int>]` bracket from a semantic/world row's `data`.",
    ),
});

async function handleEpisodicGet(input: z.infer<typeof EpisodicGetInput>) {
  const statement = database.prepare(`
    select *
    from episodic
    where id = ?
  `);
  return parseMetadataInRow(statement.get(input.id));
}

export const EpisodicGet = {
  name: "episodic_get",
  description:
    "Fetch a single episodic event by id. Use after episodic_search or episodic_list returns a candidate worth examining in detail, to re-read a row you just created, or to follow an `[episodic id: <int>]` bracket cited in a semantic/world row's `data` for the full source event. Returns the row with parsed metadata, or null if no row matched.",
  input: EpisodicGetInput,
  handler: handleEpisodicGet,
};

// ─── episodic_list ──────────────────────────────────────────────────────────
const EpisodicListInput = z.object({
  agent: z
    .string()
    .optional()
    .describe(
      "Filter to one agent's episodic stream. Defaults to this MCP's AGENT_NAME; pass another agent name to read that agent's stream. Omit and leave AGENT_NAME unset to list across all agents.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Max results (default 20). Lean small for 'what just happened?' peeks; bump to 150+ for boot-time context loads where you need a full picture of the recent stream before deciding what to do.",
    ),
});

async function handleEpisodicList(input: z.infer<typeof EpisodicListInput>) {
  const agent = input.agent || config.AGENT_NAME;
  const limit = input.limit || DEFAULT_EPISODIC_LIMIT;

  if (agent) {
    const statement = database.prepare(`
      select *
      from episodic
      where agent = ?
      order by created_at desc
      limit ?
    `);
    return parseMetadataInRows(statement.all(agent, limit));
  }

  const statement = database.prepare(`
    select *
    from episodic
    order by created_at desc
    limit ?
  `);
  return parseMetadataInRows(statement.all(limit));
}

export const EpisodicList = {
  name: "episodic_list",
  description:
    "List episodic events newest-first across an agent's stream, with no keyword filter. Use for time-bounded review ('what happened in the last day?') or for boot-time recency scans before deciding what to do; reach for episodic_search instead when you have keywords or a topic in mind. Defaults to this MCP's AGENT_NAME; pass an explicit `agent` to read another agent's stream. Returns rows with parsed metadata.",
  input: EpisodicListInput,
  handler: handleEpisodicList,
};

// ─── episodic_delete ────────────────────────────────────────────────────────
const EpisodicDeleteInput = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe(
      "Numeric id of the episodic event to delete — typically an id surfaced by a prior episodic_create, episodic_search, or episodic_list call.",
    ),
});

async function handleEpisodicDelete(
  input: z.infer<typeof EpisodicDeleteInput>,
) {
  const statement = database.prepare(`
    delete from episodic
    where id = ?
    returning *
  `);
  return parseMetadataInRow(statement.get(input.id));
}

export const EpisodicDelete = {
  name: "episodic_delete",
  description:
    "Delete a single episodic event by id — typically used to drop a clear duplicate, correct a wrong entry, or remove a row whose content has been fully promoted into semantic_* or world_*. The FTS5 mirror is kept in sync via trigger. Returns the deleted row, or null if no row matched. Episodic is append-friendly: when in doubt, prefer adding a correcting follow-up event over deleting unless the original is clearly noise. WARNING: any semantic_* or world_* rows that cite this id via `[episodic id: <int>]` brackets in their `data` will be left with orphaned references — that's intentional (tombstone audit trail), but plan accordingly.",
  input: EpisodicDeleteInput,
  handler: handleEpisodicDelete,
};

// ─── episodic_search ────────────────────────────────────────────────────────
const EpisodicSearchInput = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'FTS5 MATCH expression evaluated against the `data` column ONLY — `name` and `metadata` are NOT indexed and NOT searchable. Words match as AND implicitly; use uppercase OR, NOT, or "quoted phrases" for finer control. Avoid bare `=` (FTS5 rejects it) and bare ISO date fragments like 2026-06-15 (parsed as column references — wrap them in quotes). No stemming: "run" does not match "running". Example: \'"rate limit" OR "throttle exceeded"\'.',
    ),
  agent: z
    .string()
    .optional()
    .describe(
      "Filter to one agent's episodic stream. Defaults to this MCP's AGENT_NAME; pass another agent name to read that agent's stream. Omit and leave AGENT_NAME unset (rare) to search across all agents.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Max results to return (default 20). Keep small for targeted lookups; bump to 150+ for boot-time history sweeps where you need a full picture of recent matching context.",
    ),
  sort: z
    .enum(["relevant", "recent"])
    .optional()
    .describe(
      "'relevant' (default) = FTS5 BM25 rank — best when keyword density signals importance. 'recent' = newest matching event first by created_at — use when you want the latest matching event ('last run of job X', 'most recent failure of task Y') and don't want a denser old log row outranking a fresher short one.",
    ),
});

async function handleEpisodicSearch(
  input: z.infer<typeof EpisodicSearchInput>,
) {
  const agent = input.agent || config.AGENT_NAME;
  const limit = input.limit || DEFAULT_EPISODIC_LIMIT;

  let orderBy = "rank";
  if (input.sort === "recent") {
    orderBy = "m.created_at desc, m.id desc";
  }

  if (agent) {
    const statement = database.prepare(`
      select m.*
      from episodic_fts f
      join episodic m on m.id = f.rowid
      where episodic_fts match ?
        and m.agent = ?
      order by ${orderBy}
      limit ?
    `);
    return parseMetadataInRows(statement.all(input.query, agent, limit));
  }

  const statement = database.prepare(`
    select m.*
    from episodic_fts f
    join episodic m on m.id = f.rowid
    where episodic_fts match ?
    order by ${orderBy}
    limit ?
  `);
  return parseMetadataInRows(statement.all(input.query, limit));
}

export const EpisodicSearch = {
  name: "episodic_search",
  description:
    "Full-text search episodic events (timestamped per-agent observations) via SQLite FTS5 / BM25. The `data` column is the ONLY indexed field — `name` and `metadata` are not searchable, so phrase data at write time the way a future agent would search for it. Reach for this when looking up what *happened* — events, actions, outcomes, decisions; use semantic_search for what is *known* (stable facts) and world_search for cross-agent shared facts. Default sort is FTS5 relevance — switch to sort='recent' when you want the latest matching event and a denser old log row would otherwise outrank a fresher short one. Returns matching rows with parsed metadata, ordered by the chosen ranking.",
  input: EpisodicSearchInput,
  handler: handleEpisodicSearch,
};
