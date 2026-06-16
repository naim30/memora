# Size guideline + compression strategy

The size guideline for `data` is **soft** — not enforced by the server. The convention is industry-standard (Letta's default block size, Mem0's metadata cap, Graphiti's "no more than 5 sentences per episode"): target 100-500 chars per row, soft cap ~2000 chars.

When content would exceed the cap, do NOT truncate blindly — compress. This file specifies the strategy.

## Why this size

- ~500 tokens fits comfortably in any retrieval payload (Mem0's <7,000-token budget = ~14 memories surfaced).
- One self-contained sentence is the converged unit across Mem0, LangMem, A-MEM, Generative Agents.
- Large rows poison FTS5 retrieval — denser old logs outrank fresher short ones, and search relevance degrades.
- Smaller rows are easier to dedup and update without context bloat.

## Compression decision tree

When content would exceed ~2000 chars, execute this tree in order:

### Step 1 — Classify the overflow

Is this:
- **(a) one dense fact** — a single statement with too much qualifying context
- **(b) a narrative / event log** — a multi-step sequence
- **(c) a document or long reference** — content that's fundamentally a doc, not a memory

### Step 2 — (a) Dense fact → distill

Drop the surrounding context, keep entities + relationship + outcome.

Before (1100 chars):
> *"After three rounds of negotiation with the procurement team and getting sign-off from finance, the user agreed that we should standardize on Postgres for the new microservices, replacing the existing MySQL infrastructure, because of better JSON support, the team's existing operational expertise with Postgres, and the recent performance issues we've been seeing with MySQL at our scale — particularly the lock-contention bug that affected the inventory service in March."*

After (190 chars):
> *"The team standardized on Postgres for new microservices (replacing MySQL) after procurement + finance approval; reasons: JSON support, existing Postgres ops expertise, MySQL lock-contention at scale."*

### Step 3 — (b) Narrative → tier-dependent

**Episodic → split-with-link.** Chunk into 2-5 entries of ≤1800 chars each, sharing a `thread_id` in metadata, sequence-numbered.

```
episodic_create({
  name: "retro_q2_part_1",
  data: "Q2 retrospective opening: ...",
  metadata: { thread_id: "retro_2026_q2", seq: 1, of: 3 }
})
episodic_create({
  name: "retro_q2_part_2",
  data: "Continued from retro_2026_q2 seq 1: ...",
  metadata: { thread_id: "retro_2026_q2", seq: 2, of: 3 }
})
// ...
```

They reconstruct in order at read time via `episodic_search('"retro_2026_q2"')` (the thread_id appears in name/data) then sort by `metadata.seq`.

**Semantic → summarize-then-distill.** Produce a single 1-2 sentence claim that supersedes the verbose version. Don't split semantic facts — they're durable state, not narrative. The verbose source content (if needed) lives as episodic rows referenced via `[episodic id: ...]` brackets.

### Step 4 — (c) Document/reference → pointer-and-reference

Store a ≤500-char summary + the URI/path in `data`. Do NOT inline the document.

```
semantic_create({
  name: "oncall_runbook_v3",
  data: "OnCall runbook v3.2 (2026-Q2): 12-step incident response covering paging, triage, rollback, and post-mortem. Canonical at docs/runbooks/oncall-v3-2.md."
})
```

### Step 5 — World tier — NEVER split, ALWAYS merge in place

Reaching the world cap is the signal to **compact**, not fragment. World is a singular source of truth.

```
const current = await world_get({ id: 5 });
// In-LLM: merge current.data + new content via summarization
// PRESERVE: all named entities, numbers, dates, decisions, existing [episodic id: ...] brackets
const merged = "<summarized text staying under 2000 chars>";
await world_update({ id: 5, data: merged });
```

### Step 6 — Verify

Confirm post-compression entry preserves:
- Every named entity
- Every number
- Every date / timestamp
- Every decision and outcome
- Every existing `[episodic id: ...]` bracket (see [provenance.md](provenance.md))

If anything load-bearing was dropped, compress again at lower compression ratio or move to pointer-and-reference.

### Step 7 — If still over after one pass

Repeat once at higher compression. If still over after the second pass, treat as case (c) — pointer-and-reference, with a longer-form copy stored externally (a markdown file, an issue, a doc).

## What NOT to do

- **Truncate blindly.** Drops entities at the boundary — catastrophic for audit and search.
- **Split a world fact.** Violates the "singular source of truth" property.
- **Inline a document.** Blows out FTS5 index size and slows search across the whole tier.
- **Drop existing provenance brackets on update.** Always preserve `[episodic id: ...]` brackets when rewriting `data`.
- **Compress so aggressively that disambiguating context is lost.** A future agent reading the row must still understand it standalone.
