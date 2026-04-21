import { executeSkill } from "@/harness/execute";
import { getRelevantDataPoints } from "@/lib/dataPoints";
import { withAliases } from "@/lib/skillArgs";
import { runHookedDraftStage } from "@/workflows/tweetDrafting";
import type {
  HookOutput,
  NarrativeOutput,
  ResearchResult,
  SupportingDatum,
} from "@/types/researchPipeline";
import {
  ARCHETYPE_DEFAULTS,
  buildDefaultWeeklyPlanSlots,
  type AudienceLens,
  type WeeklyInput,
  type WeeklyNarrative,
  type WeeklyPlanSlot,
  type WeeklySlotDraft,
  type WeeklySynthesis,
  WEEKLY_AUDIENCE_OPTIONS,
  WEEKLY_ARCHETYPE_OPTIONS,
  WEEKLY_SLOT_COUNT,
} from "@/types/weeklyPlanning";
import type { Archetype } from "@/utils/tweetConfig";

type MetricsSkillOutput = {
  metrics: string[];
  overarchingNarrative: string;
};

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
  return allowed.has(value as Archetype) ? (value as Archetype) : fallback;
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
    const archetype = sanitizeArchetype(
      item.archetype ?? item.contentTopic ?? template.archetype
    );
    const archetypeDefaults = ARCHETYPE_DEFAULTS[archetype];
    const rawScheduleLabel = String(item.scheduleLabel ?? "").trim();
    const scheduleLabel = rawScheduleLabel || archetype;
    const isBAU = allowedArchetypeSet.has(scheduleLabel as Archetype);

    return {
      ...template,
      scheduleLabel,
      archetype,
      goal: archetypeDefaults.goal,
      topic: "",
      evidence: "",
      additionalContext: "",
      draftMode: isBAU ? ("quick" as const) : ("research" as const),
      tweetStyle: archetypeDefaults.tweetStyle,
      status: "planned" as const,
    };
  });
}

function dedupeLines(items: string[]) {
  return items.filter((item, index, array) => array.indexOf(item) === index);
}

function toSupportingDatum(claim: string): SupportingDatum {
  return { claim, sourceUrl: "" };
}

