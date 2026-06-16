---
name: memora
description: Use when the user asks to remember, recall, save, log, look up prior activity, store a stable fact, update something that changed, or check what's known across agents — and proactively at the start of a session or after meaningful work concludes. Memora is a persistent agent-memory MCP exposing three CoALA-aligned tiers (episodic per-agent events, semantic per-agent facts, world cross-agent shared facts) via 16 tools. General-purpose — applies to any agent family: coding, research, customer support, devops, scheduling, persona, or otherwise.
---

# Memora

Persistent agent memory across sessions via the Memora MCP. Three SQL + FTS5 tiers, one embedded file, one identity per consumer (set by `AGENT_NAME` in the project's `.mcp.json`).

Memora is general-purpose — the same tools serve any agent family. Nothing below is domain-specific.

## When to call memora

- **Session start (optional grounding):** if persisted state matters for the task, call `semantic_list` to ground in the agent's preferences/profile/learned constants.
- **Mid-session lookup:** before answering anything about prior activity, `*_search` the right tier.
- **End of useful work:** capture events to episodic, stable facts to semantic, cross-agent truths to world.
- **On contradiction:** update the stale fact in place via `semantic_update` / `world_update` — never accumulate parallel rows.

## The three tiers

| Tier | Role | Scope | Mutation |
|---|---|---|---|
| **episodic** | "what happened" — timestamped per-agent observations | per-agent | append-only (no `_update`) |
| **semantic** | "what is known" — durable per-agent state | per-agent | mutable in place |
| **world** | "what is known across all agents" — shared facts | server-wide | mutable in place |

Procedural memory (skills / system prompts) lives in the agent's prompt — not in memora.

## The 16 tools

| Family | Tools |
|---|---|
| `episodic_*` | `create(name, data, metadata?)`, `get(id)`, `list(agent?, limit?)`, `search(query, agent?, limit?, sort?)`, `delete(id)` |
| `semantic_*` | `create(name, data, metadata?)`, `get(id)`, `list(agent?, limit?)`, `update(id, name?, data?, metadata?)`, `delete(id)`, `search(query, agent?, limit?, sort?)` |
| `world_*` | `create(name, data, metadata?)`, `get(id)`, `update(id, name?, data?, metadata?)`, `delete(id)`, `search(query, limit?, sort?)` |

Every row returns: `{id, agent?, name, data, metadata, created_at, updated_at}`. Metadata is parsed JSON.

## Five hard rules

1. **FTS5 only indexes `data`.** `name` and `metadata` are NOT searchable. Bake the searchable phrase into `data`.
2. **Always search the right tier before writing.** Dedup is your job, not memora's.
3. **Tier rules are absolute.** Events → episodic, per-agent state → semantic, cross-agent truths → world. Putting a fact in the wrong tier corrupts retrieval.
4. **Store distilled signal, not transcripts.** One self-contained sentence per row, third-person, named subjects.
5. **Provenance lives inline in `data` as `[episodic id: <int>]` brackets** (`<agent_name>/<int>` in world). Preserve prior brackets on update; append new ones.

## Deep-dive references — load on demand

Load the relevant file before acting when the situation demands more detail than this entry covers:

- **Picking the right tier** → [references/picking-the-tier.md](references/picking-the-tier.md)
- **How to write `data`/`name`/`metadata` per tier** → [references/memory-structure.md](references/memory-structure.md)
- **Size guideline + compression strategy** → [references/compression.md](references/compression.md)
- **Provenance via inline brackets** → [references/provenance.md](references/provenance.md)
- **FTS5 search, dedup, reverse-lookup** → [references/search-and-fts5.md](references/search-and-fts5.md)
- **Anti-patterns — what NOT to do** → [references/anti-patterns.md](references/anti-patterns.md)
- **Worked examples per agent kind** → [references/examples.md](references/examples.md)

## Scoping & identity

`AGENT_NAME` (from the project's `.mcp.json` env block) scopes episodic + semantic writes/reads. World ignores `AGENT_NAME`. `AGENT_NAME` is frozen at module import — restart the server to change it.

## What memora is NOT for

- Working memory / prompt scratchpad
- Transient session state (current draft, current scroll)
- Bulk logging / observability
- Document storage (use a summary + URI in memora; store the doc elsewhere)
- Secrets, credentials, full PII
