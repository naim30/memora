# Worked examples across agent kinds

Each example shows an end-to-end memora workflow for a different agent family. None of these are domain-specific.

## Coding assistant — promoting from episodic to semantic

```
// 1. Event: user asked to convert Python to TypeScript
episodic_create({
  name: "preferred_lang_observed",
  data: "User asked to rewrite a Python file as TypeScript with strict mode; expressed dislike of dynamic typing.",
  metadata: { tags: ["preferences"] }
})
// → returns { id: 89, ... }

// 2. Dedup before semantic write
semantic_search("preferred OR language OR typescript")
// → []  (no existing row)

// 3. Stable preference, with provenance bracket
semantic_create({
  name: "preferred_language",
  data: "The user prefers TypeScript with strict mode enabled by default for new files [episodic id: 89].",
  metadata: { tags: ["preferences", "tooling"], confidence: "high" }
})
```

## Customer-support agent — append a bracket on reinforcement

```
// Existing semantic row id=12:
// data = "User prefers email over phone for follow-ups [episodic id: 47]."

// 1. Event: user reiterated preference
episodic_create({
  name: "user_email_pref_restated",
  data: "User reiterated email preference during the latest ticket; declined a phone call.",
  metadata: { source: "zendesk", refs: ["ticket_4421"] }
})
// → returns { id: 89, ... }

// 2. Update semantic — preserve prior bracket, append new one
semantic_update({
  id: 12,
  data: "User prefers email over phone for follow-ups [episodic id: 47][episodic id: 89]."
})
```

## DevOps agent — world fact with multi-agent provenance

```
// 1. Dedup
world_search("rate limit")
// → []  (no existing row)

// 2. Create world fact citing two agents' episodic events
world_create({
  name: "rate_limit_policy",
  data: "Public API rate limit is 100 req/min per IP; bypass requires written sign-off from oncall [episodic id: ops_agent/102][episodic id: support_bot/47].",
  metadata: { confidence: "authoritative", tags: ["policy"] }
})
```

## Research agent — fact with no episodic source

```
// External knowledge (paper read but not logged as an episodic event)
semantic_create({
  name: "coala_definition",
  data: "CoALA stands for Cognitive Architectures for Language Agents (Sumers et al. 2023, arXiv:2309.02427) — the canonical four-tier frame: working / episodic / semantic / procedural.",
  metadata: { origin: "external_kb", tags: ["glossary"] }
  // no [episodic id: ...] bracket — no episodic source exists
})
```

## Persona agent — oversized content compressed via split-with-link

```
// User shared a long retrospective. Original text ~3500 chars.
// Classify: narrative + episodic tier → split-with-link

episodic_create({
  name: "retro_q2_part_1",
  data: "Q2 retrospective opening: user reflected on shipping the new dashboard, called out three wins (collaboration with design, fast iteration, on-time delivery)...",
  metadata: { thread_id: "retro_2026_q2", seq: 1, of: 2 }
})

episodic_create({
  name: "retro_q2_part_2",
  data: "Continued from retro_2026_q2 seq 1: pain points around CI flakiness; plan to invest in test stability in Q3; team will pair on flaky test reduction Mondays.",
  metadata: { thread_id: "retro_2026_q2", seq: 2, of: 2 }
})
```

## Devops agent — world fact merge-in-place (oversized update)

```
// Existing world fact id=5:
// data = "Public API rate limit is 100 req/min per IP; bypass requires oncall sign-off [episodic id: ops_agent/102]."

// New observation: rate limit raised to 200/min for enterprise tier
const current = await world_get({ id: 5 });
// In-LLM: merge old data + new info, preserve the prior bracket, append the new one,
// stay under 2000 chars.
await world_update({
  id: 5,
  data: "Public API rate limit is 100 req/min per IP for free tier, 200 req/min for enterprise; bypass requires oncall sign-off [episodic id: ops_agent/102][episodic id: ops_agent/187]."
})
```

## Boot-time grounding scan

```
// At session start, get the agent's persisted state
semantic_list({ limit: 50 })
// → array of stable per-agent facts; agent now has its profile loaded

// Optional: pull in any world facts relevant to today's task
world_search("deployment window OR holiday")
```

## Reverse-lookup workflow

```
// "Which semantic facts derived from episodic event 47?"
semantic_search('"episodic id: 47"')

// "Which world facts cite ops_agent's episodic event 102?"
world_search('"episodic id: ops_agent 102"')  // FTS5 drops the slash; use space
```

## Reading another agent's memory

```
// Check what support_bot has learned about a user
semantic_search({
  query: "user_contact_pref",
  agent: "support_bot"
})

// World is unscoped — every agent reads the same rows
world_search("deployment window")
```

## Cross-tier promotion — episodic pattern → semantic

```
// Three episodic events all show the same lesson
const events = await episodic_search('"escalates by EOD"');
// → [ {id:47, ...}, {id:89, ...}, {id:102, ...} ]

// Dedup before semantic write
const existing = await semantic_search("escalation OR EOD");
// → []

// Promote pattern to semantic with all 3 supporting episodic ids
semantic_create({
  name: "escalation_window",
  data: "Tickets escalate by EOD UTC if no first response within 4 hours [episodic id: 47][episodic id: 89][episodic id: 102].",
  metadata: { tags: ["escalation", "sla"], confidence: "high" }
})
// Optional: episodic_delete the redundant rows once the promotion is stable
```

## When NOT to write

- **User just said "thanks"** — not a meaningful event. Skip.
- **You just searched and found nothing** — that's not a fact worth recording.
- **The agent's intermediate reasoning** — working memory; keep in the prompt.
- **A scraped HTML fragment / API response** — tool output, not a memory.
- **A draft that wasn't sent** — transient; if it ships later, write the outcome then.
