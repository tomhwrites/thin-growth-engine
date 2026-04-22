import { executeSkill } from "@/harness/execute";
import { getRelevantDataPoints } from "@/lib/dataPoints";
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
  type WeeklyPlanSlot,
  type WeeklySlotDraft,
  type WeeklySynthesis,
  WEEKLY_AUDIENCE_OPTIONS,
  WEEKLY_ARCHETYPE_OPTIONS,
  WEEKLY_SLOT_COUNT,
} from "@/types/weeklyPlanning";
import { runWeeklyPairDraftStage } from "@/workflows/weeklyPairDrafting";
import type { Archetype } from "@/utils/tweetConfig";

type MetricsSkillOutput = {
  metrics: string[];
  overarchingNarrative: string;
};

type WeeklyFactCandidate = WeeklyFactPackItem & {
  priority: number;
  updatedAt?: Date | null;
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

function getFactCandidateSourceRank(sourceType?: string) {
  switch ((sourceType || "").toLowerCase()) {
    case "immutable":
      return 0;
    case "cited":
      return 1;
    case "verified":
    case "manual":
    case "internal":
    case "metric":
    case "research":
      return 2;
    case "slot_evidence":
    case "proof_point":
      return 3;
    case "synthesis":
      return 4;
    default:
      return 5;
  }
}

function normalizeCandidateClaim(claim: string) {
  return claim.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractClaimMagnitude(claim: string): number | null {
  const match = claim.match(/(\d+(?:\.\d+)?)\s*(billion|million|m|b)?/i);
  if (!match) return null;

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;

  const unit = (match[2] || "").toLowerCase();
  if (unit === "billion" || unit === "b") return value * 1_000_000_000;
  if (unit === "million" || unit === "m") return value * 1_000_000;
  return value;
}

function getSupersessionFamily(claim: string): string | null {
  const normalized = claim.toLowerCase();

  if (
    /\b(registered users?|wallets?|wallet|connected|onboarded)\b/.test(
      normalized
    ) &&
    /\d/.test(normalized)
  ) {
    return "audience_scale";
  }

  if (
    /\b(games?|titles?)\b/.test(normalized) &&
    /\b(total|signed|onboarded|integrated|connected)\b/.test(normalized) &&
    /\d/.test(normalized)
  ) {
    return "game_count";
  }

  return null;
}

function getClaimSpecificityScore(claim: string, family: string) {
  const normalized = claim.toLowerCase();

  if (family === "audience_scale") {
    if (/\bregistered users?\b/.test(normalized)) return 3;
    if (/\bwallets?\b/.test(normalized)) return 2;
    if (/\bconnected|onboarded\b/.test(normalized)) return 1;
  }

  if (family === "game_count") {
    if (/\btotal\b/.test(normalized)) return 3;
    if (/\bsigned\b/.test(normalized)) return 2;
    if (/\bonboarded|connected|integrated\b/.test(normalized)) return 1;
  }

  return 0;
}

function pickPreferredFactCandidate(
  current: WeeklyFactCandidate,
  candidate: WeeklyFactCandidate,
  family: string
) {
  const currentImmutable = current.sourceType === "immutable";
  const candidateImmutable = candidate.sourceType === "immutable";
  if (currentImmutable !== candidateImmutable) {
    return candidateImmutable ? candidate : current;
  }

  const currentMagnitude = extractClaimMagnitude(current.claim);
  const candidateMagnitude = extractClaimMagnitude(candidate.claim);
  if (
    currentMagnitude !== null &&
    candidateMagnitude !== null &&
    currentMagnitude !== candidateMagnitude
  ) {
    return candidateMagnitude > currentMagnitude ? candidate : current;
  }

  const currentSpecificity = getClaimSpecificityScore(current.claim, family);
  const candidateSpecificity = getClaimSpecificityScore(candidate.claim, family);
  if (candidateSpecificity !== currentSpecificity) {
    return candidateSpecificity > currentSpecificity ? candidate : current;
  }

  if (candidate.priority !== current.priority) {
    return candidate.priority < current.priority ? candidate : current;
  }

  const currentUpdatedAt = current.updatedAt?.getTime() ?? 0;
  const candidateUpdatedAt = candidate.updatedAt?.getTime() ?? 0;
  return candidateUpdatedAt > currentUpdatedAt ? candidate : current;
}

function suppressSupersededFactCandidates(candidates: WeeklyFactCandidate[]) {
  const preferredByFamily = new Map<string, WeeklyFactCandidate>();

  for (const candidate of candidates) {
    const family = getSupersessionFamily(candidate.claim);
    if (!family) continue;

    const current = preferredByFamily.get(family);
    preferredByFamily.set(
      family,
      current ? pickPreferredFactCandidate(current, candidate, family) : candidate
    );
  }

  return candidates.filter((candidate) => {
    const family = getSupersessionFamily(candidate.claim);
    if (!family) return true;
    return preferredByFamily.get(family) === candidate;
  });
}

function makeFactCandidates(
  claims: Array<{
    claim: string;
    sourceUrl?: string;
    sourceType?: string;
    priority: number;
    updatedAt?: Date | null;
  }>
) {
  return claims
    .map((claim) => ({
      claim: claim.claim.trim(),
      sourceUrl: claim.sourceUrl?.trim() || "",
      sourceType: claim.sourceType?.trim() || "",
      priority: claim.priority,
      updatedAt: claim.updatedAt ?? null,
    }))
    .filter((claim) => claim.claim.length > 0);
}

function buildWeeklyFactPack(
  candidates: WeeklyFactCandidate[]
): WeeklyFactPackItem[] {
  const dedupedByClaim = new Map<string, WeeklyFactCandidate>();

  for (const candidate of candidates) {
    const key = normalizeCandidateClaim(candidate.claim);
    const current = dedupedByClaim.get(key);
    if (!current) {
      dedupedByClaim.set(key, candidate);
      continue;
    }

    const preferred =
      current.priority === candidate.priority
        ? getFactCandidateSourceRank(current.sourceType) <=
          getFactCandidateSourceRank(candidate.sourceType)
          ? current
          : candidate
        : current.priority < candidate.priority
          ? current
          : candidate;
    dedupedByClaim.set(key, preferred);
  }

  return suppressSupersededFactCandidates(Array.from(dedupedByClaim.values()))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const sourceRankDelta =
        getFactCandidateSourceRank(a.sourceType) -
        getFactCandidateSourceRank(b.sourceType);
      if (sourceRankDelta !== 0) return sourceRankDelta;
      const aUpdatedAt = a.updatedAt?.getTime() ?? 0;
      const bUpdatedAt = b.updatedAt?.getTime() ?? 0;
      return bUpdatedAt - aUpdatedAt;
    })
    .slice(0, 5)
    .map((candidate) => ({
      claim: candidate.claim,
      sourceUrl: candidate.sourceUrl,
      sourceType: candidate.sourceType || undefined,
    }));
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
  const factPack = buildWeeklyFactPack([
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

  const factPack = buildWeeklyFactPack([
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
  const factPack = buildWeeklyFactPack([
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
