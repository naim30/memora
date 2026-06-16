# Provenance — inline `[episodic id: ...]` tokens

Provenance is the audit trail from a derived semantic or world fact back to the episodic event(s) that motivated it. In memora, provenance lives **inline inside `data`** as bracketed tokens — no separate column, no extra parameter.

## Format

### Semantic — bare integer

```
"The user prefers TypeScript with strict mode enabled by default for new files [episodic id: 89]."
```

The integer is the `id` of the episodic row that produced this fact. Semantic rows are already agent-scoped (the row carries `agent`), so no agent prefix needed.

### World — `<agent_name>/<int>` prefix REQUIRED

```
"Public API rate limit is 100 req/min per IP; bypass requires written sign-off from oncall [episodic id: ops_agent/102][episodic id: support_bot/47]."
```

World rows are cross-agent. Episodic ids are NOT globally unique — agent A's episodic 47 is a different row from agent B's episodic 47. The `<agent_name>/` prefix disambiguates.

## Placement

Place the bracket(s) at the end of the data sentence, before the closing punctuation:

- ✅ `"The user prefers email over phone [episodic id: 47]."`
- ❌ `"The user prefers email [episodic id: 47] over phone."` — interrupts the sentence flow

For multiple brackets, concatenate directly:

- ✅ `"... [episodic id: 47][episodic id: 89]."`
- ❌ `"... [episodic id: 47, 89]."` — non-standard, not searchable as a phrase

## When no episodic source exists

If the fact came from the system prompt, an unrecorded user assertion, or external knowledge — omit the bracket entirely and record the origin in metadata:

```
semantic_create({
  name: "coala_definition",
  data: "CoALA stands for Cognitive Architectures for Language Agents (Sumers et al. 2023, arXiv:2309.02427) — the canonical four-tier frame.",
  metadata: { origin: "external_kb", tags: ["glossary"] }
})
```

Conventional `origin` values:
- `"system_prompt"` — the agent's own prompt asserts the fact
- `"user_assertion"` — the user told the agent directly, without a logged episodic event
- `"external_kb"` — external knowledge base, paper, docs
- `"inference"` — derived by the agent from multiple unlogged signals

**Never invent an episodic id** to satisfy the format. An invented id is worse than no id — it points at a different row, breaking the audit trail.

## Append-on-update — preserve prior brackets

When `semantic_update` or `world_update` revises the data because of a fresh observation, the LLM must:

1. `*_get` the current row (or use it from context if already loaded).
2. Write new `data` that preserves the existing `[episodic id: ...]` brackets.
3. Append the new bracket(s) for the fresh observation.

```
// Before: data = "User prefers email over phone for follow-ups [episodic id: 47]."

// Fresh observation episodic_id: 89 reinforced the fact.
semantic_update({
  id: 12,
  data: "User prefers email over phone for follow-ups [episodic id: 47][episodic id: 89]."
})
```

The audit trail accumulates inside the `data` string itself. This is the only field where "append" is the operation — metadata REPLACES.

## Source episodic row deleted later

The orphaned bracket remains in `data` as a tombstone. The audit trail survives the source. Memora does not cascade deletes — intentionally. If the bracket points at a non-existent id, it's a known orphan, not an error.

If you want to clean up tombstones, you can `semantic_update` with rewritten `data` that drops the bracket(s) — but this discards audit. Usually better to leave them.

## Reverse lookup — "which facts cite episodic 47?"

Use FTS5 quoted-phrase search:

```
// "Which semantic rows cite episodic 47?"
semantic_search('"episodic id: 47"')

// "Which world rows cite ops_agent's episodic event 102?"
world_search('"episodic id: ops_agent 102"')   // FTS5 tokenizer drops the slash; use space
```

This works because brackets live in `data`, and `data` is FTS5-indexed.

## Why inline (not a separate column)

The structured-column approach (`source_episodic_ids: int[]`) was considered and rejected. Inline wins for memora because:

- Simpler architecture (no schema column, no merge logic)
- Discoverable by reading the row — no schema knowledge needed
- FTS5-searchable for free
- Matches how humans write inline citations
- The LLM that reads the row sees the bracket and can call `episodic_get(<id>)` immediately

The tradeoff: the LLM must remember the format and preserve brackets on update. This skill enforces the policy.

## Provenance checklist before every write/update

- [ ] If the fact came from a logged episodic event → bracket(s) in `data`?
- [ ] Semantic: bare int form `[episodic id: <int>]`?
- [ ] World: `<agent_name>/<int>` prefix included?
- [ ] On update: are existing brackets preserved?
- [ ] No episodic source: is `metadata.origin` set?
- [ ] No invented ids?
