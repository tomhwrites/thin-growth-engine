import { executeSkill } from "@/harness/execute";
import { withAliases } from "@/lib/skillArgs";
import type { HookOutput, NarrativeOutput } from "@/types/researchPipeline";

type SkillResult = {
  warnings: string[];
};

export type DraftSkillOutput = {
  drafts: string[];
  facts_used?: string[];
  rationale?: string;
};

export type CriticSkillOutput = {
  scores?: Array<Record<string, unknown>>;
  weakestIndices?: number[];
  rewrites?: Record<string, string>;
  finalTweets: string[];
  skipped?: boolean;
  skipReason?: string;
};

type DraftValidationIssue = {
  draftIndex: number;
  reason: string;
};

const TIME_QUALIFIER_PATTERNS = [
  /\b(?:in|within)\s+(?:under|over|less than|more than)\s+(?:a|\d+\+?)\s+(?:day|days|week|weeks|month|months|year|years)\b/gi,
  /\b(?:under|over|less than|more than)\s+(?:a|\d+\+?)\s+(?:day|days|week|weeks|month|months|year|years)\b/gi,
  /<\s*\d+\+?\s*(?:day|days|week|weeks|month|months|year|years)\b/gi,
  /\bsince launch\b/gi,
];

const BANNED_CONTRAST_PATTERNS = [
  /\bnot\s+[^.!?;\n]{0,80}\s+but\s+[^.!?;\n]{1,80}\b/i,
  /\bit'?s\s+not\s+just\s+[^.!?;\n]{1,80}\b/i,
  /\bdoesn'?t\s+just\s+[^.!?;\n]{1,80}\b/i,
  /\bisn'?t\s+[^.!?;\n]{1,80}\s+anymore\.\s+it'?s\s+[^.!?;\n]{1,80}\b/i,
  /\bthat(?:'s| is)\s+not\s+[^.!?;\n]{1,80}\.\s+that(?:'s| is)\s+[^.!?;\n]{1,80}\b/i,
];

function collectWarnings(...results: SkillResult[]): string[] {
  return results.flatMap((result) => result.warnings);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function collectGroundingTokens(text: string) {
  const numberTokens = (text.match(/\$?\d[\d,.%+kmb<>]*/gi) ?? [])
    .map((token) => token.replace(/[.,]+$/, "").trim())
    .filter(Boolean);
  const timeTokens = TIME_QUALIFIER_PATTERNS.flatMap((pattern) => {
    pattern.lastIndex = 0;
    return Array.from(text.matchAll(pattern), (match) => match[0]?.trim() ?? "").filter(
      Boolean
    );
  });

  return Array.from(new Set([...numberTokens, ...timeTokens].map(normalizeText))).filter(
    Boolean
  );
}

function buildGroundingHaystack(
  narrative: NarrativeOutput,
  factsUsed: string[]
) {
  return normalizeText(
    [
      narrative.insight ?? "",
      narrative.angle ?? "",
      ...(Array.isArray(narrative.supportingData)
        ? narrative.supportingData.map((item) => item.claim ?? "")
        : []),
      ...factsUsed,
    ].join(" ")
  );
}

function validateHookBulletsStructure(draft: string, expectedHook: string) {
  const lines = draft
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 4) {
    return "hookbullets drafts must include 1 hook line and 3 bullets";
  }

  if (lines[0] !== expectedHook.trim()) {
    return "hookbullets drafts must keep the hook as the exact first line";
  }

  if (!lines.slice(1, 4).every((line) => line.startsWith("•"))) {
    return "hookbullets drafts must place exactly 3 bullets immediately after the hook";
  }

  const bulletLines = lines.filter((line) => line.startsWith("•"));
  if (bulletLines.length !== 3) {
    return "hookbullets drafts must contain exactly 3 bullet lines";
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
    const withoutPunctuation = normalized.replace(/[.!?]+$/, "");

    const matchesStandaloneQualifier = TIME_QUALIFIER_PATTERNS.some((pattern) => {
      pattern.lastIndex = 0;
      const match = withoutPunctuation.match(pattern)?.[0] ?? "";
      return normalizeText(match) === withoutPunctuation;
    });

    if (matchesStandaloneQualifier) {
      return line;
    }
  }

  return null;
}

