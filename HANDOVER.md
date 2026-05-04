# Handover — `thin-growth-engine`

Read this before touching code. This repo has moved materially since the original research-pipeline migration, and older assumptions about `src/utils/agents.ts` are now stale.

## TL;DR

`thin-growth-engine` is a Next.js rebuild of the user's older `growth-engine` app using a **thin harness / fat skills** architecture:

- `skills/*.md` hold model-facing behavior
- `src/harness/*` holds generic execution, tool-use, prompt loading, parsing, and deterministic post-processing
- `src/workflows/*` holds app-level orchestration
- routes adapt UI/API shapes to those workflows

As of this handover:

- the main staged research workflow is harness-backed
- weekly planning is now also harness-backed
- bespoke mode is harness-backed
- quick metrics mode is harness-backed
- internal-only narrative generation is harness-backed
- direct drafting no longer depends on prompt constants in `src/utils/agents.ts`
- sheet sync is working with explicit push / reconcile controls in the nav
- `src/utils/agents.ts` is now effectively a compatibility shim, not the source of truth

Recent important quality fixes:

- internal-only drafting now prefers current immutable facts over older overlapping ones
- internal-only drafting no longer reintroduces stale DB facts after metric selection
- time qualifiers like `in under a year` are now constrained to the exact fact they came from
- weekly planner now has a bulk draft-method control so all 15 slots can be flipped to `internal`, `quick`, or `research` at once

## Identity / access

- User: Tom Humphrey (`tomhumphrey010@gmail.com`)
- Repo: `tomhwrites/thin-growth-engine`
- Working directory: `/Users/tomh/thin-growth-engine`
- Old repo still exists and should be left alone unless explicitly requested:
  `/Users/tomh/growth-engine`
- Auth: Supabase SSR + Google OAuth, restricted by middleware to Tom’s email
- Default expectation from the user now:
  when work is complete, commit and push by default

Latest known main commits at handover:

- `f078a56` `Add bulk draft mode control to weekly planner`
- `f2db8c5` `Update generated Next env types import`
- `a5e837c` `Prefer current immutable facts in internal drafts`
- `7482193` `Tighten internal-only fact grounding`
- `10981a8` `Fix sheet sync auth loopback and nav errors`
- `c83e06b` `Port weekly and prompt-heavy flows to skills`

## Current architecture

### 1. Skills = prompt authority

Core skill directories/files:

- `skills/_context/business.md`
- `skills/_context/tweet-voice.md`
- `skills/_context/weekly-planner.md`
- `skills/belief.md`
- `skills/evidence.md`
- `skills/research.md`
- `skills/narrative.md`
- `skills/hook.md`
- `skills/draft-tweet.md`
- `skills/critic.md`
- `skills/critic-rewrite.md`
- `skills/metrics.md`
- `skills/internal-narrative.md`
- `skills/weekly-synthesis.md`
- `skills/weekly-plan.md`
- `skills/direct-draft.md`
- `skills/direct-draft-internal.md`
- `skills/direct-draft-openai.md`

Rule of thumb:

- voice, drafting rules, falsifiability rules, output contracts, anti-hype rules:
  go in skills
- orchestration, parsing, ranking, DB access, sync, route contracts:
  stay in TypeScript

### 2. Thin harness = generic skill execution

Important harness files:

- `src/harness/loop.ts`
  - loads a skill definition
  - loads context
  - runs Anthropic tool-use loop
  - supports optional Anthropic web search
  - includes retry handling for transient rate/connection issues
- `src/harness/skillLoader.ts`
  - loads skill frontmatter/body
  - builds the full system prompt from contexts + skill body + learned notes
- `src/harness/tools.ts`
  - custom tools exposed to skills:
    - `fetchExemplars`
    - `persistDataPoints`
    - `queryDataPoints`
- `src/harness/execute.ts`
  - shared deterministic runner used by routes/workflows
  - runs a skill, parses JSON, applies postprocessing, returns warnings
- `src/harness/postprocess.ts`
  - grounding checks
  - narrative citation resolution

### 3. Shared services / adapters

- `src/lib/dataPoints.ts`
  - DB retrieval logic for internal facts
  - includes immutable-topic fallback behavior
  - now suppresses overlapping stale immutable fact families in some cases
- `src/lib/exemplars.ts`
  - shared exemplar lookup
