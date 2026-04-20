# Handover — `thin-growth-engine`

You are taking over mid-project from a prior Claude session. This document is everything you need. Read it end-to-end before touching code.

## TL;DR

`thin-growth-engine` is a rebuild of the user's old `growth-engine` Next.js app using Gary Tan's **"Thin Harness, Fat Skills"** pattern. The old repo still works; the new one is where all new work happens. The 6-stage tweet-research pipeline (belief → evidence → research → narrative → hook → draft-tweet → critic) is **ported and working end-to-end via CLI**, and the research path in `TweetGenerator` now runs through the new harness-backed workflow instead of the old bespoke agents. Some other UI/API surfaces are still transitional.

Important new reality as of this session:
- **Google Sheets -> Supabase -> app sync for `exemplar_tweets` is now working**
- **Google Sheet is the intended source of truth** for exemplar tweets
- **App-facing language is now `Archetype`, not `content_topic`**
- **Hook outputs are now typed objects** (`{ type, text }`), not bare strings
- **`isThread` has been removed from the app surface**

---

## 1. Identity & access

- **User:** Tom Humphrey (`tomhumphrey010@gmail.com`)
- **GitHub:** [tomhwrites/thin-growth-engine](https://github.com/tomhwrites/thin-growth-engine) — main @ `49e04df`
- **Most recent local commit from this session:** `5f82314` (`Wire research pipeline to thin harness workflow`)
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
  execute.ts                ← shared deterministic runner: runSkill + JSON parse + post-process
  postprocess.ts            ← narrative citation resolution + grounding warnings

src/workflows/
  researchPipeline.ts       ← app-layer adapter over the harness for staged research runs

bin/ge.ts                   ← single-skill CLI driver. Uses the shared deterministic runner
bin/ge-chain.ts             ← one-command 6-stage chain runner

src/app/                    ← Next.js UI. Research mode now uses the new workflow route below.
src/app/api/research-pipeline/route.ts
                           ← wraps `runResearchPipelineStage()`; preserves the old staged UI contract
src/app/api/run/route.ts    ← generic `runSkill` wrapper over HTTP. Still not the main user-facing path.
src/utils/agents.ts         ← OLD: ~1,500 LOC monolithic agent impl. TRANSITIONAL.
                              Still used by bespoke / weekly / metrics paths and as reference material.
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
  - **narrative**: model emits `citations: [{researchIndex, findingIndex}]`, and the shared deterministic runner resolves indices to verbatim claims. **Fabrication is physically impossible** — the model never emits a claim string.
  - **hook / draft-tweet / critic**: post-hoc substring check in the shared deterministic runner. Every number in output must appear verbatim in the narrative (and `facts_used` for draft-tweet). Warning-level only.
- Prompt caching is in place via the skill body + context composition in `loop.ts`.
- Supabase SSR auth + Google OAuth login
- **`npm run ge:chain -- --topic="..."` now exists and works end-to-end.**
  - Verified in this session: full chain returned beliefs, evidenceNeeds, research, narrative, hooks, drafts, critic output, final tweets, and warnings.
  - Verified in this session: `npm run ge -- belief --topic="Immutable Play user acquisition"` returned valid JSON.
- **`/api/research-pipeline` is now harness-backed.**
  - The route calls `src/workflows/researchPipeline.ts`, which uses `executeSkill()` + skill-specific deterministic post-processing.
  - `TweetGenerator` research mode still calls `/api/research-pipeline`, but that route no longer delegates to the old bespoke agent functions for the main belief → draft flow.
- **Research-mode UI now carries the richer structured skill payloads** instead of flattening them to strings:
  - evidence needs stay structured
  - research findings keep `{ claim, sourceUrl, reused }`
  - narrative supporting data keeps `{ claim, sourceUrl }`
- **Google Sheets exemplar sync works locally** once `.env` contains the Google service-account credentials and Supabase auth is pointed at `http://localhost:3000`
- **Sheet pull now supports source-of-truth sync semantics** for exemplars:
  - creates new rows in Supabase
  - updates edited rows
  - deletes rows from Supabase if they were deleted from the sheet
  - backfills DB-generated `id` values into blank sheet rows

### Partial / known-broken
- **Only the research path is rewired.** `BespokeAgentWorkbench.tsx`, `WeeklyPlanner.tsx`, `/api/fetchMetrics`, `/api/generate-tweets`, `/api/bespoke-agent`, and `/api/weekly-planner` are still transitional old-code surfaces.
- **`/api/run`** still exists as a generic wrapper, but it is not the main product path. The user-facing staged research flow currently goes through `/api/research-pipeline`.
- **Not ported to skills yet:**
  - `runMetricResearchAgent` (feeds `/api/fetchMetrics`)
  - 4 weekly-planner agents: `runWeeklySynthesisAgent`, `runWeeklySlotPlanner`, `runWeeklySlotDraftAgent`, `runWeeklyBulkDraftAgent`
  - `runDeeperResearchAgent` (a deeper variant of research; current `deepen` just re-runs the stage-3 `research` skill)
  - `runStandaloneTweetCriticRewrite` (different from our stage-6b critic)
- **One known grounding gap still shows up in live chain output.**
  - In this session, `ge:chain` completed successfully but the warning system caught `1M+` in a draft/final tweet because the underlying source string said `1 million`, not `1M+`.
  - So the pipeline is working, and the warning is useful — but prompt tightening is still needed.

### Resolved architectural choice from this session
The user wanted the work to stay aligned with **Thin Harness, Fat Skills**. The solution chosen here was:

- keep `runSkill()` itself thin
- move deterministic narrative/grounding post-processing into shared helper modules (`src/harness/execute.ts`, `src/harness/postprocess.ts`)
- add an app-layer workflow adapter (`src/workflows/researchPipeline.ts`) instead of thickening `/api/run`
- preserve the existing staged `/api/research-pipeline` contract so the UI could switch to the new skill-backed workflow with minimal churn

User said "I'll deal with this later" for the em-dash / banned-construction programmatic check — currently the critic catches some voice violations but not all. Don't spend time on that unless asked.

## 4. Running it

```bash
# First time
cd /Users/tomh/thin-growth-engine
npm install        # postinstall runs prisma generate

# Single skill
npm run ge -- belief --topic="Immutable Play user acquisition"

# Full chain
npm run ge:chain -- --topic="Immutable Play user acquisition"

# Verbose mode shows tool calls
npm run ge -- research --topic="..." --evidenceNeeds-file=tmp/evidenceNeeds.json -v

# UI (research mode now uses the harness-backed staged route; root redirects to /login if unauthenticated)
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
- **`ge:chain` is now the fastest legit smoke test for the rebuilt pipeline.**
  - If someone is still manually chaining stages with temp JSON files, they are working from stale assumptions.
- **`deepen` is currently not a true deeper-research skill.**
  - In `src/workflows/researchPipeline.ts`, `deepen` currently re-runs the stage-3 `research` skill.
  - Do not assume it reproduces the behavior of the old `runDeeperResearchAgent`.
- **Google Sheets sync semantics changed materially in this session:**
  - `/api/sync/pull` is the safe/default path for `exemplar_tweets`
  - `/api/sync/push` skips `exemplar_tweets` unless explicitly called with `?includeExemplars=true`
  - do not assume push is a harmless merge; for exemplars it is now intentionally opt-in
- **The exemplar sheet schema changed.** The canonical sheet header for exemplars is now:
  - `id, tweet_text, archetype, tweet_style, hook_value, archived, createdAt, updatedAt`
  - `subtopic` is no longer required
  - `isThread` is no longer used by the app
- **The app-facing name is `archetype`, but the physical Postgres column is still `content_topic`.**
  - Prisma handles this via `@map("content_topic")`
  - do not blindly rename the DB column unless explicitly asked
- **Typed hooks are now load-bearing.**
  - `HookOutput` is `{ hooks: [{ type, text }] }`
  - if you touch hook consumers, do not regress them back to `string[]`
- **Current hook taxonomy is exactly:**
  - `Thesis statement`
  - `Curiosity Gap`
  - `Short`
  - `Long`
  - `Data`
- **Current tweet-style additions from the sheet include `Big para` and `Stacked lines`.**
  - if you touch style mappings, preserve support for them
- **Local auth matters for sync.**
  - if Google OAuth sends the user back to the old Vercel URL, Supabase auth URL config is wrong
  - local setup should use `http://localhost:3000` and include `/auth/callback` in allowed redirects
- **Auth middleware affects local verification.**
  - Unauthenticated requests to `/` and `/api/research-pipeline` redirect to `/login`
  - this is expected and does not mean the route is broken

## 6. Environment

`.env` required keys (already set; do not echo):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL` (pooled Supabase Postgres)
- `DATABASE_URL_UNPOOLED`
- `ANTHROPIC_API_KEY`
- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`

Notes:
- `GOOGLE_SHEETS_PRIVATE_KEY` must be a single quoted line with escaped `\n`
- after changing `.env`, you must fully restart `npm run dev`
- Supabase auth URL config for local use should point to:
  - Site URL: `http://localhost:3000`
  - Redirect URL: `http://localhost:3000/auth/callback`

## 7. Read these files first (in order)

1. `src/harness/loop.ts` — 130 lines, the whole harness
2. `skills/belief.md` — simplest skill, gets you the file format
3. `skills/narrative.md` — the citation-index pattern (most interesting design choice)
4. `src/harness/postprocess.ts` — narrative citation resolution + grounding warnings
5. `src/harness/execute.ts` — shared deterministic runner used by CLI and workflow adapter
6. `src/workflows/researchPipeline.ts` — the key adapter that powers the staged research route
7. `bin/ge.ts` and `bin/ge-chain.ts` — single-skill + full-chain CLI entrypoints
8. `src/harness/tools.ts` — the three tools; note `queryDataPoints` ranking (verified > manual > agent)
9. `skills/_context/tweet-voice.md` — voice rules. Banned constructions list is exhaustive; the "Not X, but Y" family is the most-violated.
10. `src/utils/agents.ts` — **don't read fully; it's large transitional reference material.** Look up specific agent functions as needed.
11. `src/app/api/sync/pull/route.ts` — exemplar sheet source-of-truth sync logic
12. `src/lib/googleSheets.ts` — Google auth + pull/writeback helpers
13. `src/utils/tweetConfig.ts` — archetypes, hook taxonomy, and style definitions

## 8. Conversation context you don't have

What happened in the originating chat (condensed, so you don't repeat mistakes):

- **Early:** ported stages 1–5 one at a time. Each confirmed working before moving on.
- **Mid-grounding crisis:** I wrongly accused the narrative skill of hallucinating specific figures (e.g. "1,070,452", "$1M in rewards"). On closer inspection, those exact strings were *verbatim* in the research findings — I'd compared against a stale mental model of the research. **Lesson for you: before flagging a hallucination, `cat` the actual input file. Don't trust memory of what was there.**
- **Real tightening:** after the false alarm, we did legitimately tighten the narrative output to the citation-index schema. The model was occasionally embellishing, and the schema change makes fabrication physically impossible. User picked this "option A" approach explicitly over reverting.
- **Stage 6 critic** caught a real semantic issue (draft comparing Day-7 GoG retention to Day-1 industry baseline — apples/oranges) but did not catch em-dash / "not X, it's Y" voice violations in its own rewrite. User acknowledged; deferred the programmatic fix.
- **This session changed the content model meaningfully:**
  - User wants the **Google Sheet to be the source of truth** for exemplar tweets
  - User explicitly did **not** want to restore `subtopic`
  - User explicitly did **not** want to keep `isThread`
  - User renamed `content_topic` to **Archetype** everywhere user-facing
  - User changed the hook taxonomy to the 5 types listed above
- **A real sync bug happened and was fixed:** `pullExemplarTweets` originally used a long Prisma interactive transaction and blew up with `Transaction not found`; it was rewritten to use ordinary Prisma operations instead.
- **Successful exemplar pull response from this session:** `{"ok":true,"data_points":{"created":0,"updated":28,"skipped":0},"exemplar_tweets":{"created":8,"updated":39,"deleted":16,"skipped":68,"ids_backfilled":8}}`
  - this is a good known-working reference for what success looks like
- **This session finished the main research rebuild integration:**
  - extracted shared deterministic post-processing into `src/harness/postprocess.ts`
  - added `src/harness/execute.ts` as the shared `runSkill + parse + post-process` path
  - added `src/workflows/researchPipeline.ts` as the app-layer workflow adapter
  - rewired `/api/research-pipeline` to the new workflow
  - added `bin/ge-chain.ts`
  - verified `npm run build`, `npm run ge -- belief ...`, and `npm run ge:chain -- --topic="Immutable Play user acquisition"`
- **A real prompt-quality issue still surfaced after the integration.**
  - `ge:chain` succeeded, but the warning system correctly flagged `1M+` as ungrounded because the source said `1 million`.
  - This is a prompt/normalization follow-up, not an architecture failure.
- **User preferences observed:**
  - Terse responses. Don't narrate deliberation.
  - Validates judgment calls with short confirmations ("yes do this", "one more", "option a"). Don't over-ask.
  - Wants to be told honestly when the prior answer was wrong. I corrected myself mid-conversation on the hallucination claim and it was well-received.
  - Explicit about wanting to fix things at the source (skills) rather than hack around them (critic cleanup). "Rather than the drafting agent just cleaning this up, can we not update the skills for hook + narrative to make sure they don't hallucinate?" — the ethos.

## 9. Next steps — pick one

The user will likely tell you which they want. Options roughly in priority order:

1. **Build `bin/ge-chain.ts`** — a ~20 line helper that runs all 6 stages in sequence, extracts JSON between them, writes final tweets. Eliminates 60 seconds of per-run friction for CLI testing. Low-risk, high-value.
2. **Tighten the prompt / normalization around grounded shorthand** — the live chain is working, but `1 million` → `1M+` is still slipping through and getting flagged by the warning system.
3. **Port true deeper research to skills** — current `deepen` just re-runs `research`; if deeper iteration quality matters, build a real `deeper-research` skill instead of assuming parity with the old bespoke agent.
4. **Programmatic voice check** — regex in the shared deterministic runner for em-dashes, hyphens, banned constructions ("Not X, but Y", "It's not X. It's Y") in hook and draft-tweet output. Warning-level to match existing pattern.
5. **Improve sheet-sync ergonomics** — likely highest non-architecture UX win:
   - better skip diagnostics for `/api/sync/pull`
   - optional admin sync button/page instead of hitting raw API URLs
   - maybe add `*.tsbuildinfo` to `.gitignore`
6. **Port weekly-planner agents to skills** — 4 skills: `weekly-synthesis`, `weekly-slot-plan`, `weekly-slot-draft`, `weekly-bulk-draft`. Only do this if user asks; they haven't signalled it.
7. **Port `runMetricResearchAgent`** — for "single" mode in UI. Same caveat as above.
8. **Tear out `src/utils/agents.ts`** — only once the remaining UI/API surfaces are fully rewired. Big cleanup moment. **Do not do this prematurely** — the app still has safety-net dependencies on it.

## 10. Rules of the road

- Never create new markdown/docs files unless explicitly asked. (This HANDOVER.md was explicitly requested.)
- Default to no comments in code. Only comment non-obvious *why*.
- Never amend git commits; always create a new one.
- Never run `git push --force` or destructive git without explicit permission.
- Don't delete `src/utils/agents.ts`, the old API routes, or the old `growth-engine` repo without explicit permission. They are safety nets.
- Don't "fix" the model ID to 4-5. It's intentionally 4-6.
- Don't add error handling for scenarios that can't happen. Trust the harness.
- User prefers one bundled commit when the changes are coherent, not many small ones.
- Do not commit real secrets from `.env`. The user once pasted the real Google private key into chat while debugging; advise rotating if it happens again.

Good luck.
