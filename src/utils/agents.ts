// utils/agents.ts
// Modular agent functions for the research-driven tweet pipeline.
// Each agent is a pure function: structured input -> Claude call -> structured output.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import {
  getRelevantDataPoints,
  formatDataPointsForPrompt,
  persistResearchAsDataPoints,
} from "@/lib/dataPoints";
import {
  hookTypeOptions,
  tweetStyles,
  type Archetype,
  type HookType,
} from "@/utils/tweetConfig";
import {
  ARCHETYPE_DEFAULTS,
  buildDefaultWeeklyPlanSlots,
  type AudienceLens,
  type WeeklySlotDraft,
  type WeeklyInput,
  type WeeklyNarrative,
  type WeeklyPlanSlot,
  type WeeklySynthesis,
  WEEKLY_AUDIENCE_OPTIONS,
  WEEKLY_ARCHETYPE_OPTIONS,
  WEEKLY_SLOT_COUNT,
} from "@/types/weeklyPlanning";
import type { HookDraft, HookOutput } from "@/types/researchPipeline";

export type { HookDraft, HookOutput } from "@/types/researchPipeline";

export type ExemplarSets = { formExemplars: string; archetypeExemplars: string };

const hookTypeGuide = hookTypeOptions
  .map((option) => `- ${option.label}: ${option.description}`)
  .join("\n");

const allowedHookTypes = new Set(hookTypeOptions.map((option) => option.value));

function normalizeHookType(value: unknown): HookType {
  return allowedHookTypes.has(value as HookType)
    ? (value as HookType)
    : "Thesis statement";
}

function normalizeHookOutput(payload: unknown): HookOutput {
  const hooks = Array.isArray((payload as { hooks?: unknown })?.hooks)
    ? (payload as { hooks: unknown[] }).hooks
    : [];

  return {
    hooks: hooks
      .map((hook) => {
        if (typeof hook === "string") {
          const text = hook.trim();
          return text
            ? {
                type: "Thesis statement" as HookType,
                text,
              }
            : null;
        }

        if (hook && typeof hook === "object") {
          const record = hook as Record<string, unknown>;
          const text = String(record.text ?? "").trim();
          if (!text) return null;
          return {
            type: normalizeHookType(record.type),
            text,
          };
        }

        return null;
      })
      .filter((hook): hook is HookDraft => Boolean(hook))
      .slice(0, 3),
  };
}

// ---------- Immutable business context ----------
// Injected into the tweet drafter's system prompt so every generated tweet is
// grounded in an accurate understanding of Immutable's products, market, and
// strategic positioning. Edit this constant to update what the model "knows"
// about the business — changes apply to both the direct and research-pipeline
// generation paths.
export const IMMUTABLE_CONTEXT = `Immutable – Product, Business Model, and Strategic Context

Overview:
Immutable is a web3 gaming platform building the operating system for game growth, identity, and monetisation.

It provides:
- Blockchain infrastructure (Immutable zkEVM / "Immutable Chain")
- Growth + data tooling (Audience)
- Distribution + engagement layer (Play)
- Identity + wallet system (Passport + Unified Player Identity)

Its goal is to solve three core problems for game studios:
1. Growth (user acquisition + engagement)
2. Attribution (understanding users across fragmented platforms)
3. Monetisation (payments, economies, and long-term LTV)

Market Context:
- Gaming is a ~$250B+ market with ~3.3B players.
- Growth is getting harder due to:
  - Increased competition (supply explosion of games)
  - ATT / IDFA reducing ad effectiveness
  - Fragmented player surfaces (Steam, Discord, socials, etc.)
- Monetisation is inefficient:
  - App stores take ~30% fees
  - By contrast, stablecoin payments can cost ~1–1.5% in fees — this is a broader crypto/web3 advantage, not an Immutable-specific feature. The implication: games will eventually migrate to web3 gaming because the economics are dramatically cheaper than app store distribution.
- Player identity is fragmented across platforms.

This creates large opportunities in:
- Ads & attribution (~$60–70B)
- Payments (~$20–25B in fees)
- In-game monetisation (~$150B annually)

Core Products:

1. Immutable zkEVM ("Immutable Chain")
- Ethereum L2 blockchain for games
- Enables NFTs and on-chain economies
- Supports gas-free transactions
Problems solved: limited monetisation models, fragmented asset liquidity.
Outcome: higher margins + player-owned economies + secondary markets.

2. Immutable Play (Distribution + Engagement Layer)
- A game discovery platform (similar to Steam)
- Includes quests, rewards, and engagement systems
- Uses token incentives (IMX) to drive player behaviour
Key features: game discovery + hosting; quest-based engagement (watch, follow, play); social proof and early traction generation; stablecoin + blockchain-based monetisation.
Includes Perpetual Rewards: weekly rewards program for players.
Problems solved: cold start problem ("empty restaurant problem"), low early engagement, weak community growth.
Outcome: early traction, retention, and player activation.

3. Immutable Audience (B2B Growth Platform / CDP)
- A data + AI-powered growth platform sold to game studios
Core components: Audience CDP (customer data platform), Game Page (high-conversion funnel), Engage (email + lifecycle automation), Amplify (social + creator attribution), AI Audience Copilot.
Capabilities: unified player profiles across platforms; cross-channel attribution; segmentation + targeting; automated engagement (email, quests); predictive insights (player value, conversion likelihood).
Problems solved: most games fail at launch due to poor audience quality; wishlists are cold, low-conversion, and uncontactable; attribution is broken post-ATT; data is fragmented across platforms; marketing spend is inefficient.
Outcome: build high-quality, engaged audiences and convert them at launch.

4. Immutable Passport (Wallet + Identity Layer)
- A crypto wallet automatically created for all users
- Uses simple onboarding (email/social login)
- Abstracts away crypto complexity
Capabilities: one identity across games and platforms; stores assets, rewards, and transaction history; feeds data into Audience.
Problems solved: web3 onboarding friction, lack of user ownership by developers, poor personalisation.
Outcome: seamless onboarding + higher conversion + better data.

5. Unified Audience Profile (UAP)
- A gaming-native identity and attribution layer
- Aggregates data across on-chain activity, games, and social platforms (Discord, X, Reddit, etc.)
Capabilities: single view of each player; cross-game identity; attribution + behavioural insights; personalisation and targeting.
Key insight: Immutable can see users across multiple games, creating a unique data advantage.
Problems solved: fragmented identity across platforms, lack of attribution visibility, no cross-game network effects.
Outcome: a unified player graph powering growth and monetisation.

System-Level Advantage:
Immutable is vertically integrated across:
- Growth → Audience
- Identity → Passport + UPI
- Monetisation → Chain
- Distribution → Play

This creates: a unified data layer across all games; cross-game network effects; shared liquidity and users; better attribution and targeting.

Core insight: games don't need point solutions — they need a system that connects who the player is, how to acquire them, how to engage them, and how to monetise them. Immutable provides this as a single platform.

Customers:
- Game studios (primary customer for Audience + infrastructure)
- Players (users of Play + Passport)
- IMX investors (token ecosystem participants)

Key Concepts:
- CDP (Customer Data Platform): Collects, unifies, and activates user data into a single profile for targeting and engagement.
- Unified Player Identity (UPI): A persistent identity layer across games, wallets, and platforms enabling attribution, personalisation, and network effects.

Strategic Positioning:
Immutable is evolving from "Blockchain infrastructure for games" to "The operating system for game growth, identity, and monetisation".`;

