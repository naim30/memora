# memora

Persistent agent memory MCP. Two storage layers behind one stdio server:

- **Episodic** — timestamped notes in SQLite + FTS5. What happened, when.
- **Procedural + semantic** — markdown files. How to do things, what's true.

Wire it into a project's `.mcp.json`, set an `AGENT_NAME`, and any Claude Code (or other stdio-MCP) agent in that project gets six tools for reading and writing durable memory across sessions.

## Tools at a glance

| Tool | Use when |
|---|---|
| `memory_create(data)` | Recording a timestamped event or observation. |
| `memory_search(query, agent?, limit?=10)` | Looking up a past event by keyword. FTS5 — words = implicit AND; supports `OR`, `NOT`, `"quoted phrase"`. |
| `memory_list(agent?, limit?=20)` | Browsing recent activity newest-first. |
| `memory_delete(id)` | Removing a duplicate or wrong entry. |
| `knowledge_read(type, scope?)` | Loading procedural rules or semantic facts from markdown. |
| `knowledge_write(type, scope?, content)` | **Replacing** the procedural or semantic file. Always `knowledge_read` first. |

`type` = `"procedural" \| "semantic"`. `scope` = `"agent" \| "global"` (default `"agent"`).

> The companion skill at [`skill/SKILL.md`](skill/SKILL.md) covers *when* to call which tool, dedup/staleness rules, and the read-before-write workflow. README = wiring. Skill = policy.

## Quick start

Three steps to wire memora into a project.

### 1. Build memora once

```bash
cd memora
npm install
npm run build
```

Requires Node ≥ 22.14. Produces `dist/server.js` — the stdio entry point.

### 2. Register it in your project's `.mcp.json`

In any sibling project:

```jsonc
{
  "mcpServers": {
    "memora": {
      "type": "stdio",
      "command": "node",
      "args": ["../memora/dist/server.js"],
      "env": {
        "AGENT_NAME": "your-agent-name",
        "AGENT_MEMORA_PATH": "/absolute/path/to/this/project"
      }
    }
  }
}
```

- **`AGENT_NAME`** — set this per project. It scopes episodic rows (the `agent` column) and the agent markdown subdirectory. If unset it defaults to `"default"`, which means every project that forgets to set it will share one memory pool.
- **`AGENT_MEMORA_PATH`** — optional. When set, the agent's `procedural.md` and `semantic.md` live under `<this path>/<AGENT_NAME>/` instead of inside memora's own `data/`. Useful for keeping each project's notes next to its source.
- **`args` path** — shown as a sibling-folder relative path. Adjust if memora lives elsewhere.

### 3. Verify the connection

From a Claude Code session in that project, call:

```
knowledge_read({ type: "procedural" })
```

A fresh install returns `{ ok: true, content: "" }`. Empty content = working, not broken — the file is created on first `knowledge_write`.

## Install the paired skill

The MCP exposes tools; the skill teaches agents *when* to use them. Symlink it once into your user-global skills folder and every project picks it up:

```bash
ln -s /absolute/path/to/memora/skill ~/.claude/skills/memora
```

After this, every Claude Code session shows a `memora` skill in its skill list. The skill covers read-before-write, dedup, the agent-vs-global scoping rules, and what **not** to store. See [`skill/SKILL.md`](skill/SKILL.md) for the full guidance.

## Where data lives

By default everything lives inside memora's own `data/`:

```
memora/data/
├── memory.db                 ← episodic SQLite store (all agents, filtered by agent column)
├── agents/
│   └── <AGENT_NAME>/
│       ├── procedural.md     ← this agent's how-to rules
│       └── semantic.md       ← this agent's domain facts
└── global/
    ├── procedural.md         ← shared across all agents
    └── semantic.md           ← shared across all agents
```

> `AGENT_MEMORA_PATH` pushes only the `agents/<AGENT_NAME>/` subtree elsewhere — the SQLite database stays inside memora. `MEMORA_PATH` relocates the entire tree.

## Daily ops loop

The intended rhythm for an agent using memora:

1. **Session start** — `knowledge_read("procedural")` + `knowledge_read("semantic")` to absorb operating context.
2. **Mid-session** — `memory_search` with proper-noun anchors when you need a specific past event; `memory_list` for time-bounded review.
3. **End of useful work** — `memory_create` for events worth keeping. Promote a recurring lesson by `knowledge_read` → edit → `knowledge_write`.

The full read-before-write / dedup / promotion workflow lives in [`skill/SKILL.md`](skill/SKILL.md).

## Configuration reference

| Variable | Default | When to override |
|---|---|---|
| `AGENT_NAME` | `default` | Always — set per project so agents don't share one identity. |
| `MEMORA_PATH` | `<memora>/data` | Relocating the entire data tree (db + agents + global) outside the repo. |
| `AGENT_MEMORA_PATH` | (uses `<MEMORA_PATH>/agents/<AGENT_NAME>`) | Keeping agent markdown next to the consumer project's source. |

The full list with defaults is in [`.env.example`](.env.example).

## Troubleshooting

- **Every project sees the same memories.** None set `AGENT_NAME`, so all default to `"default"`. Set distinct values per `.mcp.json`.
- **`memory_search` returns nothing for a multi-word query.** FTS5 treats space-separated words as implicit AND. Quote phrases (`"exact match"`) or split with `OR`.
- **System `sqlite3` CLI says `no such module: fts5`.** The macOS-bundled CLI often lacks FTS5. Use the project's bundled `better-sqlite3` via a tiny Node script, or install `sqlite3` from Homebrew with FTS5.
- **`knowledge_read` returns empty content on first call.** Expected — the markdown file is created on first `knowledge_write`. Empty string is success.

## Develop

```bash
npm install            # first time
npm run build          # compiles src/ → dist/
node dist/server.js    # run the stdio server standalone (MCP clients normally spawn this for you)
```

Source layout: `src/server.ts` registers tools, `src/tools/{memory,knowledge}.ts` are the handlers, `src/config/config.ts` resolves paths from env.

## Roadmap

The schema is intentionally minimal so it can grow:

- **Semantic vector search** — add a `memories_vec` virtual table via `sqlite-vec`, embed `data` on insert, hybrid-rank with RRF inside `memory_search`.
- **`memory_update(id, data?)`** — FTS5 update triggers are already in place; only the tool is missing.
- **Note-style markdown files** — `note_read` / `note_write` for arbitrary `.md` files alongside the canonical `procedural.md` + `semantic.md` (Obsidian-vault shape).
