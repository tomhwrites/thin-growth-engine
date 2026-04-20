import type { ContentTopic } from "@/utils/tweetConfig";
import { weeklyContentTopicOptions } from "@/utils/tweetConfig";

export type AudienceLens =
  | "crypto_investor"
  | "crypto_operator"
  | "web2_exec"
  | "growth_lead"
  | "market_observer";

export type SlotStatus = "planned" | "drafted" | "approved" | "scheduled";
export type WeeklyDraftMode = "research" | "internal";
export type WeeklyPlanningMode = "default_slots" | "new_context";

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
  contentTopic: ContentTopic;
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
}

export const WEEKLY_CONTENT_TOPIC_OPTIONS = weeklyContentTopicOptions;

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
  { value: "research", label: "6-stage research agent" },
  { value: "internal", label: "Internal data" },
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

export const DEFAULT_ARCHETYPE_SEQUENCE: ContentTopic[] = [
  "Thought leadership",
  "Product",
  "Social proof",
  "Macro Commentary",
  "Product",
  "Partner Games",
  "Thought leadership",
  "Ecosystem",
  "Product",
  "Social proof",
  "Macro Commentary",
  "Partner Games",
  "Web3 gaming = Future",
  "Personal",
  "Thought leadership",
];

const DEFAULT_BAU_SLOT_BLUEPRINT: Array<{
  scheduleLabel: string;
  contentTopic: ContentTopic;
}> = [
  {
    scheduleLabel: "Web3 gaming = Future",
    contentTopic: "Web3 gaming = Future",
  },
  {
    scheduleLabel: "Community Engagement",
    contentTopic: "Personal",
  },
  {
    scheduleLabel: "Macro Commentary",
    contentTopic: "Macro Commentary",
  },
  {
    scheduleLabel: "Product",
    contentTopic: "Product",
  },
  {
    scheduleLabel: "Partner Games",
    contentTopic: "Partner Games",
  },
  {
    scheduleLabel: "New Narrative",
    contentTopic: "Thought leadership",
  },
  {
    scheduleLabel: "Rewards on Immutable",
    contentTopic: "Product",
  },
  {
    scheduleLabel: "Web3 gaming = Future",
    contentTopic: "Web3 gaming = Future",
  },
  {
    scheduleLabel: "New Thesis re Web3 Infra",
    contentTopic: "Thought leadership",
  },
  {
    scheduleLabel: "Community Engagement",
    contentTopic: "Personal",
  },
  {
    scheduleLabel: "Product",
    contentTopic: "Product",
  },
  {
    scheduleLabel: "Ecosystem",
    contentTopic: "Ecosystem",
  },
  {
    scheduleLabel: "Macro Commentary",
    contentTopic: "Macro Commentary",
  },
  {
    scheduleLabel: "New Narrative",
    contentTopic: "Thought leadership",
  },
  {
    scheduleLabel: "New Thesis re Web3 Infra",
    contentTopic: "Thought leadership",
  },
];

export const ARCHETYPE_DEFAULTS: Record<
  ContentTopic,
  {
    goal: string;
    tweetStyle: string;
    evidencePrompt: string;
  }
> = {
  Product: {
    goal: "Translate product momentum into practical operator value",
    tweetStyle: "comparison",
    evidencePrompt: "Feature launch, distribution win, onboarding improvement, or studio benefit",
  },
  "Web3 gaming = Future": {
    goal: "Reinforce the long-term structural shift toward player-owned game economies",
    tweetStyle: "hookbullets",
    evidencePrompt: "Structural gaming trend, monetisation unlock, or market inevitability signal",
  },
  Ecosystem: {
    goal: "Show how Immutable's network creates compounding value across games and partners",
    tweetStyle: "hookbullets",
    evidencePrompt: "Ecosystem expansion, partner activity, or network effect signal",
  },
  "Thought leadership": {
    goal: "Shape market narrative with a strong point of view",
    tweetStyle: "multiparagraph",
    evidencePrompt: "Operator insight, belief shift, or strategic framing",
  },
  "Partner Games": {
    goal: "Use game-specific momentum to make the broader platform story feel real",
    tweetStyle: "multiparagraph",
    evidencePrompt: "Partner milestone, launch, growth stat, or player traction signal",
  },
  Personal: {
    goal: "Add founder voice and personality without losing strategic relevance",
    tweetStyle: "oneliner",
    evidencePrompt: "Personal observation, founder lesson, or cultural insight",
  },
  "Macro Commentary": {
    goal: "Interpret current market developments through a gaming and infrastructure lens",
    tweetStyle: "multiparagraph",
    evidencePrompt: "Fresh market signal, macro shift, or narrative window",
  },
  "Social proof": {
    goal: "Anchor the narrative in credibility with concrete proof points",
    tweetStyle: "comparison",
    evidencePrompt: "Metric, milestone, growth rate, or industry validation",
  },
};

export function createEmptyWeeklyPlanSlot(index: number): WeeklyPlanSlot {
  const contentTopic = DEFAULT_ARCHETYPE_SEQUENCE[index];
  const defaults = ARCHETYPE_DEFAULTS[contentTopic];

  return {
    id: `slot-${index + 1}`,
    slotNumber: index + 1,
    day: DEFAULT_DAY_SEQUENCE[index],
    scheduleLabel: "",
    contentTopic,
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
    const defaults = ARCHETYPE_DEFAULTS[blueprint.contentTopic];

    return {
      ...slot,
      scheduleLabel: blueprint.scheduleLabel,
      contentTopic: blueprint.contentTopic,
      goal: defaults.goal,
      tweetStyle: defaults.tweetStyle,
      draftMode: "internal" as const,
    };
  });
}
