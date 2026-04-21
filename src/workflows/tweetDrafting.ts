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
};

function collectWarnings(...results: SkillResult[]): string[] {
  return results.flatMap((result) => result.warnings);
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
