import { executeSkill } from "@/harness/execute";
import {
  getWeeklySlotCandidateSkill,
  getWeeklySlotCriticSkill,
  getWeeklySlotFrameSkill,
} from "@/lib/skillVariants";
import { withAliases } from "@/lib/skillArgs";
import {
  buildGroundingHaystack,
  validateTweetText,
} from "@/lib/tweetValidation";
import type {
  WeeklyFactPackItem,
  WeeklyNarrative,
  WeeklyPlanSlot,
  WeeklyQualityConfidence,
  WeeklyQualityDraftResult,
  WeeklyQualityFailureMode,
  WeeklySlotCandidate,
  WeeklySlotCriticScore,
  WeeklySlotFrame,
  WeeklySynthesis,
} from "@/types/weeklyPlanning";
import { tweetStyles } from "@/utils/tweetConfig";

type WeeklySlotFrameInput = {
  synthesis: WeeklySynthesis;
  slot: WeeklyPlanSlot;
  topic: string;
  factPack: WeeklyFactPackItem[];
  matchingNarrative?: WeeklyNarrative;
};

type WeeklySlotCandidateInput = WeeklySlotFrameInput & {
  frame: WeeklySlotFrame;
};

type WeeklySlotCriticOutput = {
  selectedCandidateId: string | null;
  confidence: WeeklyQualityConfidence;
  selectionReason: string;
  scores: WeeklySlotCriticScore[];
};

type QualityFailureInput = {
  slotId: string;
  failureMode: WeeklyQualityFailureMode;
  selectionReason: string;
  candidates?: WeeklySlotCandidate[];
  scores?: WeeklySlotCriticScore[];
  frame?: WeeklySlotFrame;
};

const QUALITY_SCORE_KEYS = [
  "grounding",
  "ctBelievability",
  "causalFlow",
  "founderVoice",
  "nonObviousness",
  "selfPromoRisk",
  "aiLanguageRisk",
] as const;

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asStringArray(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, limit);
}