// Primary editable base prompt for tweet-writing agents. If you want to change
// the global style guardrails, edit this constant first.
export const SHARED_TWEET_BASE_PROMPT = `You are an elite crypto Twitter ghostwriter. You draft tweets that drive engagement among crypto VCs, players, and game studios.

You are writing on behalf of Immutable. Use the business context above to ground every tweet in an accurate understanding of Immutable's products, market, and positioning. Reference specific Immutable products (zkEVM, Play, Audience, Passport, UAP) by name when relevant.

Rules:
- The account should leave sophisticated readers more bullish on Immutable's strategy, traction, and category direction
- No emojis, no hashtags, no hyphens
- No engagement bait ("like if you agree", "RT this")
- Use crypto Twitter native lingo and abbreviations naturally
- Every tweet must reference at least one specific data point
- Prioritize brevity, by using short, punchy sentences. However, do not have too many short sentences of the same length beside each other.
- If you mention friction, skepticism, or a counter-signal, use it only to sharpen a stronger evidence-backed bullish takeaway
- Do not write tweets whose main impression is that Immutable is weak, fragile, overhyped, failing, or structurally broken
- Do not open with a stat or framing whose plain-language reading is that web3 gaming or Immutable is struggling, niche, or unproven. Only cite data that frames the market as a growing opportunity or Immutable as a credible leader within it.
- Limit each tweet to 280 characters
- Output ONLY the tweets separated by "||" - no labels, numbering, or commentary
- Do not make vague statements (i.e. "this changes everything"). Instead make specific, falsifiable statements that cite evidence or data
- There are specific crypto terms you can and cannot use. Do not directly reference the following words and phrases: crypto, IMX, NFT, blockchain. Instead, where necessary, reference these words and phrases: web3 gaming, rewards, digital ownership, onchain, chain, wallet, in-game assets.

Core constraints:
- Vary sentence length aggressively. Include short, blunt sentences and occasional long ones.
- Use fragments where natural.
- Avoid balanced or symmetrical phrasing.

Banned constructions (do not use):
- "Not X, but Y", "It's not just X, it's Y", "That's not X. That's Y", or any other construction where you contrast two ideas in this way
- "On one hand... on the other..."
- "In conclusion," "Overall," "Ultimately"
- "It's important to note," "It's worth noting"
- "This highlights," "This underscores," "This demonstrates"
- "Let's explore," "Let's dive into"
- Question then answer structures ("Why does this matter? Because...")

Punctuation rules:
- Do not use em dashes.
- Minimise semicolons and colons.
- Avoid list-heavy formatting unless explicitly requested.

Diction rules:
- Prefer concrete, specific words over abstract ones.
- Avoid generic "smart" words: robust, nuanced, comprehensive, multifaceted, leverage, utilize, navigate, foster.
- Avoid filler phrases and corporate language.
- Use precise nouns. Include names, numbers, or tangible details where possible.`;

function buildTweetAgentSystemPrompt(
  taskSpecificInstructions: string,
  options: {
    overrideBaseOutputFormat?: boolean;
    overrideBaseFullTweetRequirements?: boolean;
  } = {}
): string {
  const sections = [SHARED_TWEET_BASE_PROMPT];

  if (options.overrideBaseOutputFormat || options.overrideBaseFullTweetRequirements) {
    const overrideLines = ["Task-specific override:"];
    if (options.overrideBaseFullTweetRequirements) {
      overrideLines.push(
        "- You may be generating or evaluating parts of tweets rather than full tweets. In that case, keep the shared voice and forbidden-term rules, but apply full-tweet requirements only to final tweet drafts or rewrites."
      );
    }
    if (options.overrideBaseOutputFormat) {
      overrideLines.push(
        '- When the task below asks for a different output format, follow that format instead of the base "||"-separated tweet output rule.'
      );
    }
    sections.push(overrideLines.join("\n"));
  }

  sections.push(taskSpecificInstructions);
  return sections.join("\n\n");
}

// Map frontend style IDs to database style names. Single source of truth —
// imported by both /api/generate-tweets and /api/research-pipeline.
export const dbStyleMapping: Record<string, string> = {
  multiparagraph: "Multiple paras",
  bigpara: "Big para",
  stackedlines: "Stacked lines",
  hookbullets: "Hook + list",
  causeeffect: "Cause + effect 2 liner",
  oneliner: "One liner",
  parallelism: "Parallelism",
  comparison: "Comparison",
  catchphrase: "One liner",
};

// Fetches exemplar tweets in two buckets:
// 1. Form exemplars — tweets matching the selected style (for structural reference)
// 2. Archetype exemplars — tweets matching the selected archetype (for propositional content)
// When a perfect match (style + topic) exists those tweets count toward both.
export async function getExemplarsForStyle(
  tweetStyle: string,
  archetype?: string
): Promise<{ formExemplars: string; archetypeExemplars: string }> {
  const dbStyle = dbStyleMapping[tweetStyle] || dbStyleMapping.oneliner;

  const format = (tweets: any[]) =>
    tweets
      .map(
        (t, i) =>
          `Example ${i + 1} (Archetype: ${t.archetype}; Hook type: ${t.hook_value || "Unspecified"}):\n"${t.tweet_text}"`
      )
      .join("\n\n");

  // Always fetch form exemplars (style-only)
  const formTweets = await prisma.exemplarTweets.findMany({
    select: {
      tweet_text: true,
      archetype: true,
      hook_value: true,
    },
    where: { tweet_style: dbStyle, archived: false },
    take: 5,
  });

  if (!archetype) {
    return { formExemplars: format(formTweets), archetypeExemplars: "" };
  }

  // Fetch archetype exemplars (archetype, any style)
  const archetypeTweets = await prisma.exemplarTweets.findMany({
    select: {
      tweet_text: true,
      archetype: true,
      hook_value: true,
    },
    where: { archetype, archived: false },
    take: 5,
  });

  return {
    formExemplars: format(formTweets),
    archetypeExemplars: format(archetypeTweets),
  };
}

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

export async function callClaude(
  system: string,
  userPrompt: string,
  maxTokens = 1000,
  options: { webSearch?: boolean; maxSearches?: number; includeBusinessContext?: boolean } = {}
): Promise<string> {
  const client = getClient();
  // When includeBusinessContext is set, prepend IMMUTABLE_CONTEXT as a
  // separate, cacheable system block. Anthropic caches the block across
  // calls so we only pay for it once per ~5 minute window even though
  // every agent in the pipeline opts in.
  const systemParam: any = options.includeBusinessContext
    ? [
        {
          type: "text",
          text: IMMUTABLE_CONTEXT,
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: system },
      ]
    : system;
  const params: any = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemParam,
    messages: [{ role: "user", content: userPrompt }],
  };
  if (options.webSearch) {
    params.tools = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: options.maxSearches ?? 3,
      },
    ];
  }
  // Retry on transient overload/rate-limit errors with exponential backoff.
  // Anthropic returns 529 (overloaded) and 429 (rate limited) under load —
  // both are worth a few quick retries before bubbling the failure up.
  const maxAttempts = 4;
  let completion: any;
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      completion = await client.messages.create(params);
      lastError = null;
      break;
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.response?.status;
      const retryable = status === 529 || status === 503 || status === 429;
      if (!retryable || attempt === maxAttempts) throw err;
      const delayMs = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      console.warn(
        `[callClaude] ${status} on attempt ${attempt}/${maxAttempts}, retrying in ${delayMs}ms`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  if (!completion) throw lastError;
  if (Array.isArray(completion.content)) {
    return completion.content
      .filter((seg: any) => seg.type === "text")
      .map((seg: any) => seg.text)
      .join("");
  }
  return completion.content as string;
}

export interface MetricResearchResult {
  metrics: string[];
  overarchingNarrative: string;
}

function stripTopicForMetrics(topic: string): string {
  const cleanedTopic = topic
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleanedTopic.split(" ").filter(Boolean);
  return words.slice(0, 4).join(" ");
}

