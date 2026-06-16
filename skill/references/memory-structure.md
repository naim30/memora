# Memory structure conventions

The shape of every memora row: `{id, agent?, name, data, metadata, created_at, updated_at}`. World omits `agent`. This file specifies how to populate `name`, `data`, and `metadata` for each tier.

## Universal rules (all tiers)

### 1. One self-contained sentence per row

A future agent reading the row alone — without surrounding context — must understand it. If you'd write bullet points, write multiple rows.

### 2. Third-person, named subjects

NEVER bare pronouns. *"User said yes"* fails because future-you doesn't know which user, or what the question was. *"Alice confirmed attendance at the team meeting"* works.

### 3. `name` is a short snake_case noun phrase

Names the *subject* of the row, not a sentence and not a hash. Stable enough to be a handle: `user_contact_pref`, `rate_limit_policy`, `deploy_succeeded`. Don't try to encode information in `name` — it's a label. FTS5 does not search it.

### 4. Disambiguate at write time, not read time

FTS5 only indexes `data`. If the disambiguating phrase lives in `name` or `metadata` only, retrieval won't find it. Bake it into `data`.

## Tier-specific phrasing

### `episodic_create` — past tense + named actor + outcome

Structure: `<actor> <past-tense verb> <object> [because/while <context>]`.

Good:
- `"support_bot resolved ticket #4421 by escalating to tier-2; user confirmed."`
- `"ops_agent deployed service-x v2.4.1 to prod; healthcheck green at 15:04 UTC."`
- `"research_bot reviewed arXiv:2502.12110 (A-MEM); extracted 4 key claims about agent memory."`
- `"User asked to enable dark mode; agent applied the change and confirmed in the live preview."`

Bad:
- `"User said yes"` — no actor named, no outcome
- `"Resolved ticket"` — no actor, no detail
- raw transcript copy

### `semantic_create` — present-tense durable state

Structure: `<subject> <present-tense verb> <object>`.

Good:
- `"The user prefers TypeScript with strict mode enabled by default for new files."`
- `"Default deployment region is us-east-1; us-west-2 reserved for DR."`
- `"Current research focus is agent-memory mechanisms 2024-2026."`
- `"User's preferred contact channel is email; phone only for emergencies."`

Bad:
- `"The user said yes today"` — that's an event, belongs in episodic
- `"User prefers X"` — bare pronoun, no actor

### `world_create` — present-tense, third-person, NO 'I/you/the agent'

World rows are read by ANY agent on the server. Name actors explicitly so another agent can act on the row without knowing who wrote it.

Good:
- `"Public API rate limit is 100 req/min per IP; bypass requires written sign-off from oncall."`
- `"Tier-2 routes to oncall@example.com between 09:00-17:00 UTC; out-of-hours goes to pager."`
- `"Org's all-hands runs every other Friday at 15:00 UTC; non-attendance requires a written summary within 48 hours."`

Bad:
- `"I will route tier-2 tickets to oncall"` — first-person, only the writer knows what "I" means
- `"The agent escalates tier-2"` — which agent?

## Metadata vocabulary (canonical keys)

These keys recur across the field. Use them when they apply:

- `tags: string[]` — coarse topical grouping
- `origin: string` — where the fact came from when no episodic source exists (`"system_prompt"`, `"user_assertion"`, `"external_kb"`)
- `confidence: "high"|"medium"|"low"` or 0-1
- `valid_from`, `valid_until` (ISO date) — world-time validity (different from `created_at`/`updated_at` which are system-time)
- `superseded_by: number` — id of a row that replaces this one
- `thread_id`, `seq`, `of: number` — for split-with-link episodic chunks (see [compression.md](compression.md))
- `source: string` — external system the row came from (e.g., `"github"`, `"zendesk"`)
- `refs: string[]` — external references (PR numbers, ticket ids, doc paths)

Metadata is stored as JSON and returned already parsed. On `*_update`, metadata REPLACES (does not merge) — `*_get` the row first if you need to preserve other keys.

## Size guideline

Target 100-500 chars per `data` field. Soft cap ~2000 chars (industry convention; not enforced by the server). When content would exceed the cap, see [compression.md](compression.md) for the strategy.

## Phrasing checklist before every write

- [ ] One self-contained sentence
- [ ] Subject named (no bare pronouns)
- [ ] Correct tense for the tier (past for episodic, present for semantic/world)
- [ ] Disambiguating context inside `data` (not in `name` only)
- [ ] Under 2000 chars (compress if not)
- [ ] Provenance bracket if derived from an episodic event (see [provenance.md](provenance.md))
