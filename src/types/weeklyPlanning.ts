import type { FactPackItem } from "@/types/factPack";
import type { Archetype } from "@/utils/tweetConfig";
import { weeklyArchetypeOptions } from "@/utils/tweetConfig";

export type AudienceLens =
  | "crypto_investor"
  | "crypto_operator"
  | "web2_exec"
  | "growth_lead"
  | "market_observer";

export type SlotStatus = "planned" | "drafted" | "approved" | "scheduled";
export type WeeklyDraftMode = "research" | "quick" | "internal" | "quality";
export type WeeklyPlanningMode = "default_slots" | "new_context";
export type WeeklyQualityConfidence = "high" | "medium" | "low";
export type WeeklyQualityFailureMode =
  | "no_valid_candidates"
  | "frame_failed"
  | "candidate_failed"
  | "critic_failed"
  | "generation_failed"
  | "timeout";

export interface WeeklyInput {
  weekOf: string;
  weeklyContextDump: string;
}

export interface WeeklyNarrative {
  id: string;
  claim: string;
  whyNow: string;
  audiences: AudienceLens[];
  proofPoints: string[];
  toneGuidance: string;
  tweetOpportunityCount: number;
}

export interface WeeklySynthesis {
  evidenceBank: string[];
  narratives: WeeklyNarrative[];
}

export interface WeeklyPlanSlot {
  id: string;
  slotNumber: number;
  day: string;
  scheduleLabel: string;
  archetype: Archetype;
  goal: string;
  topic: string;
  evidence: string;
  additionalContext: string;
  draftMode: WeeklyDraftMode;
  tweetStyle: string;
  status: SlotStatus;
}

export interface WeeklySlotDraft {
  slotId: string;
  primaryDraft: string;
  alternateDraft: string;
  selectedCandidateId?: string | null;
  alternateDrafts?: string[];
  candidates?: WeeklySlotCandidate[];
  scores?: WeeklySlotCriticScore[];
  confidence?: WeeklyQualityConfidence;
  failureMode?: WeeklyQualityFailureMode | null;
  selectionReason?: string;
}

export type WeeklyDraftKey = "primaryDraft" | "alternateDraft";

export type WeeklyFactPackItem = FactPackItem;

export interface WeeklyPairDraftResult {
  primaryDraft: string;
  alternateDraft: string;
  factsUsed: string[];
  rationale: string;
}

export interface WeeklySlotFrame {
  topic: string;
  archetype: Archetype;
  goal: string;
  audienceBelief: string;
  desiredShift: string;
  proof: string[];
  immutableRelevance: string;
  avoid: string[];
}

export interface WeeklySlotCandidate {
  id: string;
  tweet: string;
  hook: string;
  angle: string;
  factsUsed: string[];
  rationale: string;
  validationIssues: string[];
}

export interface WeeklySlotCriticScore {
  candidateId: string;
  grounding: number;
  ctBelievability: number;
  causalFlow: number;
  founderVoice: number;
  nonObviousness: number;
  selfPromoRisk: number;
  aiLanguageRisk: number;
  total: number;
  reason: string;
}

export interface WeeklyQualityRunSummary {
  totalSlots: number;
  succeeded: number;
  failed: number;
  lowConfidence: number;
  criticFailures: number;
  generationFailures: number;
}

export interface WeeklyQualityDraftResult extends WeeklySlotDraft {
  selectedCandidateId: string | null;
  alternateDrafts: string[];
  candidates: WeeklySlotCandidate[];
  scores: WeeklySlotCriticScore[];
  confidence: WeeklyQualityConfidence;
  failureMode: WeeklyQualityFailureMode | null;
  selectionReason: string;
  frame?: WeeklySlotFrame;
}

export const WEEKLY_ARCHETYPE_OPTIONS = weeklyArchetypeOptions;

export const WEEKLY_AUDIENCE_OPTIONS: { value: AudienceLens; label: string }[] = [
  { value: "crypto_investor", label: "Crypto Investor" },
  { value: "crypto_operator", label: "Crypto Operator" },
  { value: "web2_exec", label: "Web2 Studio Exec" },
  { value: "growth_lead", label: "Growth / UA Lead" },
  { value: "market_observer", label: "Market Observer" },
];

export const WEEKLY_STATUS_OPTIONS: { value: SlotStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "drafted", label: "Drafted" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
];

export const WEEKLY_DRAFT_MODE_OPTIONS: {
  value: WeeklyDraftMode;
  label: string;
}[] = [
  { value: "internal", label: "Internal only (DB, no web)" },
  { value: "quick", label: "Quick research (3 web searches)" },
  { value: "research", label: "Deep research (6-stage pipeline)" },
  { value: "quality", label: "Quality mode (frame + candidates)" },
];

export const WEEKLY_SLOT_COUNT = 15;

export const DEFAULT_DAY_SEQUENCE = [
  "Monday",
  "Monday",
  "Monday",
  "Tuesday",
  "Tuesday",
  "Tuesday",
  "Wednesday",
  "Wednesday",
  "Wednesday",
  "Thursday",
  "Thursday",
  "Thursday",
  "Friday",
  "Friday",
  "Friday",
] as const;

export const DEFAULT_ARCHETYPE_SEQUENCE: Archetype[] = [
  "Payments",
  "Identity / Attribution",
  "New combined Web3 thesis",
  "Product Launch / Update",
  "Macro trends / Regulation",
  "Community engagement",
  "Ecosystem Traction",
  "Web2 will become Web3",
  "Macro trends / Regulation",
  "Vision / Industry Thesis",
  "New combined Web3 thesis",
  "Mobile gaming",
  "AI gaming",
  "Community engagement",
  "Web3 gaming = Future",
];