export async function runMetricResearchAgent(
  topic: string
): Promise<MetricResearchResult> {
  const searchQuery = topic ? stripTopicForMetrics(topic) : "Web3 Gaming";
  const metricPrompt = await prisma.systemPrompts.findFirst({
    where: { name: "metrics" },
  });

  const raw = await callClaude(
    `You are a helpful research assistant that uses web search to find concrete, current metrics and data points for content creation.

You are supporting Immutable's founder account.

Rules:
- Always prefer hard numbers from primary sources over inferred figures
- Prioritize evidence that supports a credible, net-bullish narrative about Immutable, web3 gaming, or the market shift being discussed
- If you encounter caveats, do not center them unless they materially change the thesis
- The overarching narrative should make readers more optimistic about Immutable's position while staying specific and evidence-backed`,
    `Research the latest news, data, and developments about "${searchQuery}" using web search. Pull concrete, recent metrics and data points from reputable sources.

${metricPrompt?.prompt || ""}

At the end of your response use the characters || to then add a 1-2 sentence summary of the overarching narrative most relevant to a tweet about ${searchQuery}.

That narrative must be net bullish for Immutable's founder account. It may acknowledge one tension, but it must resolve into a stronger optimistic conclusion and must not read like skepticism or short-seller copy.`,
    1500,
    { webSearch: true, maxSearches: 3, includeBusinessContext: true }
  );

  let metricsText = raw;
  let overarchingNarrative = "";
  const narrativeSplit = raw.split("||");
  if (narrativeSplit.length > 1) {
    metricsText = narrativeSplit[0].trim();
    overarchingNarrative = narrativeSplit[1].trim();
  } else {
    // No delimiter found — use the full response as the narrative so the
    // tweet drafter receives real research context instead of an empty string.
    overarchingNarrative = raw.trim();
  }

  return {
    metrics: metricsText
      .split(",")
      .map((metric) => metric.trim())
      .filter((metric) => metric.length > 0),
    overarchingNarrative,
  };
}

// ---------- 1. Belief Agent ----------

export interface Belief {
  belief: string;
  whyItMatters: string;
}

export async function runBeliefAgent(topic: string): Promise<Belief[]> {
  const system = `You are a growth-minded crypto investor and editorial strategist writing on behalf of Immutable.

Task: Given a topic, generate 3 concrete, falsifiable beliefs that would make the strongest evidence-backed bullish case for Immutable in this context.

Constraints:
- Each belief must be specific (not generic or vague)
- Each belief must imply measurable validation (data could prove/disprove it)
- Prioritize beliefs that are likely to be supportable with current public evidence or disclosed company information
- Prefer beliefs about traction, product edge, distribution, monetisation, studio adoption, ecosystem scale, or category tailwinds
- Avoid beliefs that depend mainly on proving an absence, a missing dataset, or a negative counterfactual
- Each belief should map to at least one VC criterion:
  - Market size / TAM expansion
  - Traction (DAU, retention, revenue)
  - Product defensibility
  - Network effects
  - Token utility / liquidity
  - Distribution / partnerships
  - Founder quality
  - Macro alignment

Output format (exactly this, no extras):
1. Belief: [clear statement]
   Why it matters: [1 sentence VC reasoning]

2. Belief: [clear statement]
   Why it matters: [1 sentence VC reasoning]

3. Belief: [clear statement]
   Why it matters: [1 sentence VC reasoning]

Do not include fluff or explanations beyond this structure.`;

  const raw = await callClaude(system, `Topic: ${topic}`, 1000, {
    includeBusinessContext: true,
  });

  // Parse the structured output
  const beliefs: Belief[] = [];
  const blocks = raw.split(/\d+\.\s*Belief:\s*/i).filter(Boolean);
  for (const block of blocks) {
    const lines = block.trim().split("\n").filter(Boolean);
    const beliefText = lines[0]?.trim() || "";
    const whyLine = lines.find((l) => /why it matters/i.test(l));
    const whyText = whyLine?.replace(/^.*?why it matters:\s*/i, "").trim() || "";
    if (beliefText) {
      beliefs.push({ belief: beliefText, whyItMatters: whyText });
    }
  }
  return beliefs;
}

// ---------- 2. Evidence Agent ----------

export interface EvidenceNeed {
  belief: string;
  dataPointsNeeded: string[];
}

export async function runEvidenceAgent(
  topic: string,
  beliefs: Belief[]
): Promise<EvidenceNeed[]> {
  const system = `You are a research strategist for a crypto VC fund. Given a set of bullish investment beliefs about a topic, identify the specific data points or proof needed to validate each belief.

For each belief, list 2-3 specific, measurable data points that would serve as evidence. Be concrete - name the metric, the source type, and what a bullish signal would look like.
Prioritize proof that would strengthen a credible public-facing case for Immutable rather than abstract diligence hypotheticals.

Output format (exactly this, no extras):
Belief 1: [restate belief]
- Evidence needed: [specific data point]
- Evidence needed: [specific data point]
- Evidence needed: [specific data point]

Belief 2: ...

Do not include commentary beyond this structure.`;

  const beliefList = beliefs
    .map((b, i) => `${i + 1}. ${b.belief}`)
    .join("\n");

  const raw = await callClaude(
    system,
    `Topic: ${topic}\n\nBeliefs:\n${beliefList}`,
    1000,
    { includeBusinessContext: true }
  );

  const results: EvidenceNeed[] = [];
  const blocks = raw.split(/Belief \d+:\s*/i).filter(Boolean);
  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].trim().split("\n").filter(Boolean);
    const beliefText = lines[0]?.trim() || beliefs[i]?.belief || "";
    const dataPoints = lines
      .slice(1)
      .map((l) => l.replace(/^[-•]\s*Evidence needed:\s*/i, "").trim())
      .filter(Boolean);
    results.push({ belief: beliefText, dataPointsNeeded: dataPoints });
  }
  return results;
}

// ---------- 3. Research Agent ----------

export interface ResearchResult {
  belief: string;
  findings: string[];
}

