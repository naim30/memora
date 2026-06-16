# Anti-patterns — what NOT to do

Each rule here addresses a common failure mode observed across memory MCPs (Mem0, Letta, Zep, A-MEM, LangMem). If a write is about to violate one of these, fix the write — don't proceed.

## Tier-mixing

### ❌ Storing events in semantic

```
// WRONG — this is an event, belongs in episodic
semantic_create({
  name: "user_question_today",
  data: "The user asked about pricing today."
})
```

Fix: use `episodic_create`. Events ("happened") belong in episodic regardless of how fact-like they sound.

### ❌ Storing per-agent facts in world

```
// WRONG — only this agent cares about this preference
world_create({
  name: "preferred_language",
  data: "The user prefers TypeScript."
})
```

Fix: use `semantic_create`. World is only for facts EVERY agent on the server should see and trust.

### ❌ Trying to update an episodic row

There is no `episodic_update`. Episodic is append-only by design — it mirrors Tulving's episodic memory: timestamped, immutable.

Fix: write a new `episodic_create` with provenance ("Correcting episodic_412: …") and optionally `episodic_delete` the original if it was clearly noise.

## Content quality

### ❌ Storing transcripts

```
// WRONG — raw conversation, no derived signal
episodic_create({
  name: "convo_2026_06_15",
  data: "User: 'How does X work?' Me: 'Well, X works like ...' User: 'Got it'"
})
```

Fix: store the derived signal. *"Explained how X works to the user; user confirmed understanding."*

### ❌ Bare pronouns

```
// WRONG — future agent doesn't know which user
semantic_create({
  name: "preference",
  data: "User said yes."
})
```

Fix: name the subject. *"Alice agreed to attend the team meeting at 15:00 UTC."*

### ❌ Speculation or prediction as fact

```
// WRONG — prediction, not observation
episodic_create({
  name: "expected_response",
  data: "They'll probably reply Monday."
})
```

Fix: only store observed facts. If you want to record an expectation, put it in metadata as a tag (`{tags: ["expected_response_by_monday"]}`) on the originating event, not as a fact in `data`.

## Write hygiene

### ❌ Writing on every turn

Memora is for *meaningful* events — decisions, outcomes, errors, contradictions. Not every user message. Bulk writes drown future search.

### ❌ Skipping the dedup search

```
// WRONG — duplicates pollute future retrieval
semantic_create({ name: "preferred_language", data: "..." })
// ... later ...
semantic_create({ name: "preferred_language", data: "..." })  // duplicate row
```

Fix: `semantic_search` for the subject first. If a row exists, use `semantic_update` to revise in place.

### ❌ Delete + recreate to "update"

```
// WRONG — loses row id, audit trail, external references
semantic_delete({ id: 12 });
semantic_create({ name: "preferred_language", data: "..." });
```

Fix: `semantic_update({ id: 12, data: "..." })`. Mutation preserves continuity.

### ❌ Splitting a world row

```
// WRONG — world is a singular source of truth
world_create({ name: "rate_limit_policy_part_1", ... });
world_create({ name: "rate_limit_policy_part_2", ... });
```

Fix: `world_get` the existing row, summarize-merge under the size cap, `world_update`. World tier never splits.

## Search misuse

### ❌ Treating FTS5 as semantic search

FTS5 is exact-token. "run" does not match "running". "user's preferred language" does not match a row that says "Alice writes Python."

Fix: search with proper nouns, exact phrases, distinctive identifiers. Don't expect synonym matching.

### ❌ Burying the search keyword in metadata

```
// WRONG — metadata is not FTS5-indexed
semantic_create({
  name: "x",
  data: "The user wants this.",
  metadata: { tags: ["typescript", "preference"] }
})
// Later: semantic_search("typescript")  → no hits
```

Fix: bake the keyword into `data`. *"The user prefers TypeScript ..."*

### ❌ Burying the search keyword in `name` only

Same failure mode — `name` is also NOT indexed by FTS5.

Fix: data must contain the searchable phrase.

## Provenance failure modes

### ❌ Forgetting the agent prefix in world brackets

```
// WRONG — episodic ids aren't globally unique across agents
world_create({
  data: "Rate limit is 100/min [episodic id: 47]."   // which agent's 47?
})
```

Fix: include the agent prefix. *"... [episodic id: ops_agent/47]."*

### ❌ Dropping prior brackets on update

```
// Before: data = "User prefers email [episodic id: 47]."
// WRONG — loses the audit trail
semantic_update({
  id: 12,
  data: "User prefers email [episodic id: 89]."   // dropped 47
})
```

Fix: preserve prior brackets and append new ones. *"User prefers email [episodic id: 47][episodic id: 89]."*

### ❌ Inventing episodic ids

If you don't have a real id, omit the bracket and use `metadata.origin: "system_prompt" | "user_assertion" | "external_kb"`.

## What memora is NOT for

- **Working memory / scratchpad** — keep in the prompt.
- **Transient session state** — current tool call, current draft, current scroll position.
- **Bulk logging / observability** — use a real log aggregator.
- **Document storage** — store the doc elsewhere; put a summary + URI in memora.
- **Secrets, credentials, full PII** — never.
- **Predictions or speculation** — only observed facts.
- **The user's literal last message** — store derived insight, not transcript.
