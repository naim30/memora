# Search, dedup, and reverse-lookup

All `*_search` tools use SQLite FTS5 with BM25 ranking. This file specifies what FTS5 will and will not do, the dedup pattern that prevents duplicate-row pollution, and reverse-lookup workflows.

## What FTS5 indexes

**ONLY the `data` column.** `name` and `metadata` are NOT indexed. If the keyword you want to find isn't in `data`, search will not find the row — even if the keyword is in `name` or `metadata.tags`.

This is why the [memory-structure.md](memory-structure.md) rule "disambiguate at write time" exists. Bake the searchable phrase into `data` at write time.

## Search syntax

- **Words match as AND implicitly.** `rate limit` (unquoted) = both words must appear, in any order.
- **OR / NOT must be uppercase.** Lowercase `or` is matched as a literal word.
- **Quoted phrases match exact word sequences.** `'"deployment window"'` = those two words adjacent, in that order.
- **No bare `=`.** FTS5 rejects it as a syntax error.
- **No bare ISO date fragments.** `2026-06-15` parses as a column reference (because of the hyphens). Wrap in quotes: `'"2026-06-15"'`.
- **No stemming.** "run" does not match "running". Use proper nouns, exact words, distinctive identifiers.

## Examples

- `'"rate limit" OR "throttle exceeded"'` — match either exact phrase
- `'error NOT "warning"'` — events containing "error" but not "warning"
- `'"escalation_path" OR "tier-2"'` — find rows about escalation
- `'"episodic id: 47"'` — reverse-lookup provenance (see [provenance.md](provenance.md))

## Sort modes

- `sort: "relevant"` (default) — FTS5 BM25 rank. Best when keyword density signals importance.
- `sort: "recent"` — newest matching row first. For episodic/semantic this orders by `created_at`; for world it orders by `updated_at` (because world rows mutate in place).

Pass `sort: "recent"` when:
- You want the latest matching event ("last run of job X")
- You want a freshly-revised fact (denser old entries would otherwise outrank short fresh ones)

## Dedup before write — the universal pattern

Memora does NOT deduplicate for you. Duplicate rows poison future retrieval. The pattern for every `*_create`:

1. `*_search` for the subject / key noun.
2. If a near-match exists:
   - **semantic / world**: use `*_update` to revise in place. Append `[episodic id: ...]` brackets if appropriate.
   - **episodic**: skip if the new content is identical to one already in the same minute. Distinct moments are distinct events — keep them.
3. If no match → `*_create`.

```
// Pattern for semantic
const matches = await semantic_search("preferred_language OR preference");
if (matches.length > 0) {
  // existing row — update in place
  await semantic_update({
    id: matches[0].id,
    data: matches[0].data + " [episodic id: 89]"  // append bracket
  });
} else {
  await semantic_create({ name: "preferred_language", data: "...", metadata: {...} });
}
```

## When skip is right

Skip a write when:
- The episodic event you'd log is identical to one already logged in the same minute.
- The semantic fact is unchanged (no new information vs the existing row).
- The world fact is already up to date.

Memora is for *meaningful* writes — not every turn. Excess writes drown future search.

## Reverse-lookup — find what cites a given event

Because `[episodic id: ...]` brackets live in `data`, you can find all facts that derive from a given episodic event:

```
// "Which semantic rows cite episodic 47?"
semantic_search('"episodic id: 47"')

// "Which world rows cite ops_agent's episodic event 102?"
world_search('"episodic id: ops_agent 102"')   // FTS5 tokenizer drops the slash; use space
```

## Boot-time grounding scan

If your agent has persisted state that matters for the task:

```
// Get the agent's full per-agent state
semantic_list({ limit: 50 })
// → array of { id, agent, name, data, metadata, ... }

// Optional: fold known world facts that affect this agent's domain
world_search("policy OR rate_limit OR holiday")
```

Skip the boot scan for one-shot tasks where prior state doesn't matter.

## Reading another agent's memory

By default, `*_list` and `*_search` filter to this MCP's `AGENT_NAME`. Pass an explicit `agent` to read another agent's rows:

```
// Check what support_bot has learned about a user
semantic_search({ query: "user_contact_pref", agent: "support_bot" })

// World is unscoped — every agent reads the same rows
world_search("deployment window")
```

## Failure modes to anticipate

- **Search returns nothing for a multi-word query.** FTS5 treats spaces as AND. Quote phrases (`'"exact match"'`) or split with `OR`.
- **Search returns old logs above the newest match.** Default ordering is FTS5 relevance, so denser old entries can outrank fresher short ones. Pass `sort: "recent"`.
- **Search returns nothing for what you "stored" but in `name`.** The signal lives in `name` only; FTS5 didn't index it. Rewrite to put the phrase in `data`.
- **Search throws on a query with `=` or a bare ISO date.** Quote dates; remove `=`.
- **Search returns synonyms-don't-match surprise.** "run" doesn't match "running". FTS5 has no stemming or semantic similarity. Match exact tokens.