// Filters out markdown noise that the model sometimes emits despite format instructions.
function isCleanFinding(line: string): boolean {
  if (!line) return false;
  if (/^[-#*_]{1,4}$/.test(line)) return false; // pure symbols: ---, ##, **
  if (/^\*\*/.test(line)) return false;          // bold headers like **Finding 1 —**
  if (line.length < 15) return false;            // too short to be a real data point
  return true;
}

export async function runResearchAgent(
  topic: string,
  evidenceNeeds: EvidenceNeed[]
): Promise<ResearchResult[]> {
  const system = `You are a senior crypto research analyst with access to live web search. Given specific data points needed to validate investment beliefs, use web search to find the most current, real data, statistics, and facts from reputable primary sources.

For each evidence need, search the web and provide the most relevant real data points. Include specific numbers, dates, company names, and source URLs where possible. Prefer primary sources (company blog posts, on-chain data, official reports) over secondary coverage.

Be factual and specific. No speculation. No hedging language.
Prioritize evidence that directly supports the bullish belief being tested. If there is an important caveat, include at most one, but do not let caveats dominate the findings.

STRICT OUTPUT FORMAT — follow this exactly, no exceptions:
Belief 1: [restate belief]
- Finding: [one sentence, specific data point with numbers]
- Finding: [one sentence, specific data point with numbers]
- Finding: [one sentence, specific data point with numbers]

Belief 2: [restate belief]
- Finding: [one sentence, specific data point with numbers]
...

CRITICAL FORMAT RULES:
- Each finding must be exactly ONE sentence. No paragraphs. No line breaks within a finding.
- No markdown: no **, no ##, no ---, no headers, no bold, no italics.
- No "Finding 1 —" labels. Just "- Finding:" followed by the sentence.
- No commentary, analysis, or caveats outside the finding lines.
- No blank lines within a belief block.`;

  const evidenceList = evidenceNeeds
    .map(
      (e, i) =>
        `Belief ${i + 1}: ${e.belief}\nData needed:\n${e.dataPointsNeeded
          .map((d) => `- ${d}`)
          .join("\n")}`
    )
    .join("\n\n");

  // Pull pre-existing data points so the model can reuse known facts instead
  // of re-researching them. This both saves credits and lets the human-curated
  // (manual/verified) facts override agent-found ones.
  const knownFacts = await getRelevantDataPoints(topic, 25);
  const knownFactsBlock = formatDataPointsForPrompt(knownFacts);

  const raw = await callClaude(
    system,
    `Topic: ${topic}\n\n${knownFactsBlock ? knownFactsBlock + "\n\n" : ""}${evidenceList}`,
    2000,
    { webSearch: true, maxSearches: 4, includeBusinessContext: true }
  );

  const results: ResearchResult[] = [];
  const blocks = raw.split(/Belief \d+:\s*/i).filter(Boolean);
  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].trim().split("\n").filter(Boolean);
    const beliefText = lines[0]?.trim() || evidenceNeeds[i]?.belief || "";
    const findings = lines
      .slice(1)
      .map((l) => l.replace(/^[-•]\s*Finding:\s*/i, "").trim())
      .filter(isCleanFinding);
    results.push({ belief: beliefText, findings });
  }

  // Persist new findings as atomized data points so future runs can reuse them.
  // Fire-and-forget — don't block the response on the write.
  persistResearchAsDataPoints(topic, results).catch((e) =>
    console.error("[research] persistResearchAsDataPoints failed:", e)
  );

  return results;
}

// ---------- 3b. Deeper Research Agent ----------
// Opt-in second pass over the research stage. Takes the prior findings and
// asks the model to identify gaps, contradictions, and underexplored angles,
// then run targeted web searches to fill them. Returns research in the same
// shape as runResearchAgent so downstream stages don't need to change.
//
// Re-callable: pass deepened research back in to keep drilling. Each call
// costs ~1 round of web search (~$0.04) plus tokens.

export async function runDeeperResearchAgent(
  topic: string,
  evidenceNeeds: EvidenceNeed[],
  priorResearch: ResearchResult[]
): Promise<ResearchResult[]> {
  const system = `You are a senior crypto research analyst doing a second-pass investigation. You already have first-pass findings for each belief — your job now is to go deeper.

For each belief, do all of the following:
1. Identify what is missing, weak, or contradictory in the prior findings
2. Use web search to find NEW data points that fill those gaps — do not restate what you already have
3. Prioritize: more recent data, primary sources, contradictory evidence, quantitative specifics (numbers/dates/names) over generalities
4. If a prior finding looks suspect or outdated, find a corroborating or refuting source

Output the FULL set of findings for each belief — prior findings you still trust PLUS new findings you discovered. Drop any prior findings that turned out to be wrong or unsupported. Be factual and specific. No speculation. No hedging.

STRICT OUTPUT FORMAT — follow this exactly, no exceptions:
Belief 1: [restate belief]
- Finding: [one sentence, specific data point with numbers]
- Finding: [one sentence, specific data point with numbers]
- Finding: [one sentence, specific data point with numbers]

Belief 2: [restate belief]
- Finding: [one sentence, specific data point with numbers]
...

CRITICAL FORMAT RULES:
- Each finding must be exactly ONE sentence. No paragraphs. No line breaks within a finding.
- No markdown: no **, no ##, no ---, no headers, no bold, no italics.
- No "Finding 1 —" labels. Just "- Finding:" followed by the sentence.
- No commentary or caveats outside the finding lines.`;

  const evidenceList = evidenceNeeds
    .map((e, i) => {
      const prior = priorResearch[i];
      const priorText = prior?.findings.length
        ? prior.findings.map((f) => `- ${f}`).join("\n")
        : "(no prior findings)";
      return `Belief ${i + 1}: ${e.belief}\nData needed:\n${e.dataPointsNeeded
        .map((d) => `- ${d}`)
        .join("\n")}\n\nPrior findings:\n${priorText}`;
    })
    .join("\n\n---\n\n");

  const raw = await callClaude(
    system,
    `Topic: ${topic}\n\n${evidenceList}`,
    2500,
    { webSearch: true, maxSearches: 4, includeBusinessContext: true }
  );

  const results: ResearchResult[] = [];
  const blocks = raw.split(/Belief \d+:\s*/i).filter(Boolean);
  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].trim().split("\n").filter(Boolean);
    const beliefText = lines[0]?.trim() || evidenceNeeds[i]?.belief || "";
    const findings = lines
      .slice(1)
      .map((l) => l.replace(/^[-•]\s*Finding:\s*/i, "").trim())
      .filter(isCleanFinding);
    results.push({ belief: beliefText, findings });
  }

  // Defensive fallback: if parsing produced nothing useful, return prior so
  // the user never loses existing findings to a bad parse.
  if (results.length === 0 || results.every((r) => r.findings.length === 0)) {
    return priorResearch;
  }

  persistResearchAsDataPoints(topic, results).catch((e) =>
    console.error("[deeper research] persistResearchAsDataPoints failed:", e)
  );

  return results;
}

// ---------- 4. Narrative Agent ----------

export interface NarrativeOutput {
  insight: string;
  angle: string;
  supportingData: string[];
}

export async function runNarrativeAgent(
  topic: string,
  research: ResearchResult[]
): Promise<NarrativeOutput> {
  const system = `You are the narrative strategist for Immutable's founder Twitter account. Given research findings about a topic, your job is to:

1. Synthesize the strongest evidence-backed, net-bullish insight for Immutable (1-2 sentences max)
2. Choose the single most effective narrative angle for Twitter from this list:
   - Contrarian: overturns a bearish misconception and lands on a more bullish conclusion
   - Inevitability: frames something as unstoppable
   - Hidden metric: reveals an overlooked data point
   - Reframe: changes how people think about something
   - Milestone: marks a significant achievement
   - Comparison: draws a powerful analogy
3. List the 3 strongest supporting data points

Rules:
- Start from the strongest positive or asymmetric takeaway supported by the data
- You may mention one caveat only if it sharpens a stronger bullish conclusion
- Do not center the narrative on missing data, weakness, fragility, or what has not yet been proven
- Do not make Immutable sound broken, overhyped, or structurally weak
- Prefer product edge, adoption, scale, monetisation, distribution, category shift, or strategic advantage
- Supporting data should mostly reinforce the bullish thesis rather than stacking caveats

Output format (exactly this):
Insight: [1-2 sentence synthesis]
Angle: [one of the angles above]
Data:
- [data point 1]
- [data point 2]
- [data point 3]

No commentary beyond this structure.`;

  const researchSummary = research
    .map(
      (r, i) =>
        `Belief ${i + 1}: ${r.belief}\nFindings:\n${r.findings
          .map((f) => `- ${f}`)
          .join("\n")}`
    )
    .join("\n\n");

  const raw = await callClaude(
    system,
    `Topic: ${topic}\n\nResearch:\n${researchSummary}`,
    1000,
    { includeBusinessContext: true }
  );

  // Parse
  const insightMatch = raw.match(/Insight:\s*(.+?)(?:\n|$)/i);
  const angleMatch = raw.match(/Angle:\s*(.+?)(?:\n|$)/i);
  const dataPoints: string[] = [];
  const dataSection = raw.split(/Data:\s*/i)[1] || "";
  for (const line of dataSection.split("\n")) {
    const cleaned = line.replace(/^[-•]\s*/, "").trim();
    if (cleaned) dataPoints.push(cleaned);
  }

  return {
    insight: insightMatch?.[1]?.trim() || "",
    angle: angleMatch?.[1]?.trim() || "",
    supportingData: dataPoints,
  };
}

