import { executeSkill } from "@/harness/execute";
import { getWeeklyPairDraftSkill, getWeeklyPairRewriteSkill } from "@/lib/skillVariants";
import { withAliases } from "@/lib/skillArgs";
import type {
  WeeklyDraftKey,
  WeeklyFactPackItem,
  WeeklyPairDraftResult,
} from "@/types/weeklyPlanning";
import { tweetStyles } from "@/utils/tweetConfig";

type WeeklyDraftValidationIssue = {
  draftKey: WeeklyDraftKey;
  reason: string;
};

type WeeklyDraftValidationResult = {
  issues: WeeklyDraftValidationIssue[];
};

type RunWeeklyPairDraftInput = {
  topic: string;
  archetype?: string;
  tweetStyle: string;
  goal: string;
  factPack: WeeklyFactPackItem[];
  additionalContext?: string;
  narrativeFrame?: string;
};

const TIME_QUALIFIER_PATTERNS = [
  /\b(?:in|within)\s+(?:under|over|less than|more than)\s+(?:a|\d+\+?)\s+(?:day|days|week|weeks|month|months|year|years)\b/gi,
  /\b(?:under|over|less than|more than)\s+(?:a|\d+\+?)\s+(?:day|days|week|weeks|month|months|year|years)\b/gi,
  /<\s*\d+\+?\s*(?:day|days|week|weeks|month|months|year|years)\b/gi,
  /\bsince launch\b/gi,
];

const FORBIDDEN_TERM_PATTERNS = [
  /\bcrypto\b/i,
  /\bimx\b/i,
  /\bnfts?\b/i,
  /\bblockchain\b/i,
];

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function collectNumberTokens(text: string) {
  return Array.from(
    new Set(
      (text.match(/\$?\d[\d,.%+kmb<>]*/gi) ?? [])
        .map((token) => token.replace(/[.,]+$/, "").trim())
        .filter(Boolean)
    )
  );
}

function collectTimeQualifiers(text: string) {
  const matches = new Set<string>();

  for (const pattern of TIME_QUALIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const token = match[0]?.trim();
      if (token) matches.add(token);
    }
  }

  return Array.from(matches);
}

function buildGroundingHaystack(
  factPack: WeeklyFactPackItem[],
  narrativeFrame?: string
) {
  return normalizeText(
    [
      narrativeFrame ?? "",
      ...factPack.map((item) => item.claim),
    ].join(" ")
  );
}

function validateHookBulletsStructure(draft: string) {
  const lines = draft
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLines = lines.filter((line) => line.startsWith("•"));
  if (lines.length !== 4 || bulletLines.length !== 3) {
    return "hookbullets drafts must be 1 hook line plus exactly 3 bullets";
  }

  if (lines[0].startsWith("•")) {
    return "hookbullets drafts must begin with a hook line before the bullets";
  }

  if (lines.slice(1).some((line) => !line.startsWith("•"))) {
    return "hookbullets drafts cannot include a closer after the 3 bullets";
  }

  const longBullet = bulletLines.find((line) => {
    const wordCount = line
      .replace(/^•\s*/, "")
      .split(/\s+/)
      .filter(Boolean).length;
    return wordCount > 10;
  });
  if (longBullet) {
    return `hookbullets bullets must stay compact (max 10 words): "${longBullet}"`;
  }

  return null;
}

function findOrphanedTimeQualifierLine(draft: string) {
  const lines = draft
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith("•")) continue;

    const normalized = normalizeText(line);
    const matchesQualifier = TIME_QUALIFIER_PATTERNS.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(line);
    });

    if (matchesQualifier && normalized === normalizeText(line.match(/.+/)?.[0] ?? "")) {
      const withoutPunctuation = normalized.replace(/[.!?]+$/, "");
      if (TIME_QUALIFIER_PATTERNS.some((pattern) => {
        pattern.lastIndex = 0;
        return (withoutPunctuation.match(pattern)?.[0] ?? "") === withoutPunctuation;
      })) {
        return line;
      }
    }
  }

  return null;
}

