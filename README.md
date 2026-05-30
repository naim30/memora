# sql_memory

A tiny MCP server that gives the agent a persistent notebook backed by SQLite + FTS5.

Four tools, one flat pool of notes, no embeddings, no sessions. Designed to be readable end-to-end in one sitting.

## Tools

| Tool | Purpose |
|---|---|
| `memory_create(agent, data)` | Store a note. Returns the created row. |
| `memory_search(query, agent?, limit?=10)` | Full-text search ranked by relevance, optionally scoped to one agent. Returns an array of rows. |
| `memory_list(agent?, limit?=20)` | Browse newest-first, optionally scoped to one agent. Returns an array of rows. |
| `memory_delete(id)` | Delete a note by id. Returns the deleted row, or `null` if not found. |

## Where the data lives

`./mcps/sql_memory/data/memory.db` (relative to the jobhunt project root). The file is created on first run.

## Build

From the jobhunt project root:

```bash
npm run build
```

The compiled server lands at `dist/mcps/sql_memory/src/server.js`. That path matches the entry in `.mcp.json`, so Claude Code picks it up automatically the next time the project is opened.

## Run by hand (optional)

```bash
node dist/mcps/sql_memory/src/server.js --db ./mcps/sql_memory/data/memory.db
```

The server speaks MCP over stdio — it'll sit waiting for an MCP client. Ctrl+C to stop.

## Inspect the data

```bash
sqlite3 mcps/sql_memory/data/memory.db
sqlite> SELECT * FROM memories ORDER BY created_at DESC LIMIT 10;
sqlite> SELECT m.* FROM memories_fts f JOIN memories m ON m.id = f.rowid
        WHERE memories_fts MATCH 'shopify' ORDER BY rank LIMIT 5;
```

## Adding features later

The schema is intentionally minimal so it can grow without rewrites:

- **Semantic search**: add a `memories_vec` virtual table via `sqlite-vec`, embed `data` on insert, hybrid-rank with RRF in `memory_search`.
- **Sessions**: add a `sessions` table + `session_id` FK on `memories`; new tool `recent(session, limit)`.
- **In-place updates**: add `memory_update(id, data?, tags?)` — the FTS5 trigger already handles UPDATE.