// ---------- 5. Hook Agent ----------

export async function runHookAgent(
  topic: string,
  narrative: NarrativeOutput
): Promise<HookOutput> {
  const system = buildTweetAgentSystemPrompt(
    `You are generating opening hooks for Immutable tweet drafts.

Hook-specific rules:
- Each hook must be under 60 characters
- Choose hook types from this taxonomy:
${hookTypeGuide}
- Produce 3 hooks using 3 different hook types when possible
- If the narrative includes a strong grounded metric or proof point, make one hook a Data hook
- At least one hook should be either a Thesis statement or a Curiosity Gap
- Vary length and opening move across the 3 hooks
- Use crypto Twitter native tone (lowercase ok, abbreviations ok)
- Each hook should work as a standalone opening line
- Hooks must keep the reader net bullish on Immutable or the market shift being described
- Do not write a hook that is two sentences using the "Not X but Y" construction or the "X isn't this. It's this." construction
- Do not turn a caveat into a takedown line
- If there is tension in the input, frame it as an unlock, wedge, or advantage rather than a dismissal

Return valid JSON only in this exact shape:
{
  "hooks": [
    { "type": "Thesis statement", "text": "..." },
    { "type": "Curiosity Gap", "text": "..." },
    { "type": "Data", "text": "..." }
  ]
}

No commentary.`,
    {
      overrideBaseOutputFormat: true,
      overrideBaseFullTweetRequirements: true,
    }
  );

  const raw = await callClaude(
    system,
    `Topic: ${topic}\nInsight: ${narrative.insight}\nAngle: ${narrative.angle}\nKey data: ${narrative.supportingData.join("; ")}`,
    1000,
    { includeBusinessContext: true }
  );

  try {
    return normalizeHookOutput(JSON.parse(raw));
  } catch {
    const hooks = raw
      .split("\n")
      .map((l) => l.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((text) => ({
        type: "Thesis statement" as HookType,
        text,
      }));

    return { hooks };
  }
}

// ---------- 6. Tweet Drafter ----------

export const SHARED_TWEET_DRAFTER_SYSTEM_PROMPT = SHARED_TWEET_BASE_PROMPT;

export function buildSharedTweetDrafterUserPrompt(
  topic: string,
  narrative: NarrativeOutput,
  hooks: HookOutput,
  tweetStyleName: string,
  tweetStyleDescription: string,
  exemplarTweets: ExemplarSets,
  archetype?: string,
  extraSections: string[] = []
): string {
  const sections: string[] = [
    `Creative brief: "${topic}"\nThis is your primary directive. Honor its tone, angle, and specific phrasing — not just the subject matter. If the brief is casual or conversational, the tweets should feel that way. Do not override the brief's implied voice with generic positioning.`,
  ];
  if (archetype) {
    sections.push(
      `Archetype: ${archetype} — frame every tweet so it fits this archetype.`
    );
  }
  sections.push(`Hook type taxonomy:\n${hookTypeGuide}`);
  if (narrative.insight) sections.push(`Core insight: ${narrative.insight}`);
  if (narrative.angle) sections.push(`Narrative angle: ${narrative.angle}`);
  if (narrative.supportingData.length > 0) {
    sections.push(
      `Supporting data:\n${narrative.supportingData.map((d) => `- ${d}`).join("\n")}`
    );
  }
  if (hooks.hooks.length > 0) {
    sections.push(
      `Hook options:\n${hooks.hooks
        .map((hook, i) => `${i + 1}. [${hook.type}] ${hook.text}`)
        .join("\n")}`
    );
    sections.push(
      "Treat the hook options as examples of different hook types. Preserve hook-type diversity across the final batch rather than repeating the same opening move."
    );
  }
  sections.push(...extraSections.filter(Boolean));
  if (exemplarTweets.formExemplars) {
    sections.push(`Form exemplars — emulate the STRUCTURE and STYLE of these tweets:\n${exemplarTweets.formExemplars}`);
  }
  if (exemplarTweets.archetypeExemplars) {
    sections.push(`Archetype exemplars — emulate the PROPOSITIONAL CONTENT, angle, and framing of these tweets (not their structure):\n${exemplarTweets.archetypeExemplars}`);
  }
  sections.push(
    `Generate 6 distinct tweets in the "${tweetStyleName}" style.\nStyle description: ${tweetStyleDescription}\n\nIMPORTANT: Every single tweet must strictly follow the "${tweetStyleName}" format described above. If the format requires multiple stacked lines, all 6 tweets must have multiple stacked lines. A tweet that is a single sentence or a bare stat with no structure is a format failure — rewrite it before outputting.`
  );
  sections.push(
    `Use the material above as raw input. Each tweet should feel like it was written by an informed operator with genuine conviction, not a marketing team. The final read on every tweet should be net bullish on Immutable or the market shift being described. If you mention a tension, resolve it into a stronger positive takeaway. Vary the opening move across the batch by using a mix of hook types rather than repeating the same pattern.\n\nSeparate each tweet with "||". Output ONLY the tweets.`
  );

  return sections.join("\n\n");
}

export function parseDraftedTweets(raw: string): string[] {
  return raw
    .split("||")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

const COMMUNITY_ENGAGEMENT_SYSTEM_PROMPT = `You write casual, authentic tweets for a crypto founder account. Your goal is human connection with the audience — not bullish positioning, not product marketing.

Rules:
- No emojis, no hashtags, no hyphens
- No engagement bait ("like if you agree", "RT this")
- Keep the voice genuine and personal
- Every tweet must strictly follow the requested format — if the format requires multiple stacked lines, every tweet must have multiple stacked lines
- Output ONLY the tweets separated by "||" — no labels, numbering, or commentary`;

export async function runTweetDrafter(
  topic: string,
  narrative: NarrativeOutput,
  hooks: HookOutput,
  tweetStyleName: string,
  tweetStyleDescription: string,
  exemplarTweets: ExemplarSets,
  archetype?: string,
  options: { skipCritic?: boolean; extraSections?: string[] } = {}
): Promise<string[]> {
  // Community engagement bypasses all Immutable business context and bullish
  // framing rules — these tweets are about founder voice, not VC positioning.
  if (archetype === "Community engagement") {
    const exemplarBlock = exemplarTweets.archetypeExemplars
      ? `Examples — match the tone, voice, and feel of these:\n${exemplarTweets.archetypeExemplars}`
      : exemplarTweets.formExemplars
        ? `Examples — match the structure and feel of these:\n${exemplarTweets.formExemplars}`
        : "";
    const communityPrompt = [
      `Creative brief: "${topic}"\nThis is your primary directive. Honor its tone and phrasing exactly.`,
      exemplarBlock,
      `Generate 6 distinct tweets in the "${tweetStyleName}" style.\nStyle description: ${tweetStyleDescription}\n\nIMPORTANT: Every single tweet must strictly follow the "${tweetStyleName}" format. A bare single-line stat is a format failure.`,
      `Separate each tweet with "||". Output ONLY the tweets.`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const raw = await callClaude(COMMUNITY_ENGAGEMENT_SYSTEM_PROMPT, communityPrompt, 2000, {
      includeBusinessContext: false,
    });
    return parseDraftedTweets(raw);
  }

  const prompt = buildSharedTweetDrafterUserPrompt(
    topic,
    narrative,
    hooks,
    tweetStyleName,
    tweetStyleDescription,
    exemplarTweets,
    archetype,
    options.extraSections
  );

  const raw = await callClaude(SHARED_TWEET_DRAFTER_SYSTEM_PROMPT, prompt, 2000, {
    includeBusinessContext: true,
  });

  const drafts = parseDraftedTweets(raw);

  if (options.skipCritic) {
    return drafts;
  }

  // Critic pass: score the drafts and rewrite the weakest two. Cheap (~$0.02)
  // and lifts batch quality by removing the worst tail without re-running the
  // full pipeline. If the critic call fails for any reason, fall back to the
  // raw drafts so the user always gets output.
  try {
    return await runTweetCritic(
      drafts,
      topic,
      narrative,
      tweetStyleName,
      tweetStyleDescription,
      exemplarTweets,
      archetype
    );
  } catch (err) {
    console.error("[Critic] Failed, returning raw drafts:", err);
    return drafts;
  }
}

// ---------- 7. Tweet Critic ----------
// Scores the drafts on hook strength, data specificity, brand fit, and style
// adherence, then rewrites the weakest two using the same style + exemplar
// context. Returns 6 tweets in the original order, with the bottom two
// replaced by their improved rewrites.

export async function runTweetCritic(
  drafts: string[],
  topic: string,
  narrative: NarrativeOutput,
  tweetStyleName: string,
  tweetStyleDescription: string,
  exemplarTweets: ExemplarSets,
  archetype?: string
): Promise<string[]> {
  if (drafts.length < 3) return drafts;

  const system = buildTweetAgentSystemPrompt(
    `You are a ruthless Twitter editor reviewing tweets written for Immutable. You score drafts and rewrite the weakest ones.

Scoring criteria (1-10 each):
- Hook: does the opening line earn the scroll-stop?
- Data: does it reference a specific, concrete data point (numbers, names, dates)?
- Brand fit: does it sound like an informed operator, not a marketing team? Does it accurately reflect Immutable's products and positioning for crypto VCs, players, and game studios? Does it leave the reader more bullish on Immutable rather than more skeptical?
- Style: does it match the "${tweetStyleName}" style and the exemplar patterns?

Rules for rewrites:
- The shared rules above apply to every rewritten tweet
- Downscore or rewrite any draft whose main impression is bearish, cynical, or undermining toward Immutable
- If a draft raises a caveat, it must resolve into a stronger positive takeaway
- Must preserve the original data point / insight - you are improving the framing, not changing the substance
- Match the style description and exemplars exactly

Output format (exactly this, no extras):
SCORES:
1. <total>/40 - <one line reason>
2. <total>/40 - <one line reason>
...
N. <total>/40 - <one line reason>

WEAKEST: <comma-separated 1-indexed numbers of the two lowest-scoring drafts>

REWRITES:
<weakest-index-1>: <rewritten tweet>
<weakest-index-2>: <rewritten tweet>`,
    { overrideBaseOutputFormat: true }
  );

  const sections: string[] = [`Topic: ${topic}`];
  if (archetype) sections.push(`Archetype: ${archetype}`);
  if (narrative.insight) sections.push(`Core insight: ${narrative.insight}`);
  if (narrative.angle) sections.push(`Narrative angle: ${narrative.angle}`);
  sections.push(`Style: ${tweetStyleName} — ${tweetStyleDescription}`);
  if (exemplarTweets.formExemplars) sections.push(`Form exemplars to match:\n${exemplarTweets.formExemplars}`);
  if (exemplarTweets.archetypeExemplars) sections.push(`Archetype exemplars to match:\n${exemplarTweets.archetypeExemplars}`);
  sections.push(
    `Drafts to score:\n${drafts.map((d, i) => `${i + 1}. ${d}`).join("\n\n")}`
  );

  const raw = await callClaude(system, sections.join("\n\n"), 1500, {
    includeBusinessContext: true,
  });

  // Parse weakest indices
  const weakestMatch = raw.match(/WEAKEST:\s*([\d,\s]+)/i);
  if (!weakestMatch) return drafts;
  const weakestIndices = weakestMatch[1]
    .split(",")
    .map((s) => parseInt(s.trim(), 10) - 1)
    .filter((n) => !isNaN(n) && n >= 0 && n < drafts.length);

  if (weakestIndices.length === 0) return drafts;

  // Parse rewrites: lines like "3: <tweet text>" within the REWRITES section
  const rewritesSection = raw.split(/REWRITES:\s*/i)[1] || "";
  const rewrites = new Map<number, string>();
  for (const line of rewritesSection.split("\n")) {
    const m = line.match(/^\s*(\d+)\s*[:.\)]\s*(.+)$/);
    if (m) {
      const idx = parseInt(m[1], 10) - 1;
      const text = m[2].trim();
      if (idx >= 0 && idx < drafts.length && text.length > 0) {
        rewrites.set(idx, text);
      }
    }
  }

  // Apply rewrites only for the weakest indices
  const result = [...drafts];
  for (const idx of weakestIndices) {
    const rewritten = rewrites.get(idx);
    if (rewritten) result[idx] = rewritten;
  }
  return result;
}

export async function runStandaloneTweetCriticRewrite(
  draft: string,
  topic: string,
  tweetStyleName: string,
  tweetStyleDescription: string,
  exemplarTweets: ExemplarSets,
  archetype?: string
): Promise<{ rationale: string; rewrittenTweet: string }> {
  const system = buildTweetAgentSystemPrompt(
    `You are a ruthless Twitter editor reviewing a single Immutable tweet draft.

Your job:
1. Diagnose the biggest weaknesses in the draft
2. Rewrite it so it is sharper, more credible, more data-led, and more consistent with Immutable's positioning

Rules for the rewrite:
- Keep the final read net bullish on Immutable or the market shift being described
- Preserve the core claim or substantive point unless it is clearly weak or vague, in which case tighten it rather than changing the topic
- Keep the rewrite under 280 characters
- Do not add emojis, hashtags, or banned constructions from the shared rules
- If the draft is missing specificity, improve it with the clearest concrete framing available from the input context

Output format exactly:
RATIONALE: [1-2 sentences]
REWRITE:
[rewritten tweet]`,
    { overrideBaseOutputFormat: true }
  );

  const sections: string[] = [`Topic: ${topic}`];
  if (archetype) sections.push(`Archetype: ${archetype}`);
  sections.push(`Style: ${tweetStyleName} — ${tweetStyleDescription}`);
  if (exemplarTweets.formExemplars) {
    sections.push(`Form exemplars to match:\n${exemplarTweets.formExemplars}`);
  }
  if (exemplarTweets.archetypeExemplars) {
    sections.push(`Archetype exemplars to match:\n${exemplarTweets.archetypeExemplars}`);
  }
  sections.push(`Draft to rewrite:\n${draft}`);

  const raw = await callClaude(system, sections.join("\n\n"), 1200, {
    includeBusinessContext: true,
  });

  const rationaleMatch = raw.match(/RATIONALE:\s*([\s\S]*?)(?:\nREWRITE:|$)/i);
  const rewriteSection = raw.split(/REWRITE:\s*/i)[1] || raw;

  return {
    rationale: rationaleMatch?.[1]?.trim() || "",
    rewrittenTweet: rewriteSection.trim(),
  };
}

// ---------- 8. Weekly Planning ----------

function extractJsonPayload(raw: string): string {
  const fencedMatch = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const startCandidates = [raw.indexOf("{"), raw.indexOf("[")].filter(
    (index) => index >= 0
  );
  if (startCandidates.length === 0) {
    throw new Error("Model did not return JSON");
  }

  const start = Math.min(...startCandidates);
  const openChar = raw[start];
  const closeChar = openChar === "{" ? "}" : "]";
  const end = raw.lastIndexOf(closeChar);
  if (end < start) {
    throw new Error("Model returned malformed JSON");
  }

  return raw.slice(start, end + 1).trim();
}

async function repairJsonPayload(raw: string, errorMessage: string): Promise<string> {
  const system = `You repair malformed JSON.

Rules:
- Return valid JSON only
- Preserve the original structure and values as closely as possible
- Do not add commentary, markdown, or explanations
- If the input appears to be an object, return an object
- If the input appears to be an array, return an array`;

  const userPrompt = [
    `The JSON below failed to parse with this error: ${errorMessage}`,
    "Rewrite it as valid JSON only.",
    raw,
  ].join("\n\n");

  const repaired = await callClaude(system, userPrompt, 2200);
  return extractJsonPayload(repaired);
}

async function parseJsonResponse<T>(raw: string): Promise<T> {
  const payload = extractJsonPayload(raw);

  try {
    return JSON.parse(payload) as T;
  } catch (error: any) {
    const repairedPayload = await repairJsonPayload(payload, error?.message || "Unknown JSON parse error");
    return JSON.parse(repairedPayload) as T;
  }
}

function clampTweetOpportunityCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(3, Math.round(parsed)));
}