- `src/lib/googleSheets.ts`
  - low-level Google Sheets read/write helpers
- `src/lib/sheetSync.ts`
  - higher-level push / pull / reconcile logic
- `src/lib/directDraftPrompt.ts`
  - OpenAI direct-draft user prompt assembly
- `src/lib/skillArgs.ts`
  - aliasing of camelCase args to uppercase snake-case prompt args
- `src/lib/tweetOutput.ts`
  - tweet parsing helpers

### 4. Workflow layer

- `src/workflows/researchPipeline.ts`
  - staged research workflow adapter
- `src/workflows/tweetDrafting.ts`
  - shared hook -> draft -> critic path
- `src/workflows/weeklyPlanner.ts`
  - weekly synthesis / planning / slot drafting orchestration

### 5. Routes

Main user-facing routes:

- `src/app/api/research-pipeline/route.ts`
- `src/app/api/fetchMetrics/route.ts`
- `src/app/api/fetchInternalData/route.ts`
- `src/app/api/generate-tweets/route.ts`
- `src/app/api/weekly-planner/route.ts`
- `src/app/api/bespoke-agent/route.ts`
- `src/app/api/sync/pull/route.ts`
- `src/app/api/sync/push/route.ts`
- `src/app/api/sync/reconcile/route.ts`

### 6. Transitional file

- `src/utils/agents.ts`

This file is no longer prompt authority. It should be treated as a compatibility surface only. Do not grow new prompt logic there.

## Data model and sync model

### DB tables that matter

#### `DataPoints`

Used for reusable factual claims.

Fields that matter most:

- `claim`
- `category`
- `sourceUrl`
- `sourceType`
- `asOfDate`
- `archived`
- `updatedAt`

Current `sourceType` meanings in practice:

- `immutable` = curated Immutable-specific fact
- `verified`
- `manual`
- `agent`

#### `ExemplarTweets`

Used for style / archetype exemplars.

User-facing label is `archetype`, but physical DB column remains `content_topic` via Prisma `@map`.

### Google Sheets tabs

The app’s sync model now assumes these tabs:

- `data_points`
- `immutable_facts`
- `exemplar_tweets`

Current intended source-of-truth model:

- `data_points`
  - runtime source is DB
  - sheet is an edit/sync surface
- `immutable_facts`
  - curated fact sheet for Immutable-specific reusable facts
  - pulled into `DataPoints` with `sourceType = "immutable"`
- `exemplar_tweets`
  - sheet is intended source of truth
  - push is opt-in for exemplars
  - pull / reconcile is the normal path

### Sync behavior

Top nav now exposes:

- `Push research to sheet`
  - DB -> sheet
  - pushes `data_points` and `immutable_facts`
  - does not push exemplars unless explicitly requested at the route level
- `Reconcile sheet edits`
  - pull sheet -> DB
  - then push DB -> sheet

Important fix from this session history:

`/api/sync/reconcile` no longer calls `/api/sync/pull` and `/api/sync/push` via authenticated loopback HTTP. It now executes shared sync functions directly via `src/lib/sheetSync.ts`, which fixed the HTML/login-page JSON parse failure.

## Current user-facing workflows

### 1. Single tweet generator — deep research

UI:

- `src/components/TweetGenerator.tsx`

Route:

- `/api/research-pipeline`

Workflow:

- `belief`
- `evidence`
- `research`
- `narrative`
- `hook`
- `draft-tweet`
- `critic`

Key files:

- `src/workflows/researchPipeline.ts`
- `src/workflows/tweetDrafting.ts`

Data sources:

- existing DB facts via `queryDataPoints`
- live web search in `research` skill
- exemplar DB rows via `fetchExemplars`

Writes:

- new research findings can be persisted to `DataPoints`

### 2. Single tweet generator — quick research

UI:

- `TweetGenerator` with `dataSource = "quick"`

Routes:

- `/api/fetchMetrics`
- `/api/generate-tweets`

Workflow:

- `metrics`
- `direct-draft` for Anthropic path
- `direct-draft-openai` system prompt for OpenAI path

Data sources:

- live web research through the `metrics` skill
- exemplar lookup during direct drafting
- additional DB facts via `queryDataPoints` in the Anthropic direct-draft skill

No staged belief/evidence/research pipeline here; this is a shortcut path.

