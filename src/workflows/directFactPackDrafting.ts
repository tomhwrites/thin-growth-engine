import { executeSkill } from "@/harness/execute";
import { getDirectFactPackDraftSkill, getDirectFactPackRewriteSkill } from "@/lib/skillVariants";
import { withAliases } from "@/lib/skillArgs";
import type {
  DirectDraftOutput,
  DirectFactPackDraftInput,
  InvalidDirectTweet,
} from "@/types/directDrafting";
import type { FactPackItem } from "@/types/factPack";
import { tweetStyles } from "@/utils/tweetConfig";

type DirectDraftValidationIssue = {
  tweetIndex: number;
  reason: string;
};

type DirectDraftValidationResult = {
  issues: DirectDraftValidationIssue[];
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

function buildGroundingHaystack(factPack: FactPackItem[], narrative: string) {
  return normalizeText([narrative, ...factPack.map((item) => item.claim)].join(" "));
}

function validateHookBulletsStructure(tweet: string) {
  const lines = tweet
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLines = lines.filter((line) => line.startsWith("•"));
  if (lines.length !== 4 || bulletLines.length !== 3) {
    return "hookbullets tweets must be 1 hook line plus exactly 3 bullets";
  }

  if (lines[0].startsWith("•")) {
    return "hookbullets tweets must begin with a hook line before the bullets";
  }

  if (lines.slice(1).some((line) => !line.startsWith("•"))) {
    return "hookbullets tweets cannot include a closer after the 3 bullets";
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

function findOrphanedTimeQualifierLine(tweet: string) {
  const lines = tweet
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith("•")) continue;

    const normalized = normalizeText(line);
    const withoutPunctuation = normalized.replace(/[.!?]+$/, "");

    const matchingQualifier = TIME_QUALIFIER_PATTERNS.find((pattern) => {
      pattern.lastIndex = 0;
      const match = withoutPunctuation.match(pattern)?.[0] ?? "";
      return normalizeText(match) === withoutPunctuation;
    });

    if (matchingQualifier) {
      return line;
    }
  }

  return null;
}

function validateSingleTweet(
  tweetIndex: number,
  tweet: string,
  tweetStyle: string,
  haystack: string
): DirectDraftValidationIssue[] {
  const issues: DirectDraftValidationIssue[] = [];
  const trimmed = tweet.trim();

  if (!trimmed) {
    issues.push({ tweetIndex, reason: "Tweet is empty" });
    return issues;
  }

  if (trimmed.length > 280) {
    issues.push({
      tweetIndex,
      reason: `Tweet exceeds 280 characters (${trimmed.length})`,
    });
  }

    if (tweetStyle === "hookbullets") {
      const structureIssue = validateHookBulletsStructure(trimmed);
      if (structureIssue) {
        issues.push({ tweetIndex, reason: structureIssue });
      }
    }

    const forbiddenTerm = FORBIDDEN_TERM_PATTERNS.find((pattern) => pattern.test(trimmed));
    if (forbiddenTerm) {
      issues.push({
        tweetIndex,
        reason: "Tweet contains a forbidden tweet-voice term",
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
        tweetIndex,
        reason: `Grounded token "${token}" was not found verbatim in the fact pack or narrative`,
      });
    }
  }

  const orphanedTimeLine = findOrphanedTimeQualifierLine(trimmed);
  if (orphanedTimeLine) {
    issues.push({
      tweetIndex,
      reason: `Standalone time-qualifier line "${orphanedTimeLine}" is not allowed`,
    });
  }

  return issues;
}

function validateDirectDraft(
  output: DirectDraftOutput,
  input: DirectFactPackDraftInput
): DirectDraftValidationResult {
  const issues: DirectDraftValidationIssue[] = [];

  if (output.tweets.length !== 6) {
    issues.push({
      tweetIndex: -1,
      reason: `Expected exactly 6 tweets, received ${output.tweets.length}`,
    });
  }

  const haystack = buildGroundingHaystack(input.factPack, input.narrative);
  output.tweets.forEach((tweet, index) => {
    issues.push(...validateSingleTweet(index, tweet, input.tweetStyle, haystack));
  });

  return { issues };
}

