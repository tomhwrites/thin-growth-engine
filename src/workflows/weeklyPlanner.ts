import { executeSkill } from "@/harness/execute";
import { mapWithConcurrency, withTimeout } from "@/lib/async";
import { getRelevantDataPoints } from "@/lib/dataPoints";
import { buildFactPack, makeFactCandidates } from "@/lib/factPack";
import { withAliases } from "@/lib/skillArgs";
import type {
  NarrativeOutput,
  ResearchResult,
} from "@/types/researchPipeline";
import {
  ARCHETYPE_DEFAULTS,
  buildDefaultWeeklyPlanSlots,
  type AudienceLens,
  type WeeklyFactPackItem,
  type WeeklyPairDraftResult,
  type WeeklyInput,
  type WeeklyNarrative,
  type WeeklyQualityRunSummary,
  type WeeklyPlanSlot,
  type WeeklySlotDraft,
  type WeeklySynthesis,
  WEEKLY_AUDIENCE_OPTIONS,
  WEEKLY_ARCHETYPE_OPTIONS,
  WEEKLY_SLOT_COUNT,
} from "@/types/weeklyPlanning";
import { runWeeklyPairDraftStage } from "@/workflows/weeklyPairDrafting";
import { runWeeklyQualityDraft } from "@/workflows/weeklySlotCandidates";
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

function extractContextClaims(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

  return lines.length > 0 ? lines : [trimmed];
}

function buildWeeklySupplementalFacts(
  synthesis: WeeklySynthesis,
  slot: WeeklyPlanSlot,
  matchingNarrative?: WeeklyNarrative
) {
  return dedupeLines([
    ...extractContextClaims(slot.evidence),
    ...extractContextClaims(slot.additionalContext),
    ...(matchingNarrative?.proofPoints || []).map((item) => item.trim()).filter(Boolean),
    ...synthesis.evidenceBank.map((item) => item.trim()).filter(Boolean),
  ]);
}

function buildWeeklyNarrativeFrame(
  slot: WeeklyPlanSlot,
  baseNarrative: NarrativeOutput,
  matchingNarrative?: WeeklyNarrative
) {
  return (
    [slot.goal, baseNarrative.insight, matchingNarrative?.claim]
      .filter(Boolean)
      .join(" ")
      .trim() || getWeeklySlotEffectiveTopic(slot)
  );
}