### 3. Single tweet generator — internal only

UI:

- `TweetGenerator` with `dataSource = "internal"`

Routes:

- `/api/fetchInternalData`
- `/api/generate-tweets`

Workflow:

- retrieve relevant `DataPoints` via `getRelevantDataPoints(...)`
- run `internal-narrative`
- run `direct-draft-internal` for Anthropic path
- OpenAI path skips live web search when `dataSource = "internal"`

Data sources:

- DB only
- especially `DataPoints` rows including `sourceType = "immutable"`

Important recent fixes:

- retrieval now includes immutable-topic fallback for Immutable-related prompts
- internal-only drafting no longer does an extra fact lookup that can reintroduce stale rows
- overlapping stale immutable metrics are partially suppressed
- time qualifiers cannot be detached and reapplied to other facts

### 4. Weekly planner

UI:

- `src/components/WeeklyPlanner.tsx`

Route:

- `/api/weekly-planner`

Workflow orchestration:

- `src/workflows/weeklyPlanner.ts`

Subflows:

- `synthesize` -> `weekly-synthesis`
- `plan` -> `weekly-plan`
- `draft_slot` / `draft_all` -> one of:
  - research mode
  - quick mode
  - internal mode

Weekly drafting modes:

- `research`
  - belief -> evidence -> research -> narrative -> hook -> draft-tweet -> critic
- `quick`
  - metrics -> hook -> draft-tweet -> critic
- `internal`
  - DB fact retrieval -> internal narrative assembly -> hook -> draft-tweet -> critic

Recent weekly changes:

- weekly planner migrated off old inline prompt authority and onto skills/workflows
- a bulk draft-mode control now lets the user set all 15 slots to `internal`, `quick`, or `research`

Current default 15-slot BAU sequence:

1. Payments -> comparison
2. Identity / Attribution -> multiparagraph
3. New combined Web3 thesis -> multiparagraph
4. Product Launch / Update -> comparison
5. Macro trends / Regulation -> multiparagraph
6. Community engagement -> oneliner
7. Ecosystem Traction -> hookbullets
8. Web2 will become Web3 -> multiparagraph
9. Macro trends / Regulation -> multiparagraph
10. Vision / Industry Thesis -> multiparagraph
11. New combined Web3 thesis -> multiparagraph
12. Mobile gaming -> hookbullets
13. AI gaming -> multiparagraph
14. Community engagement -> oneliner
15. Web3 gaming = Future -> hookbullets

Subtle but important default behavior:

- empty planner slots default to `draftMode = "research"`
- clicking `Use Default Weekly Schedule` builds BAU slots with `draftMode = "quick"`

### 5. Bespoke agent workbench

UI:

- `src/components/BespokeAgentWorkbench.tsx`

Route:

- `/api/bespoke-agent`

Workflow:

- route parses the freeform UI text into structured payloads
- then calls skills via `executeSkill()`
- stages supported:
  - belief
  - evidence
  - research
  - narrative
  - hook
  - draft
  - critic

Special case:

- `critic` uses `critic-rewrite`, not the standard stage-6 `critic`

This path is harness-backed but still has a custom parsing/formatting adapter layer in the route.

## Harness tools and where skills get info from

### `fetchExemplars`

Source:

- `ExemplarTweets` DB table

Used by:

- `hook`
- `draft-tweet`
- `direct-draft`
- `direct-draft-internal`

Purpose:

- structural reference by form/style
- content-angle reference by archetype
- hook pattern reference by hook type

### `queryDataPoints`

Source:

- `DataPoints` DB table

Ranking:

- `immutable` > `verified` > `manual` > `agent`

Used by:

- `belief` indirectly via skill/tool usage if requested
- `research`
- `draft-tweet`
- `direct-draft`

Not used by:

- `direct-draft-internal`

### `persistDataPoints`

Writes to:

- `DataPoints`

Used by:

- `research`

Purpose:

- save new reusable findings discovered by research

### Anthropic web search

Enabled only for skills whose frontmatter sets `web_search: true`.

Main web-searching skills:

- `research`
- `metrics`

Not used by:

- `internal-narrative`
- `direct-draft-internal`
- weekly internal mode

## Recent changes that matter

### Major architecture changes