function sanitizeAudienceLens(value: unknown): AudienceLens {
  const allowed = new Set(WEEKLY_AUDIENCE_OPTIONS.map((option) => option.value));
  return allowed.has(value as AudienceLens)
    ? (value as AudienceLens)
    : "market_observer";
}

function sanitizeArchetype(value: unknown): Archetype {
  const fallback = WEEKLY_ARCHETYPE_OPTIONS[0]?.value || "Payments";
  const allowed = new Set(WEEKLY_ARCHETYPE_OPTIONS.map((option) => option.value));
  return allowed.has(value as Archetype)
    ? (value as Archetype)
    : fallback;
}

function sanitizeNarratives(payload: unknown): WeeklyNarrative[] {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((item, index) => {
      const narrative = (item ?? {}) as Record<string, unknown>;
      const rawAudiences = Array.isArray(narrative.audiences)
        ? narrative.audiences
        : [];

      return {
        id: `narrative-${index + 1}`,
        claim: String(narrative.claim ?? "").trim(),
        whyNow: String(narrative.whyNow ?? "").trim(),
        audiences:
          rawAudiences
            .map((audience) => sanitizeAudienceLens(audience))
            .filter(Boolean)
            .slice(0, 3) || [],
        proofPoints: Array.isArray(narrative.proofPoints)
          ? narrative.proofPoints
              .map((point) => String(point ?? "").trim())
              .filter(Boolean)
              .slice(0, 5)
          : [],
        toneGuidance: String(narrative.toneGuidance ?? "").trim(),
        tweetOpportunityCount: clampTweetOpportunityCount(
          narrative.tweetOpportunityCount
        ),
      };
    })
    .filter((narrative) => narrative.claim.length > 0)
    .slice(0, 5);
}

