# Picking the right tier

Three questions, asked in order. The first "yes" determines the tier.

1. **Is this a one-off observation tied to a moment in time?** → `episodic_*`
2. **Is this durable state about this specific agent?** → `semantic_*`
3. **Should every agent on the server see and trust this?** → `world_*`

If none apply, it's working memory or transient state — don't write it to memora.

## Triangulation examples (spanning agent kinds)

| Observation | Tier | Why |
|---|---|---|
| "Ran the nightly sync; 3 records retried successfully." | episodic | time-bound event |
| "User prefers concise bulleted summaries." | semantic | per-user durable preference |
| "Org's deployment window is 2026-08-01 → 2026-08-15 UTC." | world | every agent must respect it |
| "User is on the Enterprise plan." | semantic | per-user durable state |
| "Public API rate limit is 100 req/min per IP." | world | system-wide constant |
| "User asked about pricing today." | episodic | a moment, not state |
| "Failed to parse the user's date format." | episodic if a moment; semantic if "user uses DD/MM/YYYY" | depends on intent |
| "OnCall rotation is alice → bob → carol." | world | shared across all agents |
| "Default deployment region is us-east-1." | semantic for one agent; world if every agent uses it | depends on scope |
| "Drafted the weekly summary; user approved." | episodic | one-off event |
| "User's name is Alice." | semantic | per-user state |
| "Holidays 2026: Jan 1, Jul 4, Dec 25." | world | shared calendar |

## Hard distinctions worth memorizing

- **"happened" vs "is true":** An event always belongs in episodic, even if it sounds fact-like. *"The user said X today"* → episodic. *"The user prefers X"* → semantic.
- **"my agent" vs "every agent":** A user's personal preference → semantic (only my agent needs it). An org-wide rate-limit policy → world (every agent must respect it).
- **"specific" vs "universal":** A personal calendar event → episodic. The fact that the org's all-hands runs every other Friday → world.
- **"observed" vs "decided":** External observation → episodic. The agent's own state (configuration, learned constant) → semantic.

## When to promote across tiers

**Episodic → semantic (per-agent pattern).** When 3+ episodic events carry the same lesson, promote the lesson into semantic with provenance brackets pointing at the supporting episodic ids. Optionally `episodic_delete` redundant rows once the promotion is stable.

```
// Three episodic rows all show "user prefers email follow-ups"
// → consolidate into one semantic fact
semantic_create({
  name: "user_contact_pref",
  data: "User prefers email over phone for follow-ups [episodic id: 47][episodic id: 89][episodic id: 102].",
  metadata: { confidence: "high" }
})
```

**Semantic → world (cross-agent escalation).** When a per-agent fact turns out to apply to every agent (an org policy, a shared taxonomy decision), promote with `world_create` first, then `semantic_delete` the per-agent row. Don't leave both — duplicates poison retrieval.

## Procedural memory is NOT in memora

Skills, playbooks, system prompts, how-to rules → they live in the agent's prompt or skill files. Memora is for state and events, not for "how the agent acts."
