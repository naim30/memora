# memora

Persistent agent-memory MCP. Two storage layers behind one server:

- **Episodic memory** — timestamped notes in SQLite + FTS5 (what happened, when).
- **Procedural + semantic knowledge** — markdown files (how to do things, what's true).

Six tools total. Self-contained: own `package.json`, own `node_modules`, own `dist/`. Any project can register it via `.mcp.json`.

## Tools

| Tool | Backing | Purpose |
|---|---|---|
| `memory_create(agent?, data)` | SQLite | Store an episodic note. Returns the created row. |
| `memory_search(query, agent?, limit?=10)` | SQLite (FTS5) | Full-text search ranked by relevance. Returns an array of rows. |
| `memory_list(agent?, limit?=20)` | SQLite | Browse newest-first. Returns an array of rows. |
| `memory_delete(id)` | SQLite | Delete a note by id. Returns the deleted row, or `null` if not found. |
| `knowledge_read(type, scope?)` | markdown file | Read `procedural.md` or `semantic.md`, agent- or global-scoped. Returns `{ content }`. |
| `knowledge_write(type, scope?, content)` | markdown file | Replace the file with new content. Returns `{ ok: true, path }`. |

Where:
- `type` = `"procedural" | "semantic"` (required)
- `scope` = `"agent" | "global"` (optional, defaults to `"agent"`)

## Configuration (via `.mcp.json` env block in the consuming project)

```jsonc
"memora": {
  "type": "stdio",
  "command": "node",
  "args": ["../memora/dist/server.js"],
  "env": {
    "AGENT_NAME": "jobhunt"
  }
}
```

`AGENT_NAME` is the only thing you typically need to set. Defaults derive everything else.

See `.env.example` for the full list of overrides (`MEMORA_PATH`, `AGENT_MEMORY_PATH`).

## Where the data lives

By default, all data lives inside the MCP package folder under `data/`:

```
memora/data/
├── memory.db                 ← episodic SQLite store
├── agents/
│   └── <AGENT_NAME>/
│       ├── procedural.md
│       └── semantic.md
└── global/
    ├── procedural.md
    └── semantic.md
```

Set `MEMORA_PATH` to an absolute path to relocate the whole tree elsewhere.

## Build

From the MCP folder:

```bash
npm install      # first time only
npm run build    # compiles src/ → dist/
```

## Inspect the SQL data

```bash
sqlite3 data/memory.db
sqlite> SELECT * FROM memories ORDER BY created_at DESC LIMIT 10;
sqlite> SELECT m.* FROM memories_fts f JOIN memories m ON m.id = f.rowid
        WHERE memories_fts MATCH 'shopify' ORDER BY rank LIMIT 5;
```

(Note: the system `sqlite3` CLI may lack FTS5. Use the bundled `better-sqlite3` if MATCH queries fail.)

## Future extensions

The schema is intentionally minimal:

- **Semantic vector search**: add a `memories_vec` virtual table via `sqlite-vec`, embed `data` on insert, hybrid-rank with RRF in `memory_search`.
- **In-place updates**: add `memory_update(id, data?)` — the FTS5 update trigger already handles it.
- **Atomic knowledge notes**: add a `note_read/note_write` tool for arbitrary `.md` files inside the agent/global folders (Obsidian-vault style) alongside the canonical `procedural.md` + `semantic.md`.