function normalizeWeeklySynthesis(payload: unknown): WeeklySynthesis {
  const data = (payload ?? {}) as Record<string, unknown>;

  return {
    evidenceBank: Array.isArray(data.evidenceBank)
      ? data.evidenceBank
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
          .slice(0, 12)
      : [],
    narratives: sanitizeNarratives(data.narratives),
  };
}

function normalizeWeeklyPlanSlots(payload: unknown): WeeklyPlanSlot[] {
  const templates = buildDefaultWeeklyPlanSlots();
  const slots = Array.isArray(payload) ? payload : [];

  const allowedArchetypeSet = new Set(
    WEEKLY_ARCHETYPE_OPTIONS.map((option) => option.value)
  );

  return templates.map((template, index) => {
    const item = (slots[index] ?? {}) as Record<string, unknown>;
    const archetype = sanitizeArchetype(item.archetype ?? item.contentTopic ?? template.archetype);
    const archetypeDefaults = ARCHETYPE_DEFAULTS[archetype];
    const rawScheduleLabel = String(item.scheduleLabel ?? "").trim();
    const scheduleLabel = rawScheduleLabel || archetype;
    const isBAU = allowedArchetypeSet.has(scheduleLabel as any);

    return {
      ...template,
      scheduleLabel,
      archetype,
      goal: archetypeDefaults.goal,
      topic: "",
      evidence: "",
      additionalContext: "",
      draftMode: isBAU ? ("internal" as const) : ("research" as const),
      tweetStyle: archetypeDefaults.tweetStyle,
      status: "planned" as const,
    };
  });
}

function formatWeeklyInput(input: WeeklyInput): string {
  return [
    `Week of: ${input.weekOf}`,
    `Weekly context dump:\n${input.weeklyContextDump || "(empty)"}`,
  ].join("\n\n");
}

function dedupeLines(items: string[]) {
  return items.filter((item, index, array) => array.indexOf(item) === index);
}

function findMatchingNarrative(
  synthesis: WeeklySynthesis,
  slot: WeeklyPlanSlot
): WeeklyNarrative | undefined {
  const narrativeTopic =
    slot.topic.trim() ||
    (slot.scheduleLabel.trim() !== slot.archetype
      ? slot.scheduleLabel.trim()
      : "");

  if (!narrativeTopic) return undefined;

  return synthesis.narratives.find((narrative) => {
    const haystack =
      `${narrative.claim} ${narrative.whyNow} ${narrative.proofPoints.join(" ")}`.toLowerCase();
    return narrativeTopic
      .toLowerCase()
      .split(/\s+/)
      .some((word) => word.length > 4 && haystack.includes(word));
  });
}

function isWeeklySlotDraftable(slot: WeeklyPlanSlot): boolean {
  return Boolean(slot.topic.trim() || slot.scheduleLabel.trim());
}

function getWeeklySlotEffectiveTopic(slot: WeeklyPlanSlot): string {
  return slot.topic.trim() || slot.scheduleLabel.trim() || slot.archetype;
}

function buildWeeklySlotAdditionalSections(slot: WeeklyPlanSlot) {
  return [
    slot.scheduleLabel.trim()
      ? `Schedule label: ${slot.scheduleLabel.trim()}`
      : "",
    slot.additionalContext.trim()
      ? `Additional slot context:\n${slot.additionalContext.trim()}`
      : "",
  ].filter(Boolean);
}