function dedupeSupportingData(items: SupportingDatum[]): SupportingDatum[] {
  return items.filter(
    (item, index, array) =>
      array.findIndex((candidate) => candidate.claim === item.claim) === index
  );
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

function getWeeklySlotEffectiveTopic(slot: WeeklyPlanSlot): string {
  return slot.topic.trim() || slot.scheduleLabel.trim() || slot.archetype;
}

function buildWeeklySlotSupportingData(
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

function buildMergedNarrative(
  slot: WeeklyPlanSlot,
  synthesis: WeeklySynthesis,
  baseNarrative: NarrativeOutput,
  matchingNarrative?: WeeklyNarrative,
  extraData: string[] = []
): NarrativeOutput {
  const supplemental = buildWeeklySlotSupportingData(
    synthesis,
    slot,
    matchingNarrative,
    extraData
  ).map(toSupportingDatum);

  return {
    insight:
      [slot.goal, baseNarrative.insight, matchingNarrative?.claim]
        .filter(Boolean)
        .join(" ")
        .trim() || getWeeklySlotEffectiveTopic(slot),
    angle: baseNarrative.angle,
    supportingData: dedupeSupportingData([
      ...baseNarrative.supportingData,
      ...supplemental,
    ]).slice(0, 6),
  };
}

async function runHookStage(
  topic: string,
  narrative: NarrativeOutput,
  archetype?: string
) {
  const result = await executeSkill<HookOutput>(
    "hook",
    withAliases({ topic, narrative, archetype, contentTopic: archetype })
  );
  return { hooks: result.output, warnings: result.warnings };
}

async function runWeeklyResearchDraft(
  synthesis: WeeklySynthesis,
  slot: WeeklyPlanSlot
): Promise<WeeklySlotDraft> {
  const matchingNarrative = findMatchingNarrative(synthesis, slot);
  const effectiveTopic = getWeeklySlotEffectiveTopic(slot);
  const researchTopic = [effectiveTopic, slot.additionalContext]
    .filter(Boolean)
    .join(". ");

  const belief = await executeSkill<{ beliefs: Array<Record<string, unknown>> }>(
    "belief",
    withAliases({ topic: researchTopic || effectiveTopic })
  );
  const evidence = await executeSkill<{ evidenceNeeds: Array<Record<string, unknown>> }>(
    "evidence",
    withAliases({
      topic: researchTopic || effectiveTopic,
      beliefs: belief.output.beliefs,
    })
  );
  const research = await executeSkill<{ research: ResearchResult[] }>(
    "research",
    withAliases({
      topic: researchTopic || effectiveTopic,
      evidenceNeeds: evidence.output.evidenceNeeds,
    })
  );
  const narrative = await executeSkill<NarrativeOutput>(
    "narrative",
    withAliases({ topic: effectiveTopic, research: research.output.research })
  );
  const mergedNarrative = buildMergedNarrative(
    slot,
    synthesis,
    narrative.output,
    matchingNarrative
  );
  const hook = await runHookStage(effectiveTopic, mergedNarrative, slot.archetype);
  const draft = await runHookedDraftStage(
    effectiveTopic,
    mergedNarrative,
    hook.hooks,
    slot.tweetStyle,
    slot.archetype
  );

  return {
    slotId: slot.id,
    primaryDraft: draft.tweets[0] || "",
    alternateDraft: draft.tweets[1] || draft.tweets[0] || "",
  };
}

async function runWeeklyInternalDraft(
  synthesis: WeeklySynthesis,
  slot: WeeklyPlanSlot
): Promise<WeeklySlotDraft> {
  const matchingNarrative = findMatchingNarrative(synthesis, slot);
  const effectiveTopic = getWeeklySlotEffectiveTopic(slot);
  const searchTopic = [effectiveTopic, slot.additionalContext].filter(Boolean).join(". ");
  const dataPoints = await getRelevantDataPoints(searchTopic, 20, {
    includeImmutableFallback: true,
  });

  const grouped: Record<string, ResearchResult["findings"]> = {};
  for (const dataPoint of dataPoints) {
    const key = dataPoint.category || effectiveTopic;
    (grouped[key] ??= []).push({
      claim: dataPoint.claim,
      sourceUrl: dataPoint.sourceUrl || "",
      reused: true,
    });
  }

  const research: ResearchResult[] = Object.entries(grouped).map(
    ([belief, findings]) => ({
      belief,
      findings,
    })
  );

  const baseNarrative: NarrativeOutput =
    research.length > 0
      ? (
          await executeSkill<NarrativeOutput>(
            "narrative",
            withAliases({ topic: effectiveTopic, research })
          )
        ).output
      : {
          insight: slot.goal || effectiveTopic,
          angle: "",
          supportingData: [],
        };

  const mergedNarrative = buildMergedNarrative(
    slot,
    synthesis,
    baseNarrative,
    matchingNarrative
  );
  const hook = await runHookStage(effectiveTopic, mergedNarrative, slot.archetype);
  const draft = await runHookedDraftStage(
    effectiveTopic,
    mergedNarrative,
    hook.hooks,
    slot.tweetStyle,
    slot.archetype
  );

  return {
    slotId: slot.id,
    primaryDraft: draft.tweets[0] || "",
    alternateDraft: draft.tweets[1] || draft.tweets[0] || "",
  };
}

async function runWeeklyQuickDraft(
  synthesis: WeeklySynthesis,
  slot: WeeklyPlanSlot
): Promise<WeeklySlotDraft> {
  const matchingNarrative = findMatchingNarrative(synthesis, slot);
  const effectiveTopic = getWeeklySlotEffectiveTopic(slot);
  const metrics = await executeSkill<MetricsSkillOutput>(
    "metrics",
    withAliases({
      topic: [effectiveTopic, slot.additionalContext].filter(Boolean).join(". "),
    })
  );

  const baseNarrative: NarrativeOutput = {
    insight:
      [slot.goal, metrics.output.overarchingNarrative, matchingNarrative?.claim]
        .filter(Boolean)
        .join(" ")
        .trim() || effectiveTopic,
    angle: "",
    supportingData: metrics.output.metrics.map(toSupportingDatum),
  };

  const mergedNarrative = buildMergedNarrative(
    slot,
    synthesis,
    baseNarrative,
    matchingNarrative,
    metrics.output.metrics
  );
  const hook = await runHookStage(effectiveTopic, mergedNarrative, slot.archetype);
  const draft = await runHookedDraftStage(
    effectiveTopic,
    mergedNarrative,
    hook.hooks,
    slot.tweetStyle,
    slot.archetype
  );

  return {
    slotId: slot.id,
    primaryDraft: draft.tweets[0] || "",
    alternateDraft: draft.tweets[1] || draft.tweets[0] || "",
  };
}

export async function runWeeklySynthesis(
  weeklyInput: WeeklyInput
): Promise<WeeklySynthesis> {
  const result = await executeSkill<WeeklySynthesis>(
    "weekly-synthesis",
    withAliases({ weeklyInput })
  );
  return normalizeWeeklySynthesis(result.output);
}

export async function runWeeklyPlan(
  weeklyInput: WeeklyInput,
  synthesis: WeeklySynthesis
): Promise<WeeklyPlanSlot[]> {
  const templateSlots = buildDefaultWeeklyPlanSlots().map((slot) => ({
    slotNumber: slot.slotNumber,
    day: slot.day,
    archetype: slot.archetype,
  }));

  const result = await executeSkill<unknown[]>(
    "weekly-plan",
    withAliases({
      weeklyInput,
      synthesis,
      templateSlots,
      allowedArchetypes: WEEKLY_ARCHETYPE_OPTIONS.map((option) => option.value),
      weeklySlotCount: WEEKLY_SLOT_COUNT,
    })
  );

  return normalizeWeeklyPlanSlots(result.output);
}

export async function runWeeklySlotDraft(
  synthesis: WeeklySynthesis,
  slot: WeeklyPlanSlot
): Promise<WeeklySlotDraft> {
  if (slot.draftMode === "internal") {
    return runWeeklyInternalDraft(synthesis, slot);
  }
  if (slot.draftMode === "quick") {
    return runWeeklyQuickDraft(synthesis, slot);
  }
  return runWeeklyResearchDraft(synthesis, slot);
}

export async function runWeeklyBulkDraft(
  synthesis: WeeklySynthesis,
  slots: WeeklyPlanSlot[]
): Promise<WeeklySlotDraft[]> {
  const draftableSlots = slots.filter((slot) =>
    Boolean(slot.topic.trim() || slot.scheduleLabel.trim())
  );

  const drafts: WeeklySlotDraft[] = [];
  for (const slot of draftableSlots) {
    drafts.push(await runWeeklySlotDraft(synthesis, slot));
  }
  return drafts;
}
