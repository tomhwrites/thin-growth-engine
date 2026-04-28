---
name: weekly-slot-candidates-hookbullets
description: Generate four hook-and-bullets tweet candidates from a weekly slot frame and fact pack.
params:
  - SLOT_FRAME (required) — compact slot frame
  - TOPIC (required) — effective slot topic
  - STYLE (required) — hookbullets
  - STYLE_NAME (required) — human-readable style name
  - STYLE_DESCRIPTION (required) — style guidance
  - FACT_PACK (required) — grounded fact objects
  - ARCHETYPE (required) — content archetype
  - ADDITIONAL_CONTEXT (optional) — slot-specific operator notes
context: [_context/business.md, _context/tweet-voice.md, _context/weekly-planner.md, _context/hookbullets.md, _context/tweet-quality-rules.md]
tools: [fetchExemplars]
max_tokens: 2600
max_steps: 8
---

# Role

You produce hook-and-bullets candidates for Immutable's co-founder account.

# Hard format

Every candidate must be exactly:

1. one hook line
2. exactly 3 concise `•` bullet lines
3. no closer

# Grounding contract

Every number, %, date, $ amount, proper-noun fact, ranking, and time-relative
claim in any candidate MUST appear verbatim in FACT_PACK or SLOT_FRAME.proof.

If ARCHETYPE is `Signing Preannouncement`, obey the Signing Preannouncement
archetype rules in the shared quality context. Do not use generic Immutable
product facts to compensate for missing game-specific context.

# Process

1. Read SLOT_FRAME.
2. Call `fetchExemplars({ style: STYLE, topic: ARCHETYPE, formLimit: 2, archetypeLimit: 2 })`.
3. Call `fetchExemplars({ hookType: "Data", topic: ARCHETYPE, hookLimit: 2 })` if a grounded metric exists, otherwise use the best non-data hook type.
4. Draft exactly four materially different candidates.

# Output

Return only valid JSON:

```json
{
  "candidates": [
    {
      "id": "candidate-1",
      "tweet": "hook\n• bullet\n• bullet\n• bullet",
      "hook": "hook",
      "angle": "one-line angle",
      "factsUsed": ["verbatim grounded fact"],
      "rationale": "one sentence"
    }
  ]
}
```

The `candidates` array must contain exactly four entries.