function getValidTweets(
  output: DirectDraftOutput,
  input: DirectFactPackDraftInput
) {
  const validation = validateDirectDraft(output, input);
  const invalidIndexes = new Set(
    validation.issues
      .filter((issue) => issue.tweetIndex >= 0)
      .map((issue) => issue.tweetIndex)
  );

  return output.tweets.filter((_, index) => !invalidIndexes.has(index));
}

function formatValidationIssues(issues: DirectDraftValidationIssue[]) {
  return issues
    .map((issue) =>
      issue.tweetIndex < 0
        ? issue.reason
        : `tweet ${issue.tweetIndex + 1}: ${issue.reason}`
    )
    .join("; ");
}

function normalizeDraftOutput(output: Partial<DirectDraftOutput>): DirectDraftOutput {
  return {
    tweets: Array.isArray(output.tweets)
      ? output.tweets.map((tweet) => String(tweet ?? "").trim()).filter(Boolean)
      : [],
    factsUsed: Array.isArray(output.factsUsed)
      ? output.factsUsed.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    rationale: String(output.rationale ?? "").trim(),
  };
}

export async function runDirectFactPackDraftStage(
  input: DirectFactPackDraftInput,
  opts: { verbose?: boolean } = {}
): Promise<DirectDraftOutput> {
  const selectedStyle =
    tweetStyles[input.tweetStyle as keyof typeof tweetStyles] || tweetStyles.catchphrase;
  const sharedArgs = withAliases({
    topic: input.topic,
    narrative: input.narrative,
    style: input.tweetStyle,
    styleName: selectedStyle.name,
    styleDescription: selectedStyle.description,
    archetype: input.archetype,
    contentTopic: input.archetype,
    factPack: input.factPack,
    dataSource: input.dataSource,
  });

  const draftResult = await executeSkill<DirectDraftOutput>(
    getDirectFactPackDraftSkill(input.tweetStyle),
    sharedArgs,
    opts
  );
  const normalizedInitial = normalizeDraftOutput(draftResult.output);
  const validation = validateDirectDraft(normalizedInitial, input);

  if (validation.issues.length === 0) {
    return normalizedInitial;
  }

  const invalidTweets = Array.from(
    validation.issues.reduce((map, issue) => {
      if (issue.tweetIndex < 0) return map;
      const current = map.get(issue.tweetIndex) ?? [];
      current.push(issue.reason);
      map.set(issue.tweetIndex, current);
      return map;
    }, new Map<number, string[]>())
  ).map(([index, reasons]) => ({
    index,
    currentTweet: normalizedInitial.tweets[index] ?? "",
    reasons,
  })) satisfies InvalidDirectTweet[];

  const rewriteResult = await executeSkill<DirectDraftOutput>(
    getDirectFactPackRewriteSkill(input.tweetStyle),
    withAliases({
      ...sharedArgs,
      tweets: normalizedInitial.tweets,
      invalidTweets,
      validationError:
        invalidTweets.length === 0 ? formatValidationIssues(validation.issues) : "",
    }),
    opts
  );
  const normalizedRewrite = normalizeDraftOutput(rewriteResult.output);
  const rewriteValidation = validateDirectDraft(normalizedRewrite, input);

  if (rewriteValidation.issues.length > 0) {
    const validTweets = getValidTweets(normalizedRewrite, input);
    if (validTweets.length > 0) {
      return {
        ...normalizedRewrite,
        tweets: validTweets.slice(0, 6),
      };
    }

    throw new Error(
      `Direct fact-pack draft validation failed after rewrite: ${formatValidationIssues(
        rewriteValidation.issues
      )}`
    );
  }

  return normalizedRewrite;
}
