# Handover — `thin-growth-engine`

You are taking over mid-project from a prior Claude session. This document is everything you need. Read it end-to-end before touching code.

## TL;DR

`thin-growth-engine` is a rebuild of the user's old `growth-engine` Next.js app using Gary Tan's **"Thin Harness, Fat Skills"** pattern. The old repo still works; the new one is where all new work happens. The 6-stage tweet-research pipeline (belief → evidence → research → narrative → hook → draft-tweet → critic) is **ported and working end-to-end via CLI**. The Next.js UI still calls the old monolithic code (`src/utils/agents.ts`) and has not yet been rewired to the new harness.

---

## 1. Identity & access

- **User:** Tom Humphrey (`tomhumphrey010@gmail.com`)
- **GitHub:** [tomhwrites/thin-growth-engine](https://github.com/tomhwrites/thin-growth-engine) — main @ `1a53583`
- **Old repo (still functional, left alone):** `/Users/tomh/growth-engine` — keep untouched unless explicitly told otherwise.
- **New repo (your working dir):** `/Users/tomh/thin-growth-engine`
- **Auth:** Supabase SSR with Google OAuth, locked to the email above via middleware. Anyone else who logs in gets rejected.
- **Hosting:** none. Dropped Vercel in the rebuild. Runs locally.

## 2. Architecture — read this before writing any code

```
skills/                     ← FAT: markdown files, one per agent capability
  _context/
    business.md             ← Immutable strategic/VC context (loaded by research stages)
    tweet-voice.md          ← voice rules (loaded only by tweet-producing skills)
  belief.md                 ← stage 1
  evidence.md               ← stage 2
  research.md               ← stage 3 (web_search + DB persist)
  narrative.md              ← stage 4 (citation-index schema)
  hook.md                   ← stage 5
  draft-tweet.md            ← stage 6a
  critic.md                 ← stage 6b

src/harness/                ← THIN: ~200 LOC of generic plumbing
  loop.ts                   ← runSkill() — loads skill, runs tool-use loop vs Anthropic
  tools.ts                  ← fetchExemplars, queryDataPoints, persistDataPoints
  resolver.ts               ← loads _context/ files referenced by skill frontmatter

bin/ge.ts                   ← CLI driver. Runs runSkill() + skill-specific post-processors
                              (citation resolution for narrative, grounding checks elsewhere)

src/app/                    ← Next.js UI. Still on OLD CODE via /api/* routes below.
src/app/api/run/route.ts    ← NEW: wraps runSkill over HTTP. Not used by the UI yet.
src/utils/agents.ts         ← OLD: ~1,500 LOC monolithic agent impl. TRANSITIONAL.
                              Will be deleted once UI is rewired to /api/run.
```

**Skill file format** (YAML frontmatter + markdown body):

```md
---
name: belief
description: ...
params:
  - TOPIC (required)
context: [_context/business.md]
tools: [queryDataPoints]
web_search: false
max_web_searches: 5
max_tokens: 2000
max_steps: 10
---

# Role
...
# Task
...
# Output
```json
{...}
```
```

## 3. What works, what doesn't

### Working (via CLI)
- All 7 skills run and produce valid JSON
- Tool use: fetchExemplars, queryDataPoints, persistDataPoints all hit Supabase via Prisma
- Web search works (Anthropic `web_search_20250305` server tool)
- Grounding enforced:
  - **narrative**: model emits `citations: [{researchIndex, findingIndex}]`, CLI post-processor in `bin/ge.ts` resolves indices to verbatim claims. **Fabrication is physically impossible** — the model never emits a claim string.
  - **hook / draft-tweet / critic**: post-hoc substring check in `bin/ge.ts`. Every number in output must appear verbatim in the narrative (and `facts_used` for draft-tweet). Warning-level only, goes to stderr.
- Prompt caching is in place via the skill body + context composition in `loop.ts`.
- Supabase SSR auth + Google OAuth login

### Partial / known-broken
- **UI is still calling old agents.** `src/components/TweetGenerator.tsx`, `BespokeAgentWorkbench.tsx`, `WeeklyPlanner.tsx` all POST to `/api/bespoke-agent`, `/api/research-pipeline`, `/api/generate-tweets`, `/api/weekly-planner` — all of which import from `src/utils/agents.ts`, not the new harness. **If you use the UI, you're testing the old code, not the rebuild.**
- **`/api/run`** exists and wraps `runSkill()` but nothing calls it. Rewiring `TweetGenerator` (research mode) to hit `/api/run` six times in sequence is the cleanest next step.
- **Google Sheets sync (`/api/sync/pull`, `/api/sync/push`)**: likely broken — no Google API credentials in `.env`. `src/lib/googleSheets.ts` expects auth.
- **Not ported to skills yet:**
  - `runMetricResearchAgent` (feeds `/api/fetchMetrics`)
  - 4 weekly-planner agents: `runWeeklySynthesisAgent`, `runWeeklySlotPlanner`, `runWeeklySlotDraftAgent`, `runWeeklyBulkDraftAgent`
  - `runDeeperResearchAgent` (a deeper variant of research; our stage 3 is the lighter version)
  - `runStandaloneTweetCriticRewrite` (different from our stage-6b critic)

### Pending decision (user asked, then deferred)
The user chose **option A** (citation-index schema for narrative, kept the grounding machinery). They asked about test runs — two paths were on the table:

- **Option A — CLI-only test runs.** User chains stages manually via `npm run ge -- <skill> --foo-file=tmp/bar.json`. Works now. Friction: has to extract JSON from raw stdout between stages. A `bin/ge-chain.ts` helper to run all 6 stages in one shot would remove this — **not yet built**.
- **Option B — Rewire `TweetGenerator` research mode to `/api/run`.** Progressive UI that shows each stage's output as it completes. ~1–2 hrs. Not yet started.

User said "I'll deal with this later" for the em-dash / banned-construction programmatic check in `bin/ge.ts` — currently the critic catches some voice violations but not all. Don't spend time on that unless asked.

## 4. Running it

```bash
# First time
cd /Users/tomh/thin-growth-engine
npm install        # postinstall runs prisma generate

# Single skill
npm run ge -- belief --topic="Immutable Play user acquisition"

# Chain (current manual approach — the JSON extraction is the tedious part)
npm run ge -- belief --topic="..." 2>/dev/null | sed -n '/^{/,/^}/p' > tmp/beliefs.json
BELIEFS=$(node -e "process.stdout.write(JSON.stringify(require('./tmp/beliefs.json').beliefs))")
npm run ge -- evidence --topic="..." --beliefs="$BELIEFS" | ... > tmp/evidence.json
# etc. for research → narrative → hook → draft-tweet → critic

# Verbose mode shows tool calls
npm run ge -- research --topic="..." --evidenceNeeds-file=tmp/evidenceNeeds.json -v

# UI (will run old code)
npm run dev
```

Files named `tmp/*.json` are gitignored smoke-test artifacts.

## 5. Critical gotchas

- **Model ID is `claude-sonnet-4-6`**, not 4-5. Do not "fix" this back to 4-5.
- **Knowledge cutoff**: January 2026. Today's date per the parent session was 2026-04-20.
- **`dotenv` must use `{ override: true }`** in `bin/ge.ts`. The user's shell had `ANTHROPIC_API_KEY=""` exported (length 0), which blocked dotenv loading until we set override.
- **`skillsRoot` uses `process.cwd()`**, not `import.meta.url`, in both `src/harness/loop.ts` and `src/harness/resolver.ts`. Next.js bundling breaks `import.meta.url`.
- **Narrative output schema is forbidden from containing `supportingData`, `claim`, `sourceUrl`, or `findings` keys at the model level.** `bin/ge.ts` hard-fails if the model emits those. It must emit `citations: [{researchIndex, findingIndex}]`. The CLI post-processor rewrites the output shape to include `supportingData` for downstream consumers — downstream sees `{insight, angle, supportingData}` as normal. Don't remove the hard-fail; it's load-bearing.
- **Research stage 3 writes to DB in real-time** via `persistDataPoints`. Re-running a topic doesn't double-insert because the skill reuses existing rows via `queryDataPoints` first. But if you're iterating, be aware.
- **Prisma model is `dataPoints`** (camelCase) — confirm by reading `prisma/schema.prisma` before any DB work.
- **`facts_used` in draft-tweet output** is semantically load-bearing for the grounding check. If the model drops this field, the check has less to validate against.

## 6. Environment

`.env` required keys (already set; do not echo):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL` (pooled Supabase Postgres)
- `DATABASE_URL_UNPOOLED`
- `ANTHROPIC_API_KEY`

Not configured (known):
- Any Google API credentials — blocks `/api/sync/*`

## 7. Read these files first (in order)

1. `src/harness/loop.ts` — 130 lines, the whole harness
2. `skills/belief.md` — simplest skill, gets you the file format
3. `skills/narrative.md` — the citation-index pattern (most interesting design choice)
4. `bin/ge.ts` — CLI + post-processors, especially `postProcessNarrative` and `groundingCheckDrafts`
5. `src/harness/tools.ts` — the three tools; note `queryDataPoints` ranking (verified > manual > agent)
6. `skills/_context/tweet-voice.md` — voice rules. Banned constructions list is exhaustive; the "Not X, but Y" family is the most-violated.
7. `src/utils/agents.ts` — **don't read fully; it's 1,500 LOC of reference material.** Look up specific agent functions as needed (e.g. `runWeeklySynthesisAgent` at ~line 100, `runTweetCritic` at ~line 900).

## 8. Conversation context you don't have

What happened in the originating chat (condensed, so you don't repeat mistakes):

- **Early:** ported stages 1–5 one at a time. Each confirmed working before moving on.
- **Mid-grounding crisis:** I wrongly accused the narrative skill of hallucinating specific figures (e.g. "1,070,452", "$1M in rewards"). On closer inspection, those exact strings were *verbatim* in the research findings — I'd compared against a stale mental model of the research. **Lesson for you: before flagging a hallucination, `cat` the actual input file. Don't trust memory of what was there.**
- **Real tightening:** after the false alarm, we did legitimately tighten the narrative output to the citation-index schema. The model was occasionally embellishing, and the schema change makes fabrication physically impossible. User picked this "option A" approach explicitly over reverting.
- **Stage 6 critic** caught a real semantic issue (draft comparing Day-7 GoG retention to Day-1 industry baseline — apples/oranges) but did not catch em-dash / "not X, it's Y" voice violations in its own rewrite. User acknowledged; deferred the programmatic fix.
- **User preferences observed:**
  - Terse responses. Don't narrate deliberation.
  - Validates judgment calls with short confirmations ("yes do this", "one more", "option a"). Don't over-ask.
  - Wants to be told honestly when the prior answer was wrong. I corrected myself mid-conversation on the hallucination claim and it was well-received.
  - Explicit about wanting to fix things at the source (skills) rather than hack around them (critic cleanup). "Rather than the drafting agent just cleaning this up, can we not update the skills for hook + narrative to make sure they don't hallucinate?" — the ethos.

## 9. Next steps — pick one

The user will likely tell you which they want. Options roughly in priority order:

1. **Build `bin/ge-chain.ts`** — a ~20 line helper that runs all 6 stages in sequence, extracts JSON between them, writes final tweets. Eliminates 60 seconds of per-run friction for CLI testing. Low-risk, high-value.
2. **Rewire `TweetGenerator.tsx` research mode to `/api/run`** — six sequential calls, one per stage, progressive rendering. Keeps old routes alive as fallback. ~1–2 hrs. Lets user visually test the rebuild.
3. **Programmatic voice check** — regex in `bin/ge.ts` for em-dashes, hyphens, banned constructions ("Not X, but Y", "It's not X. It's Y") in hook and draft-tweet output. Warning-level to match existing pattern.
4. **Port weekly-planner agents to skills** — 4 skills: `weekly-synthesis`, `weekly-slot-plan`, `weekly-slot-draft`, `weekly-bulk-draft`. Only do this if user asks; they haven't signalled it.
5. **Port `runMetricResearchAgent`** — for "single" mode in UI. Same caveat as above.
6. **Tear out `src/utils/agents.ts`** — only once UI is fully rewired. Big cleanup moment. **Do not do this prematurely** — the UI breaks silently without it.

## 10. Rules of the road

- Never create new markdown/docs files unless explicitly asked. (This HANDOVER.md was explicitly requested.)
- Default to no comments in code. Only comment non-obvious *why*.
- Never amend git commits; always create a new one.
- Never run `git push --force` or destructive git without explicit permission.
- Don't delete `src/utils/agents.ts`, the old API routes, or the old `growth-engine` repo without explicit permission. They are safety nets.
- Don't "fix" the model ID to 4-5. It's intentionally 4-6.
- Don't add error handling for scenarios that can't happen. Trust the harness.
- User prefers one bundled commit when the changes are coherent, not many small ones.

Good luck.