- migrated prompt-heavy behavior out of `src/utils/agents.ts`
- added shared skill loader and exemplar services
- weekly planner moved to skill-backed workflows
- bespoke mode moved to `executeSkill()`
- metrics route moved to `metrics` skill
- internal narrative route moved to `internal-narrative`
- direct generation no longer imports prompt authority from `agents.ts`

### Sync / data changes

- added dedicated top-nav buttons for pushing research and reconciling sheet edits
- fixed reconcile auth loopback bug
- formalized `immutable_facts` as the curated sheet/tab for Immutable-specific facts

### Quality / grounding changes

- internal-only mode now uses `direct-draft-internal`
- OpenAI direct generation respects `dataSource = "internal"` and skips web search there
- retrieval now prefers current immutable facts in some overlapping families
- drafting rules now forbid moving a time qualifier from one fact to another

### UI changes

- weekly planner now includes a bulk draft-mode control

## Outstanding TODOs

### High-priority / likely next asks

1. Improve immutable fact conflict handling beyond the current heuristics.
   The current supersession logic covers some overlapping families like audience scale and game count, but it is still heuristic-based. If the fact sheet gets richer, a more explicit canonicalization strategy may be needed.

2. Make `immutable_facts` taxonomy more deliberate.
   Retrieval works better now, but user-entered `category` values still matter. If rows use generic categories like `Users`, retrieval is less semantically clean than rows tagged with product/topic categories like `Immutable Play`, `Passport`, `Audience`, etc.

3. Consider slimming the `immutable_facts` sheet schema if the user asks.
   The user has already questioned whether all current columns are necessary.

4. Eventually remove `src/utils/agents.ts`.
   Only do this once every remaining compatibility dependency is gone.

5. OpenAI runtime verification remains environment-dependent.
   The code path was fixed, but on this machine OpenAI testing has previously been blocked by missing local API env vars.

### Lower-priority cleanup

6. Improve diagnostic visibility for internal fact selection.
   Right now, if a stale fact slips through, it requires code inspection rather than a transparent “facts used / fact source” UI.

7. Consider a stronger canonical fact model.
   Today `DataPoints` is still flat claims. If contradictions become common, a more structured fact schema could reduce ambiguity.

8. Generated file churn.
   `next-env.d.ts` can change due to local Next dev behavior. This is harmless but noisy.

### Explicitly deferred by user

9. Ending-style schema / Google Sheet tagging for closer types.
   User said they would add the taxonomy/content themselves later. If resumed:
   - keep the tags user-managed in Sheets / DB
   - wire behavior via skills, not `src/utils/agents.ts`

## Gotchas / rules

- Do not add new prompt logic to `src/utils/agents.ts`.
- Do not regress hook outputs from typed objects back to plain strings.
- Do not rename the physical DB `content_topic` column unless explicitly asked.
- Do not assume Google Sheets edits are live until they are pulled into DB.
- Internal-only mode is DB-backed, not sheet-backed directly.
- The app is auth-protected by middleware. HTML/login-page responses can appear if auth is broken.
- When asked for “latest”, verify with current data/web if the path relies on live information.
- The user prefers concise answers, honest corrections, and source-level fixes rather than cosmetic cleanups.
- The user now expects coherent completed changes to be committed and pushed by default.

## Recommended files to read first

1. `src/harness/loop.ts`
2. `src/harness/execute.ts`
3. `src/harness/postprocess.ts`
4. `src/harness/tools.ts`
5. `src/lib/dataPoints.ts`
6. `src/workflows/researchPipeline.ts`
7. `src/workflows/tweetDrafting.ts`
8. `src/workflows/weeklyPlanner.ts`
9. `src/app/api/research-pipeline/route.ts`
10. `src/app/api/weekly-planner/route.ts`
11. `src/app/api/generate-tweets/route.ts`
12. `src/lib/sheetSync.ts`
13. `src/components/TweetGenerator.tsx`
14. `src/components/WeeklyPlanner.tsx`
15. `skills/_context/tweet-voice.md`

## Environment

Expected env keys include:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `ANTHROPIC_API_KEY`
- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- OpenAI key if testing OpenAI path:
  - `OPEN_AI_API_SECRET` or `OPENAI_API_KEY`

Notes:

- after env changes, restart dev server
- Google private key must be newline-escaped in env
- local Supabase auth settings must point to localhost for local OAuth to work
