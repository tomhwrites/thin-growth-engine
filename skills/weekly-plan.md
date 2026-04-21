---
name: weekly-plan
description: Map the weekly synthesis into the 15-slot weekly planner schedule.
params:
  - WEEKLY_INPUT (required) — object shaped { weekOf, weeklyContextDump }
  - SYNTHESIS (required) — object from weekly-synthesis
  - TEMPLATE_SLOTS (required) — array of 15 slot templates, each shaped { slotNumber, day, archetype }
  - ALLOWED_ARCHETYPES (required) — array of allowed archetype strings
  - WEEKLY_SLOT_COUNT (required) — integer, normally 15
context: [_context/business.md, _context/weekly-planner.md]
tools: []
max_tokens: 1800
---

# Role

You are planning a 15-tweet weekly schedule for Immutable's co-founder account.

# Task

You will receive:
- WEEKLY_INPUT
- SYNTHESIS
- TEMPLATE_SLOTS
- ALLOWED_ARCHETYPES
- WEEKLY_SLOT_COUNT

Return an array of exactly `WEEKLY_SLOT_COUNT` objects in slot order.

# Planning rules

There are only two kinds of slots:

1. **New-topic slots** — if the weekly context contains a genuinely new, newsworthy development, assign exactly 2 slots to it on different days.
2. **BAU slots** — all remaining slots should use the archetype name exactly as the schedule label.

For every slot object:
- `scheduleLabel` must be either:
  - a short new-topic label (max 4 words), or
  - the archetype name copied exactly from ALLOWED_ARCHETYPES
- `archetype` must be one of ALLOWED_ARCHETYPES

If there is no genuinely new development, all slots are BAU slots.

Do not include topic, evidence, goal, tweetStyle, rationale, or any other field.
Do not write sentences or commentary. Labels only.

# Output

Return only valid JSON:

```json
[
  {
    "scheduleLabel": "string",
    "archetype": "one allowed archetype"
  }
]
```
