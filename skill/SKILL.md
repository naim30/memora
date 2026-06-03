---
name: memora
description: Persist and recall agent memory through the Memora MCP — store events as episodic notes, evolve procedural rules and semantic facts in markdown, and search past sessions. Use when the user asks to remember, recall, save, log, look up history, or check what was learned previously; at the start of any session that has memora tools available so prior context can be loaded; or when you notice a recurring pattern worth promoting to durable knowledge.
---

# Memora

Persistent agent memory across sessions via the Memora MCP server. Two storage layers, six tools, one identity per project (set by `AGENT_NAME`).

## When to Use

Whenever this project's MCP config registers a `memora` server (you'll see `memory_create`, `memory_search`, `memory_list`, `memory_delete`, `knowledge_read`, `knowledge_write` in the tool list). At session start, read the agent's procedural + semantic markdown to absorb its operating frame. Mid-session, search history before answering questions about prior activity. When useful work concludes, capture what's worth keeping.

## Memory layers

Two storage types × two scopes:

|                                       | **agent** scope (this `AGENT_NAME`) | **global** scope (shared across agents) |
|---------------------------------------|-------------------------------------|------------------------------------------|
| **Episodic** (SQLite + FTS5, timestamped) | `memory_create / memory_search / memory_list / memory_delete` — events, observations, outcomes | same store; pass `agent: "<name>"` to read another agent's notes |
| **Procedural** (markdown file)        | `knowledge_read("procedural")` / `knowledge_write("procedural")` — replayable how-to rules for this agent | `..., scope: "global"` — universal procedures every agent should follow |
| **Semantic** (markdown file)          | `knowledge_read("semantic")` / `knowledge_write("semantic")` — facts about this agent's domain | `..., scope: "global"` — facts every agent should know |

Default scope is `agent`. Promote to `global` only when something genuinely applies to every agent.

## Tools overview

| Tool | Use when |
|------|----------|
| `memory_create(data)` | Recording a discrete event with a timestamp: an action taken, an outcome observed, a contact made. |
| `memory_search(query, agent?, limit?=10)` | Looking up a specific past event by keyword. FTS5 syntax: words = implicit AND, supports `OR`, `NOT`, `"quoted phrase"`. Anchor on proper nouns (company, person, ticket id, date). |
| `memory_list(agent?, limit?=20)` | Browsing recent activity newest-first. Good for "what happened this week?" — not for keyword lookup. |
| `memory_delete(id)` | Removing a duplicate, a mistaken entry, or an episodic note that's been promoted into procedural/semantic markdown. |
| `knowledge_read(type, scope?)` | Once at session start, and again immediately before any `knowledge_write` (read-before-write is mandatory — see below). |
| `knowledge_write(type, scope?, content)` | Adding or updating a durable rule or fact. **Replaces the entire file** — always read, edit, then write the merged result. |

## What goes where

**Episodic (`memory_create`)** — timestamped events that won't repeat:
- "Applied to Stripe Staff PM via Greenhouse — 2026-06-02."
- "Phone screen with Alex (Linear recruiter); pushed back on comp, said £160k base ceiling."
- "Datadog interviewer feedback: 'too theoretical on systems design'."

**Procedural (`knowledge_write("procedural")`)** — replayable rules that change future behavior:
- "When applying via Greenhouse, upload the PDF resume; `.docx` parses badly."
- "Send recruiter follow-ups Tue/Wed 10am local; skip Friday."
- "Before logging an application, `memory_search` the company name to avoid duplicates."

**Semantic (`knowledge_write("semantic")`)** — stable facts about the domain:
- "Targets Staff/Principal PM. Comp floor £140k base. Remote-UK or hybrid-London only."
- "Strongest narrative: rebuilt billing at Series-B fintech."
- "Lever auto-rejects when 'years of experience' < posted minimum, even by one."

**Promote to `global` scope only when:**
- The fact identifies the user universally (legal name, canonical contact email).
- The rule is policy-level for every agent ("never push to main without confirmation").
- The reference data many future agents will query (shared API quirks, shared vocabulary).

## Recall strategy

1. **Session start:** call `knowledge_read("procedural")` and `knowledge_read("semantic")` once. They're small and frame how to act. Skip if already in context this session.
2. **Specific historical lookup** ("did we apply to X?", "what did Y say?"): `memory_search` with proper-noun anchors. Don't pre-load search results "just in case" — every recalled token competes with the user's actual message.
3. **Time-bounded review** ("what did I do this week?"): `memory_list`, not `memory_search`.
4. **Don't re-read the markdown** mid-session unless you just wrote to it.

## Write workflow

**Before `memory_create`:**
1. `memory_search` for the key noun (company, person, ticket id). If a near-duplicate from the same day exists, skip.
2. Confirm it's an observation or outcome — not a plan step, not a tool-result echo, not transcript copy. Store the *derived insight*, not the raw exchange.
3. Record provenance inline when it isn't first-person: `"recruiter said ..."`, `"inferred from ..."`.

**Before `knowledge_write`:**
1. **Always `knowledge_read` first.** The write is a full-file replace — write blind and prior knowledge is gone.
2. Edit the returned string, then write the merged result.
3. If you're contradicting an earlier line, say so inline: `"Previously thought X; correcting to Y as of YYYY-MM-DD."`
4. Skip the write entirely if the change is trivial or duplicative.

**Promotion pattern:** when 3+ episodic notes carry the same lesson (e.g., five "Greenhouse rejected .docx" entries), promote the lesson into `procedural.md` and `memory_delete` the redundant episodic rows.

## Never write to memory

- Secrets, API keys, credentials, full PII (SSN, full bank numbers).
- The user's literal last message — store derived insight, not transcript.
- Speculation or predictions ("they'll probably reply Monday"). Only observed facts.
- Transient tool output (scraped HTML, captcha state, current page contents).
- Anything already in the system prompt or in the procedural/semantic files — duplication causes drift between sources.

## Common pitfalls

- **`knowledge_write` is destructive.** Read first. Every time.
- **FTS5 ≠ semantic search.** `memory_search` matches keywords, not meaning. Use proper nouns; quote multi-word phrases.
- **Boolean syntax:** spaces between words mean AND implicitly; use literal `OR`, `NOT`, `"…"`. Don't write SQL-style `AND`.
- **Agent isolation is by `AGENT_NAME`.** Each project's `.mcp.json` sets its own — episodic notes are filtered by it automatically. Pass an explicit `agent:` argument only to read another agent's memories on purpose.
- **Stale facts contaminate.** When correcting a fact in markdown, edit the existing line — don't just append the new one and let both sit.
- **No `memory_update` tool exists.** To revise an episodic note, `memory_create` the corrected version (with provenance) and `memory_delete` the wrong one.