async function runWeeklyPairDraft(
  slot: WeeklyPlanSlot,
  topic: string,
  narrativeFrame: string,
  factPack: WeeklyFactPackItem[]
): Promise<WeeklyPairDraftResult> {
  return runWeeklyPairDraftStage({
    topic,
    archetype: slot.archetype,
    tweetStyle: slot.tweetStyle,
    goal: slot.goal,
    factPack,
    additionalContext: slot.additionalContext,
    narrativeFrame,
  });
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
  const factPack = buildFactPack([
    ...makeFactCandidates(
      narrative.output.supportingData.map((item) => ({
        claim: item.claim,
        sourceUrl: item.sourceUrl,
        sourceType: "cited",
        priority: 0,
      }))
    ),
    ...makeFactCandidates(
      buildWeeklySupplementalFacts(synthesis, slot, matchingNarrative).map((claim) => ({
        claim,
        sourceType: "slot_evidence",
        priority: 2,
      }))
    ),
  ]);
  const draft = await runWeeklyPairDraft(
    slot,
    effectiveTopic,
    buildWeeklyNarrativeFrame(slot, narrative.output, matchingNarrative),
    factPack
  );

  return {
    slotId: slot.id,
    primaryDraft: draft.primaryDraft || "",
    alternateDraft: draft.alternateDraft || draft.primaryDraft || "",
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

  const factPack = buildFactPack([
    ...makeFactCandidates(
      dataPoints.map((dataPoint) => ({
        claim: dataPoint.claim,
        sourceUrl: dataPoint.sourceUrl,
        sourceType: dataPoint.sourceType,
        priority: dataPoint.sourceType === "immutable" ? 0 : 1,
        updatedAt: dataPoint.updatedAt ?? null,
      }))
    ),
    ...makeFactCandidates(
      buildWeeklySupplementalFacts(synthesis, slot, matchingNarrative).map((claim) => ({
        claim,
        sourceType: "slot_evidence",
        priority: 2,
      }))
    ),
  ]);
  const draft = await runWeeklyPairDraft(
    slot,
    effectiveTopic,
    buildWeeklyNarrativeFrame(slot, baseNarrative, matchingNarrative),
    factPack
  );

  return {
    slotId: slot.id,
    primaryDraft: draft.primaryDraft || "",
    alternateDraft: draft.alternateDraft || draft.primaryDraft || "",
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
    supportingData: metrics.output.metrics.map((claim) => ({
      claim,
      sourceUrl: "",
    })),
  };
  const factPack = buildFactPack([
    ...makeFactCandidates(
      metrics.output.metrics.map((claim) => ({
        claim,
        sourceType: "metric",
        priority: 1,
      }))
    ),
    ...makeFactCandidates(
      buildWeeklySupplementalFacts(synthesis, slot, matchingNarrative).map((claim) => ({
        claim,
        sourceType: "slot_evidence",
        priority: 2,
      }))
    ),
  ]);
  const draft = await runWeeklyPairDraft(
    slot,
    effectiveTopic,
    buildWeeklyNarrativeFrame(slot, baseNarrative, matchingNarrative),
    factPack
  );

  return {
    slotId: slot.id,
    primaryDraft: draft.primaryDraft || "",
    alternateDraft: draft.alternateDraft || draft.primaryDraft || "",
  };
}

async function runWeeklyQualitySlotDraft(
  synthesis: WeeklySynthesis,
  slot: WeeklyPlanSlot
): Promise<WeeklySlotDraft> {
  const matchingNarrative = findMatchingNarrative(synthesis, slot);
  const effectiveTopic = getWeeklySlotEffectiveTopic(slot);
  const searchTopic = [effectiveTopic, slot.additionalContext, slot.evidence]
    .filter(Boolean)
    .join(". ");
  const dataPoints = await getRelevantDataPoints(searchTopic, 20, {
    includeImmutableFallback: true,
  });

  const factPack = buildFactPack(
    [
      ...makeFactCandidates(
        dataPoints.map((dataPoint) => ({
          claim: dataPoint.claim,
          sourceUrl: dataPoint.sourceUrl,
          sourceType: dataPoint.sourceType,
          priority: dataPoint.sourceType === "immutable" ? 0 : 1,
          updatedAt: dataPoint.updatedAt ?? null,
        }))
      ),
      ...makeFactCandidates(
        buildWeeklySupplementalFacts(synthesis, slot, matchingNarrative).map((claim) => ({
          claim,
          sourceType: "slot_evidence",
          priority: 2,
        }))
      ),
    ],
    8
  );

  return runWeeklyQualityDraft({
    synthesis,
    slot,
    topic: effectiveTopic,
    factPack,
    matchingNarrative,
  });
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
  if (slot.draftMode === "quality") {
    return withTimeout(
      runWeeklyQualitySlotDraft(synthesis, slot),
      90_000,
      `Quality drafting timed out for ${slot.id}`
    ).catch((error: any) => ({
      slotId: slot.id,
      primaryDraft: "",
      alternateDraft: "",
      selectedCandidateId: null,
      alternateDrafts: [],
      candidates: [],
      scores: [],
      confidence: "low" as const,
      failureMode: error?.message?.includes("timed out")
        ? ("timeout" as const)
        : ("generation_failed" as const),
      selectionReason: error?.message || "Quality drafting failed.",
    }));
  }

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

  const hasQualitySlots = draftableSlots.some((slot) => slot.draftMode === "quality");

  if (hasQualitySlots) {
    return mapWithConcurrency(draftableSlots, 2, async (slot) => {
      if (slot.draftMode === "quality") {
        return runWeeklySlotDraft(synthesis, slot);
      }
      return runWeeklySlotDraft(synthesis, slot);
    });
  }

  const drafts: WeeklySlotDraft[] = [];
  for (const slot of draftableSlots) {
    drafts.push(await runWeeklySlotDraft(synthesis, slot));
  }
  return drafts;
}

export function summarizeWeeklyQualityRun(
  drafts: WeeklySlotDraft[]
): WeeklyQualityRunSummary {
  return drafts.reduce<WeeklyQualityRunSummary>(
    (summary, draft) => {
      summary.totalSlots += 1;
      if (draft.failureMode) {
        summary.failed += 1;
        if (draft.failureMode === "critic_failed") summary.criticFailures += 1;
        if (
          draft.failureMode === "generation_failed" ||
          draft.failureMode === "candidate_failed" ||
          draft.failureMode === "frame_failed"
        ) {
          summary.generationFailures += 1;
        }
      } else {
        summary.succeeded += 1;
      }
      if (draft.confidence === "low") summary.lowConfidence += 1;
      return summary;
    },
    {
      totalSlots: 0,
      succeeded: 0,
      failed: 0,
      lowConfidence: 0,
      criticFailures: 0,
      generationFailures: 0,
    }
  );
}