const DEFAULT_BAU_SLOT_BLUEPRINT: Array<{
  scheduleLabel: string;
  archetype: Archetype;
}> = DEFAULT_ARCHETYPE_SEQUENCE.map((archetype) => ({
  scheduleLabel: archetype,
  archetype,
}));

export const ARCHETYPE_DEFAULTS: Record<
  Archetype,
  {
    goal: string;
    tweetStyle: string;
    evidencePrompt: string;
  }
> = {
  Payments: {
    goal: "Translate payment rails into a tangible growth or monetisation unlock",
    tweetStyle: "comparison",
    evidencePrompt: "Payment flow improvement, conversion lift, checkout UX gain, or monetisation proof point",
  },
  "Identity / Attribution": {
    goal: "Show why identity resolution and attribution are becoming core gaming infrastructure",
    tweetStyle: "multiparagraph",
    evidencePrompt: "Identity graph, attribution visibility, retargeting signal, or player profile proof point",
  },
  "New combined Web3 thesis": {
    goal: "Introduce a fresh market thesis that combines multiple shifts into one compelling narrative",
    tweetStyle: "multiparagraph",
    evidencePrompt: "Cross-cutting market shift, structural unlock, or synthesis of multiple trends",
  },
  "Product Launch / Update": {
    goal: "Turn a product release into a clear operator-level value story",
    tweetStyle: "comparison",
    evidencePrompt: "Feature launch, release note, workflow improvement, or customer-facing benefit",
  },
  "Partner Game Announcement": {
    goal: "Make a new partner announcement feel strategically meaningful, not just newsy",
    tweetStyle: "hookbullets",
    evidencePrompt: "New game signing, partner launch detail, or why the partner matters",
  },
  "Partner Traction / Proof Point": {
    goal: "Use partner momentum as hard proof that the platform story is working",
    tweetStyle: "comparison",
    evidencePrompt: "Partner metric, growth rate, retention stat, launch traction, or player milestone",
  },
  "Ecosystem Traction": {
    goal: "Show compounding value across the ecosystem rather than one isolated win",
    tweetStyle: "hookbullets",
    evidencePrompt: "Ecosystem milestone, network effect signal, aggregate traction, or multi-partner momentum",
  },
  "Web2 will become Web3": {
    goal: "Frame web3 adoption as the natural destination for mainstream digital products",
    tweetStyle: "multiparagraph",
    evidencePrompt: "Web2-to-web3 migration signal, behavior shift, or product pattern pointing onchain",
  },
  "Macro trends / Regulation": {
    goal: "Interpret macro or regulatory developments through a gaming and infrastructure lens",
    tweetStyle: "multiparagraph",
    evidencePrompt: "Policy move, market structure change, or macro trend with strategic relevance",
  },
  "Vision / Industry Thesis": {
    goal: "Set a category-defining point of view about where gaming is heading",
    tweetStyle: "multiparagraph",
    evidencePrompt: "Long-range thesis, category framing, or operator insight that changes how readers see the market",
  },
  "Signing Preannouncement": {
    goal: "Build anticipation around an upcoming signing without overexplaining it",
    tweetStyle: "oneliner",
    evidencePrompt: "Required: signed game/studio hint plus bullish proof point (MAU, revenue, franchise, funding, audience, genre, pedigree)",
  },
  "Mobile gaming": {
    goal: "Connect mobile distribution and player behavior to the broader platform story",
    tweetStyle: "hookbullets",
    evidencePrompt: "Mobile trend, user behavior shift, app store dynamic, or mobile-native growth insight",
  },
  "AI gaming": {
    goal: "Explain how AI changes game design, growth, or live operations in a durable way",
    tweetStyle: "multiparagraph",
    evidencePrompt: "AI-enabled gameplay pattern, production shift, or data point linking AI to gaming outcomes",
  },
  "Community engagement": {
    goal: "Add founder voice and direct audience connection without losing strategic relevance",
    tweetStyle: "oneliner",
    evidencePrompt: "Community observation, founder lesson, shared win, or audience interaction worth amplifying",
  },
  "Web3 gaming = Future": {
    goal: "Reinforce the structural inevitability of web3 gaming with conviction",
    tweetStyle: "hookbullets",
    evidencePrompt: "Market inevitability signal, player ownership unlock, or trend showing where gaming is going",
  },
};

export function createEmptyWeeklyPlanSlot(index: number): WeeklyPlanSlot {
  const archetype = DEFAULT_ARCHETYPE_SEQUENCE[index];
  const defaults = ARCHETYPE_DEFAULTS[archetype];

  return {
    id: `slot-${index + 1}`,
    slotNumber: index + 1,
    day: DEFAULT_DAY_SEQUENCE[index],
    scheduleLabel: "",
    archetype,
    goal: defaults.goal,
    topic: "",
    evidence: "",
    additionalContext: "",
    draftMode: "research",
    tweetStyle: defaults.tweetStyle,
    status: "planned",
  };
}

export function buildDefaultWeeklyPlanSlots() {
  return Array.from({ length: WEEKLY_SLOT_COUNT }, (_, index) =>
    createEmptyWeeklyPlanSlot(index)
  );
}

export function buildDefaultBauWeeklyPlanSlots() {
  return buildDefaultWeeklyPlanSlots().map((slot, index) => {
    const blueprint = DEFAULT_BAU_SLOT_BLUEPRINT[index];
    const defaults = ARCHETYPE_DEFAULTS[blueprint.archetype];

    return {
      ...slot,
      scheduleLabel: blueprint.scheduleLabel,
      archetype: blueprint.archetype,
      goal: defaults.goal,
      tweetStyle: defaults.tweetStyle,
      draftMode: "quick" as const,
    };
  });
}