function clampScore(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

function normalizeConfidence(value: unknown): WeeklyQualityConfidence {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function normalizeWeeklySlotFrame(
  payload: unknown,
  input: WeeklySlotFrameInput
): WeeklySlotFrame {
  const data = (payload ?? {}) as Record<string, unknown>;
  const topic = asString(data.topic) || input.topic;
  const archetype = asString(data.archetype) || input.slot.archetype;
  const goal = asString(data.goal) || input.slot.goal;

  const frame: WeeklySlotFrame = {
    topic,
    archetype: input.slot.archetype,
    goal,
    audienceBelief: asString(data.audienceBelief),
    desiredShift: asString(data.desiredShift),
    proof: asStringArray(data.proof, 8),
    immutableRelevance: asString(data.immutableRelevance),
    avoid: asStringArray(data.avoid, 8),
  };

  if (!frame.audienceBelief || !frame.desiredShift || !frame.immutableRelevance) {
    throw new Error("weekly-slot-frame: missing required editorial frame fields");
  }

  if (archetype && archetype !== input.slot.archetype) {
    frame.avoid = [
      ...frame.avoid,
      `Do not drift from archetype ${input.slot.archetype}`,
    ];
  }

  return frame;
}

function normalizeWeeklySlotCandidates(
  payload: unknown
): WeeklySlotCandidate[] {
  const data = (payload ?? {}) as Record<string, unknown>;
  const rawCandidates = Array.isArray(data.candidates) ? data.candidates : [];

  return rawCandidates.slice(0, 6).map((candidate, index) => {
    const item = (candidate ?? {}) as Record<string, unknown>;
    return {
      id: asString(item.id) || `candidate-${index + 1}`,
      tweet: asString(item.tweet),
      hook: asString(item.hook),
      angle: asString(item.angle),
      factsUsed: asStringArray(item.factsUsed, 8),
      rationale: asString(item.rationale),
      validationIssues: [],
    };
  });
}

function normalizeWeeklySlotCritic(
  payload: unknown,
  candidates: WeeklySlotCandidate[]
): WeeklySlotCriticOutput {
  const data = (payload ?? {}) as Record<string, unknown>;
  const rawScores = Array.isArray(data.scores) ? data.scores : [];
  const scores = rawScores.map((score, index) => {
    const item = (score ?? {}) as Record<string, unknown>;
    const candidateId =
      asString(item.candidateId) || candidates[index]?.id || `candidate-${index + 1}`;
    const normalized: WeeklySlotCriticScore = {
      candidateId,
      grounding: 1,
      ctBelievability: 1,
      causalFlow: 1,
      founderVoice: 1,
      nonObviousness: 1,
      selfPromoRisk: 1,
      aiLanguageRisk: 1,
      total: 0,
      reason: asString(item.reason),
    };

    QUALITY_SCORE_KEYS.forEach((key) => {
      normalized[key] = clampScore(item[key]);
    });

    const computedTotal = QUALITY_SCORE_KEYS.reduce(
      (sum, key) => sum + normalized[key],
      0
    );
    normalized.total = Number.isFinite(Number(item.total))
      ? Math.max(0, Math.round(Number(item.total)))
      : computedTotal;
    return normalized;
  });

  if (scores.length === 0) {
    throw new Error("weekly-slot-critic: missing scores");
  }

  const selectedCandidateId =
    asString(data.selectedCandidateId) || scores[0]?.candidateId || candidates[0]?.id || null;
  return {
    selectedCandidateId,
    confidence: normalizeConfidence(data.confidence),
    selectionReason: asString(data.selectionReason),
    scores,
  };
}

function getGroundingInputs(input: WeeklySlotCandidateInput) {
  return [
    input.frame.audienceBelief,
    input.frame.desiredShift,
    input.frame.immutableRelevance,
    ...input.frame.proof,
    ...input.factPack.map((item) => item.claim),
  ];
}

function validateCandidates(
  candidates: WeeklySlotCandidate[],
  input: WeeklySlotCandidateInput
) {
  const haystack = buildGroundingHaystack(getGroundingInputs(input));
  const seenTweets = new Set<string>();

  return candidates.map((candidate) => {
    const validationIssues = validateTweetText({
      tweet: candidate.tweet,
      tweetStyle: input.slot.tweetStyle,
      haystack,
      expectedHook: input.slot.tweetStyle === "hookbullets" ? candidate.hook : undefined,
      archetype: input.slot.archetype,
    });
    const normalizedTweet = candidate.tweet.toLowerCase().replace(/\s+/g, " ").trim();
    if (seenTweets.has(normalizedTweet)) {
      validationIssues.push("duplicate_candidate");
    } else if (normalizedTweet) {
      seenTweets.add(normalizedTweet);
    }

    return { ...candidate, validationIssues };
  });
}

function sortCandidatesByValidation(candidates: WeeklySlotCandidate[]) {
  return [...candidates].sort((a, b) => {
    if (a.validationIssues.length !== b.validationIssues.length) {
      return a.validationIssues.length - b.validationIssues.length;
    }
    return a.tweet.length - b.tweet.length;
  });
}

function buildFailureDraft(input: QualityFailureInput): WeeklyQualityDraftResult {
  const firstCandidate = sortCandidatesByValidation(input.candidates || [])[0];
  const alternates = (input.candidates || [])
    .filter(
      (candidate) =>
        candidate.id !== firstCandidate?.id
    )
    .sort((a, b) => a.validationIssues.length - b.validationIssues.length)
    .map((candidate) => candidate.tweet);

  return {
    slotId: input.slotId,
    primaryDraft: firstCandidate?.tweet || "",
    alternateDraft: alternates[0] || "",
    selectedCandidateId: firstCandidate?.id || null,
    alternateDrafts: alternates,
    candidates: input.candidates || [],
    scores: input.scores || [],
    confidence: "low",
    failureMode: input.failureMode,
    selectionReason: input.selectionReason,
    frame: input.frame,
  };
}

function selectWinner(
  critic: WeeklySlotCriticOutput,
  candidates: WeeklySlotCandidate[]
) {
  const validCandidates = candidates.filter(
    (candidate) => candidate.validationIssues.length === 0
  );
  const candidatePool = validCandidates.length > 0
    ? validCandidates
    : sortCandidatesByValidation(candidates);
  const selected =
    candidatePool.find((candidate) => candidate.id === critic.selectedCandidateId) ||
    candidatePool[0];

  if (!selected) return null;

  const alternates = candidatePool
    .filter((candidate) => candidate.id !== selected.id)
    .map((candidate) => candidate.tweet);

  return {
    selected,
    alternates,
  };
}

export async function buildWeeklySlotFrame(
  input: WeeklySlotFrameInput,
  opts: { verbose?: boolean } = {}
) {
  const result = await executeSkill<WeeklySlotFrame>(
    getWeeklySlotFrameSkill(),
    withAliases({
      topic: input.topic,
      archetype: input.slot.archetype,
      goal: input.slot.goal,
      weeklySynthesis: input.synthesis,
      matchingNarrative: input.matchingNarrative ?? null,
      factPack: input.factPack,
      slotEvidence: input.slot.evidence,
      additionalContext: input.slot.additionalContext,
    }),
    opts
  );

  return normalizeWeeklySlotFrame(result.output, input);
}

export async function runWeeklySlotCandidateStage(
  input: WeeklySlotCandidateInput,
  opts: { verbose?: boolean } = {}
) {
  const selectedStyle =
    tweetStyles[input.slot.tweetStyle as keyof typeof tweetStyles] ||
    tweetStyles.catchphrase;
  const result = await executeSkill<{ candidates: WeeklySlotCandidate[] }>(
    getWeeklySlotCandidateSkill(input.slot.tweetStyle),
    withAliases({
      slotFrame: input.frame,
      topic: input.topic,
      style: input.slot.tweetStyle,
      styleName: selectedStyle.name,
      styleDescription: selectedStyle.description,
      factPack: input.factPack,
      archetype: input.slot.archetype,
      contentTopic: input.slot.archetype,
      additionalContext: input.slot.additionalContext,
    }),
    opts
  );

  return validateCandidates(normalizeWeeklySlotCandidates(result.output), input);
}

export async function runWeeklySlotCritic(
  input: WeeklySlotCandidateInput,
  candidates: WeeklySlotCandidate[],
  opts: { verbose?: boolean } = {}
) {
  const validCandidates = candidates.filter(
    (candidate) => candidate.validationIssues.length === 0
  );
  const candidatesToScore =
    validCandidates.length > 0 ? validCandidates : sortCandidatesByValidation(candidates);

  const result = await executeSkill<WeeklySlotCriticOutput>(
    getWeeklySlotCriticSkill(input.slot.tweetStyle),
    withAliases({
      slotFrame: input.frame,
      candidates: candidatesToScore,
      style: input.slot.tweetStyle,
      archetype: input.slot.archetype,
      contentTopic: input.slot.archetype,
    }),
    opts
  );

  return normalizeWeeklySlotCritic(result.output, candidatesToScore);
}

export async function runWeeklyQualityDraft(
  input: WeeklySlotFrameInput,
  opts: { verbose?: boolean } = {}
): Promise<WeeklyQualityDraftResult> {
  let frame: WeeklySlotFrame | undefined;
  let candidates: WeeklySlotCandidate[] = [];

  try {
    frame = await buildWeeklySlotFrame(input, opts);
  } catch (error: any) {
    return buildFailureDraft({
      slotId: input.slot.id,
      failureMode: "frame_failed",
      selectionReason: error?.message || "Slot frame generation failed.",
    });
  }

  const candidateInput = { ...input, frame };

  try {
    candidates = await runWeeklySlotCandidateStage(candidateInput, opts);
  } catch (error: any) {
    return buildFailureDraft({
      slotId: input.slot.id,
      frame,
      failureMode: "candidate_failed",
      selectionReason: error?.message || "Candidate generation failed.",
    });
  }

  let critic: WeeklySlotCriticOutput;
  try {
    critic = await runWeeklySlotCritic(candidateInput, candidates, opts);
  } catch (error: any) {
    const fallback = buildFailureDraft({
      slotId: input.slot.id,
      frame,
      candidates,
      failureMode: "critic_failed",
      selectionReason:
        error?.message || "Critic failed; selected best available candidate.",
    });

    if (fallback.primaryDraft) {
      return {
        ...fallback,
        confidence: "low",
        failureMode: null,
        selectionReason: "Best available; critic failed.",
      };
    }

    return fallback;
  }

  const winner = selectWinner(critic, candidates);
  if (!winner) {
    return buildFailureDraft({
      slotId: input.slot.id,
      frame,
      candidates,
      scores: critic.scores,
      failureMode: "no_valid_candidates",
      selectionReason: "Critic did not select a candidate.",
    });
  }
  const selectedHasValidationIssues =
    winner.selected.validationIssues.length > 0;

  return {
    slotId: input.slot.id,
    primaryDraft: winner.selected.tweet,
    alternateDraft: winner.alternates[0] || winner.selected.tweet,
    selectedCandidateId: winner.selected.id,
    alternateDrafts: winner.alternates,
    candidates,
    scores: critic.scores,
    confidence: selectedHasValidationIssues ? "low" : critic.confidence,
    failureMode: null,
    selectionReason: selectedHasValidationIssues
      ? "Best available; validation issues present."
      : critic.selectionReason,
    frame,
  };
}