function buildWeeklySlotSupportingData(
  weeklyInput: WeeklyInput,
  synthesis: WeeklySynthesis,
  slot: WeeklyPlanSlot,
  matchingNarrative?: WeeklyNarrative,
  extraData: string[] = []
) {
  return dedupeLines(
    [
      slot.evidence,
      slot.additionalContext,
      ...(matchingNarrative?.proofPoints || []),
      ...synthesis.evidenceBank,
      ...extraData,
    ]
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export async function runWeeklySynthesisAgent(
  weeklyInput: WeeklyInput
): Promise<WeeklySynthesis> {
  const system = `You are the weekly content strategist for Immutable's co-founder Twitter account.

Your job is to transform raw weekly inputs into a clear editorial brief for a ${WEEKLY_SLOT_COUNT}-tweet week.

Context:
- The account is shaping how crypto investors, founders, and operators think about web3 gaming.
- Immutable must still sound credible to web3-native audiences.
- Messaging must also be accessible to mainstream game studios and not sound like speculative hype.
- Emphasize practical outcomes: growth, monetisation, distribution, retention, and margins.
- Web3 should often be positioned as infrastructure, not always the headline.

Return valid JSON only in this exact shape:
{
  "evidenceBank": ["string"],
  "narratives": [
    {
      "claim": "string",
      "whyNow": "string",
      "audiences": ["crypto_investor", "crypto_operator", "web2_exec", "growth_lead", "market_observer"],
      "proofPoints": ["string"],
      "toneGuidance": "string",
      "tweetOpportunityCount": 1
    }
  ]
}

Rules:
- produce 3-5 narratives only
- make narratives distinct and non-overlapping
- every narrative should be usable for 1-2 tweets this week
- use the allowed audience labels exactly
- no markdown, no prose outside JSON`;

  const raw = await callClaude(system, formatWeeklyInput(weeklyInput), 2200, {
    includeBusinessContext: true,
  });

  return normalizeWeeklySynthesis(await parseJsonResponse(raw));
}

export async function runWeeklySlotPlanner(
  weeklyInput: WeeklyInput,
  synthesis: WeeklySynthesis
): Promise<WeeklyPlanSlot[]> {
  const templateSlots = buildDefaultWeeklyPlanSlots().map((slot) => ({
    slotNumber: slot.slotNumber,
    day: slot.day,
    archetype: slot.archetype,
  }));

  const allowedArchetypes = WEEKLY_ARCHETYPE_OPTIONS.map((option) => option.value);

  const system = `You are planning a ${WEEKLY_SLOT_COUNT}-tweet weekly schedule for Immutable's co-founder account.

You will receive the weekly brief, synthesized narratives, and a ${WEEKLY_SLOT_COUNT}-slot template covering Monday through Friday with 3 slots per weekday.

Return valid JSON only — an array of exactly ${WEEKLY_SLOT_COUNT} objects in slot order.

Each object has exactly TWO fields:
{
  "scheduleLabel": "string (max 4 words)",
  "archetype": "one of the allowed archetypes"
}

IMPORTANT — there are only two kinds of slots:

1. NEW-TOPIC slots (0 or 2 total):
   If the weekly context contains a genuinely new, newsworthy development, assign exactly 2 slots to it on different days.
   scheduleLabel = a short name for the development (e.g. "Daily Streaks Launch", "Voxels Tournament").
   Pick the most fitting archetype for each.

2. BAU slots (all remaining slots, ${WEEKLY_SLOT_COUNT - 2} or ${WEEKLY_SLOT_COUNT}):
   scheduleLabel = the archetype name EXACTLY, copied verbatim from the allowed list.
   Do NOT invent labels. Do NOT write sentences. Just the archetype name.

Allowed archetypes (copy exactly): ${allowedArchetypes.join(", ")}

If there is no genuinely new development, ALL ${WEEKLY_SLOT_COUNT} slots are BAU.

Do NOT include topic, evidence, goal, tweetStyle, or any other field.
Do NOT write sentences or descriptions anywhere. Labels only.
No markdown, no prose outside JSON.`;

  const userPrompt = [
    formatWeeklyInput(weeklyInput),
    `Weekly synthesis JSON:\n${JSON.stringify(synthesis, null, 2)}`,
    `${WEEKLY_SLOT_COUNT}-slot template:\n${JSON.stringify(templateSlots, null, 2)}`,
  ].join("\n\n");

  const raw = await callClaude(system, userPrompt, 1200, {
    includeBusinessContext: true,
  });

  return normalizeWeeklyPlanSlots(await parseJsonResponse(raw));
}

export async function runWeeklySlotDraftAgent(
  weeklyInput: WeeklyInput,
  synthesis: WeeklySynthesis,
  slot: WeeklyPlanSlot
): Promise<WeeklySlotDraft> {
  if (slot.draftMode === "internal") {
    return runWeeklySlotInternalDraftAgent(weeklyInput, synthesis, slot);
  }

  return runWeeklySlotResearchDraftAgent(weeklyInput, synthesis, slot);
}

async function runWeeklySlotResearchDraftAgent(
  weeklyInput: WeeklyInput,
  synthesis: WeeklySynthesis,
  slot: WeeklyPlanSlot
): Promise<WeeklySlotDraft> {
  const style = tweetStyles[slot.tweetStyle] || tweetStyles.catchphrase;
  const exemplarText = await getExemplarsForStyle(slot.tweetStyle, slot.archetype);
  const matchingNarrative = findMatchingNarrative(synthesis, slot);
  const effectiveTopic = getWeeklySlotEffectiveTopic(slot);
  const researchTopic = [effectiveTopic, slot.additionalContext].filter(Boolean).join(". ");
  const beliefs = await runBeliefAgent(researchTopic || effectiveTopic);
  const evidenceNeeds = await runEvidenceAgent(researchTopic || effectiveTopic, beliefs);
  const research = await runResearchAgent(researchTopic || effectiveTopic, evidenceNeeds);
  const researchNarrative = await runNarrativeAgent(researchTopic || effectiveTopic, research);
  const supportingData = dedupeLines([
    ...researchNarrative.supportingData,
    ...buildWeeklySlotSupportingData(weeklyInput, synthesis, slot, matchingNarrative),
  ]).slice(0, 6);
  const narrative: NarrativeOutput = {
    insight:
      [slot.goal, researchNarrative.insight, matchingNarrative?.claim]
        .filter(Boolean)
        .join(" ")
        .trim() || effectiveTopic,
    angle: researchNarrative.angle,
    supportingData,
  };
  const hooks = await runHookAgent(effectiveTopic, narrative);
  const drafts = await runTweetDrafter(
    effectiveTopic,
    narrative,
    hooks,
    style.name,
    style.description,
    exemplarText,
    slot.archetype,
    {
      extraSections: buildWeeklySlotAdditionalSections(slot),
    }
  );

  return {
    slotId: slot.id,
    primaryDraft: drafts[0] || "",
    alternateDraft: drafts[1] || drafts[0] || "",
  };
}

async function runWeeklySlotInternalDraftAgent(
  weeklyInput: WeeklyInput,
  synthesis: WeeklySynthesis,
  slot: WeeklyPlanSlot
): Promise<WeeklySlotDraft> {
  const style = tweetStyles[slot.tweetStyle] || tweetStyles.catchphrase;
  const exemplarText = await getExemplarsForStyle(slot.tweetStyle, slot.archetype);
  const matchingNarrative = findMatchingNarrative(synthesis, slot);
  const effectiveTopic = getWeeklySlotEffectiveTopic(slot);
  const metrics = await runMetricResearchAgent(
    [effectiveTopic, slot.additionalContext].filter(Boolean).join(". ")
  );
  const narrative: NarrativeOutput = {
    insight:
      [slot.goal, metrics.overarchingNarrative, matchingNarrative?.claim]
        .filter(Boolean)
        .join(" ")
        .trim() || effectiveTopic,
    angle: "",
    supportingData: buildWeeklySlotSupportingData(
      weeklyInput,
      synthesis,
      slot,
      matchingNarrative,
      metrics.metrics
    ).slice(0, 6),
  };

  const drafts = await runTweetDrafter(
    effectiveTopic,
    narrative,
    { hooks: [] },
    style.name,
    style.description,
    exemplarText,
    slot.archetype,
    {
      extraSections: buildWeeklySlotAdditionalSections(slot),
    }
  );

  return {
    slotId: slot.id,
    primaryDraft: drafts[0] || "",
    alternateDraft: drafts[1] || drafts[0] || "",
  };
}

export async function runWeeklyBulkDraftAgent(
  weeklyInput: WeeklyInput,
  synthesis: WeeklySynthesis,
  slots: WeeklyPlanSlot[]
): Promise<WeeklySlotDraft[]> {
  const draftableSlots = slots.filter(isWeeklySlotDraftable);
  if (draftableSlots.length === 0) return [];

  const drafts: WeeklySlotDraft[] = [];

  for (const slot of draftableSlots) {
    drafts.push(await runWeeklySlotDraftAgent(weeklyInput, synthesis, slot));
  }

  return drafts;
}