function validateDraftBatch(
  drafts: string[],
  hooks: HookOutput,
  narrative: NarrativeOutput,
  tweetStyle: string,
  factsUsed: string[]
): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = [];
  const hookTexts = hooks.hooks.map((hook) => String(hook.text ?? "").trim());

  if (drafts.length !== hookTexts.length || drafts.length !== 6) {
    issues.push({
      draftIndex: -1,
      reason: `Expected 6 drafts aligned to 6 hooks, received ${drafts.length} drafts and ${hookTexts.length} hooks`,
    });
    return issues;
  }

  const haystack = buildGroundingHaystack(narrative, factsUsed);

  drafts.forEach((draft, index) => {
    const trimmed = String(draft ?? "").trim();
    const expectedHook = hookTexts[index] ?? "";

    if (!trimmed) {
      issues.push({ draftIndex: index, reason: "Draft is empty" });
      return;
    }

    if (trimmed.length > 280) {
      issues.push({
        draftIndex: index,
        reason: `Draft exceeds 280 characters (${trimmed.length})`,
      });
    }

    if (!trimmed.startsWith(expectedHook)) {
      issues.push({
        draftIndex: index,
        reason: "Draft does not preserve the hook as its opening text",
      });
    }

    if (tweetStyle === "hookbullets") {
      const structureIssue = validateHookBulletsStructure(trimmed, expectedHook);
      if (structureIssue) {
        issues.push({ draftIndex: index, reason: structureIssue });
      }
    }

    if (BANNED_CONTRAST_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      issues.push({
        draftIndex: index,
        reason: "Draft contains a banned contrast construction from tweet voice rules",
      });
    }

    for (const token of collectGroundingTokens(trimmed)) {
      if (!haystack.includes(token)) {
        issues.push({
          draftIndex: index,
          reason: `Grounded token "${token}" was not found verbatim in the narrative or cited facts`,
        });
      }
    }

    const orphanedTimeLine = findOrphanedTimeQualifierLine(trimmed);
    if (orphanedTimeLine) {
      issues.push({
        draftIndex: index,
        reason: `Standalone time-qualifier line "${orphanedTimeLine}" is not allowed`,
      });
    }
  });

  return issues;
}

export async function runHookedDraftStage(
  topic: string,
  narrative: NarrativeOutput,
  hooks: HookOutput,
  tweetStyle = "catchphrase",
  archetype?: string,
  opts: { verbose?: boolean } = {}
) {
  const draftArgs = withAliases({
    topic,
    narrative,
    hooks,
    style: tweetStyle,
    archetype,
    contentTopic: archetype,
  });

  const draftResult = await executeSkill<DraftSkillOutput>("draft-tweet", draftArgs, opts);
  const validationIssues = validateDraftBatch(
    draftResult.output.drafts ?? [],
    hooks,
    narrative,
    tweetStyle,
    draftResult.output.facts_used ?? []
  );

  if (validationIssues.length === 0) {
    return {
      draft: draftResult.output,
      critic: {
        scores: [],
        weakestIndices: [],
        rewrites: {},
        finalTweets: draftResult.output.drafts,
        skipped: true,
        skipReason: "Draft validator passed; critic skipped.",
      } satisfies CriticSkillOutput,
      tweets: draftResult.output.drafts,
      warnings: collectWarnings(draftResult),
    };
  }

  const criticArgs = withAliases({
    topic,
    narrative,
    drafts: draftResult.output.drafts,
    style: tweetStyle,
    archetype,
    contentTopic: archetype,
  });
  const criticResult = await executeSkill<CriticSkillOutput>("critic", criticArgs, opts);

  return {
    draft: draftResult.output,
    critic: criticResult.output,
    tweets: criticResult.output.finalTweets,
    warnings: collectWarnings(draftResult, criticResult),
  };
}