function validateSingleDraft(
  draftKey: WeeklyDraftKey,
  draft: string,
  tweetStyle: string,
  haystack: string
): WeeklyDraftValidationIssue[] {
  const issues: WeeklyDraftValidationIssue[] = [];
  const trimmed = draft.trim();

  if (!trimmed) {
    issues.push({ draftKey, reason: "Draft is empty" });
    return issues;
  }

  if (trimmed.length > 280) {
    issues.push({
      draftKey,
      reason: `Draft exceeds 280 characters (${trimmed.length})`,
    });
  }

  if (tweetStyle === "hookbullets") {
    const hookBulletsIssue = validateHookBulletsStructure(trimmed);
    if (hookBulletsIssue) {
      issues.push({ draftKey, reason: hookBulletsIssue });
    }
  }

  const forbiddenTerm = FORBIDDEN_TERM_PATTERNS.find((pattern) => pattern.test(trimmed));
  if (forbiddenTerm) {
    issues.push({
      draftKey,
      reason: "Draft contains a forbidden tweet-voice term",
    });
  }

  const groundingTokens = [
    ...collectNumberTokens(trimmed),
    ...collectTimeQualifiers(trimmed),
  ];
  const uniqueTokens = Array.from(new Set(groundingTokens.map(normalizeText)));

  for (const token of uniqueTokens) {
    if (!token) continue;
    if (!haystack.includes(token)) {
      issues.push({
        draftKey,
        reason: `Grounded token "${token}" was not found verbatim in the weekly fact pack or narrative frame`,
      });
    }
  }

  const orphanedTimeLine = findOrphanedTimeQualifierLine(trimmed);
  if (orphanedTimeLine) {
    issues.push({
      draftKey,
      reason: `Standalone time-qualifier line "${orphanedTimeLine}" is not allowed`,
    });
  }

  return issues;
}

function validateWeeklyPairDraft(
  output: WeeklyPairDraftResult,
  input: RunWeeklyPairDraftInput
): WeeklyDraftValidationResult {
  const haystack = buildGroundingHaystack(input.factPack, input.narrativeFrame);

  return {
    issues: [
      ...validateSingleDraft(
        "primaryDraft",
        output.primaryDraft,
        input.tweetStyle,
        haystack
      ),
      ...validateSingleDraft(
        "alternateDraft",
        output.alternateDraft,
        input.tweetStyle,
        haystack
      ),
    ],
  };
}

function formatValidationIssues(issues: WeeklyDraftValidationIssue[]) {
  return issues
    .map((issue) =>
      `${issue.draftKey === "primaryDraft" ? "primary" : "alternate"}: ${issue.reason}`
    )
    .join("; ");
}

function normalizePairDraftOutput(
  output: Partial<WeeklyPairDraftResult>
): WeeklyPairDraftResult {
  return {
    primaryDraft: String(output.primaryDraft ?? "").trim(),
    alternateDraft: String(output.alternateDraft ?? "").trim(),
    factsUsed: Array.isArray(output.factsUsed)
      ? output.factsUsed.map((item) => String(item).trim()).filter(Boolean)
      : [],
    rationale: String(output.rationale ?? "").trim(),
  };
}

export async function runWeeklyPairDraftStage(
  input: RunWeeklyPairDraftInput,
  opts: { verbose?: boolean } = {}
): Promise<WeeklyPairDraftResult> {
  const selectedStyle =
    tweetStyles[input.tweetStyle as keyof typeof tweetStyles] || tweetStyles.catchphrase;
  const sharedArgs = withAliases({
    topic: input.topic,
    style: input.tweetStyle,
    styleName: selectedStyle.name,
    styleDescription: selectedStyle.description,
    archetype: input.archetype,
    contentTopic: input.archetype,
    goal: input.goal,
    factPack: input.factPack,
    additionalContext: input.additionalContext ?? "",
    narrativeFrame: input.narrativeFrame ?? "",
  });

  const pairResult = await executeSkill<WeeklyPairDraftResult>(
    getWeeklyPairDraftSkill(input.tweetStyle),
    sharedArgs,
    opts
  );
  const normalizedInitial = normalizePairDraftOutput(pairResult.output);
  const validation = validateWeeklyPairDraft(normalizedInitial, input);

  if (validation.issues.length === 0) {
    return normalizedInitial;
  }

  const invalidDrafts = Array.from(
    validation.issues.reduce((map, issue) => {
      const reasons = map.get(issue.draftKey) ?? [];
      reasons.push(issue.reason);
      map.set(issue.draftKey, reasons);
      return map;
    }, new Map<WeeklyDraftKey, string[]>())
  ).map(([draftKey, reasons]) => ({ draftKey, reasons }));

  const rewriteResult = await executeSkill<WeeklyPairDraftResult>(
    getWeeklyPairRewriteSkill(input.tweetStyle),
    withAliases({
      ...sharedArgs,
      primaryDraft: normalizedInitial.primaryDraft,
      alternateDraft: normalizedInitial.alternateDraft,
      invalidDrafts,
    }),
    opts
  );
  const normalizedRewrite = normalizePairDraftOutput(rewriteResult.output);
  const rewriteValidation = validateWeeklyPairDraft(normalizedRewrite, input);

  if (rewriteValidation.issues.length > 0) {
    throw new Error(
      `Weekly pair draft validation failed after rewrite: ${formatValidationIssues(
        rewriteValidation.issues
      )}`
    );
  }

  return normalizedRewrite;
}
