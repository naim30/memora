# memora

Persistent agent-memory MCP server. Three SQLite + FTS5 tiers behind one stdio MCP:

- **episodic** — timestamped per-agent events (append-only)
- **semantic** — durable per-agent facts (mutable in place)
- **world** — cross-agent shared facts (mutable in place)

16 tools across the three tiers. Usage policy — *when* to use each tool, how to phrase content, dedup, compression, provenance — lives in the companion skill at [`skill/SKILL.md`](skill/SKILL.md).

## Quick start

### 1. Build memora

```bash
npm install
npm run build
```

Requires Node ≥ 22.14. Produces `dist/server.js` — the stdio entry point.

### 2. Wire it into a project's `.mcp.json`

```jsonc
{
  "mcpServers": {
    "memora": {
      "type": "stdio",
      "command": "node",
      "args": ["../memora/dist/server.js"],
      "env": {
        "AGENT_NAME": "your-agent-name"
      }
    }
  }
}
```

`AGENT_NAME` scopes episodic + semantic writes/reads. Each consumer should set a distinct value — otherwise every consumer that omits it shares one identity. World rows ignore `AGENT_NAME`.

### 3. Install the companion skill

Symlink the skill folder into your user-global skills once:

```bash
ln -s /absolute/path/to/memora/skill ~/.claude/skills/memora
```

Every Claude Code session in any project then sees a `memora` skill in the skill list.

## Tools at a glance

| Family | Tools |
|---|---|
| `episodic_*` | `create(name, data, metadata?)`, `get(id)`, `list(agent?, limit?)`, `search(query, agent?, limit?, sort?)`, `delete(id)` |
| `semantic_*` | `create(name, data, metadata?)`, `get(id)`, `list(agent?, limit?)`, `update(id, name?, data?, metadata?)`, `delete(id)`, `search(query, agent?, limit?, sort?)` |
| `world_*` | `create(name, data, metadata?)`, `get(id)`, `update(id, name?, data?, metadata?)`, `delete(id)`, `search(query, limit?, sort?)` |

Full per-tool descriptions are surfaced at call time via each tool's MCP schema. The skill ([`skill/SKILL.md`](skill/SKILL.md)) covers picking, content style, size guidance, provenance, search behavior, anti-patterns, and worked examples.

## Project structure

```
memora/
├── src/
│   ├── server.ts                # stdio entry — registers tools
│   ├── config/
│   │   └── config.ts            # env-driven config (AGENT_NAME, MEMORA_PATH)
│   ├── database/
│   │   ├── db.ts                # SQLite connection + schema bootstrap
│   │   └── schema.sql           # tables, FTS5 indexes, triggers
│   ├── lib/
│   │   ├── metadata.ts          # JSON metadata serialize/parse helpers
│   │   └── register-tool.ts     # MCP tool registration helper
│   └── tools/
│       ├── index.ts             # barrel re-exports
│       ├── episodic.ts          # 5 episodic_* tools
│       ├── semantic.ts          # 6 semantic_* tools
│       └── world.ts             # 5 world_* tools
├── skill/
│   ├── SKILL.md                 # skill entry — when to call memora, tools, hard rules
│   └── references/              # deep dives (loaded on demand)
│       ├── picking-the-tier.md
│       ├── memory-structure.md
│       ├── compression.md
│       ├── provenance.md
│       ├── search-and-fts5.md
│       ├── anti-patterns.md
│       └── examples.md
├── data/                        # created on first run; SQLite file lives here
├── dist/                        # compiled output (after npm run build)
├── package.json
├── tsconfig.json
└── README.md
```

## Configuration

| Variable | Default | When to override |
|---|---|---|
| `AGENT_NAME` | `default` | Always — set per project so consumers don't share identity. |
| `MEMORA_PATH` | `<memora>/data` | Relocating the data tree outside the repo. |

## Develop

```bash
npm install            # first time
npm run build          # tsc → dist/
node dist/server.js    # run the stdio server standalone for smoke tests
```
