import { executeSkill } from "@/harness/execute";
import type {
  Belief,
  EvidenceNeed,
  HookOutput,
  NarrativeOutput,
  ResearchResult,
} from "@/types/researchPipeline";

export type PipelineStage =
  | "belief"
  | "evidence"
  | "research"
  | "deepen"
  | "narrative"
  | "hook"
  | "draft";

export interface StageRequest {
  stage: PipelineStage;
  topic: string;
  tweetStyle?: string;
  archetype?: string;
  contentTopic?: string;
  beliefs?: Belief[];
  evidenceNeeds?: EvidenceNeed[];
  research?: ResearchResult[];
  narrative?: NarrativeOutput;
  hooks?: HookOutput;
}

export interface ChainRequest {
  topic: string;
  tweetStyle?: string;
  archetype?: string;
  contentTopic?: string;
}

type SkillResult = {
  warnings: string[];
};

type BeliefSkillOutput = { beliefs: Belief[] };
type EvidenceSkillOutput = { evidenceNeeds: EvidenceNeed[] };
type ResearchSkillOutput = { research: ResearchResult[]; newFindingsPersisted?: number };
type HookSkillOutput = HookOutput;
type DraftSkillOutput = { drafts: string[]; facts_used?: string[]; rationale?: string };
type CriticSkillOutput = {
  scores?: Array<Record<string, unknown>>;
  weakestIndices?: number[];
  rewrites?: Record<string, string>;
  finalTweets: string[];
};

function withAliases(args: Record<string, unknown>): Record<string, unknown> {
  const aliased = { ...args };

  for (const [key, value] of Object.entries(args)) {
    const upperSnake = key.replace(/([A-Z])/g, "_$1").toUpperCase();
    if (!(upperSnake in aliased)) {
      aliased[upperSnake] = value;
    }
  }

  return aliased;
}

function collectWarnings(...results: SkillResult[]): string[] {
  return results.flatMap((result) => result.warnings);
}

async function runDraftStage(
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

export async function runResearchPipelineStage(
  input: StageRequest,
  opts: { verbose?: boolean } = {}
): Promise<Record<string, unknown>> {
  const topic = input.topic || "Web3 gaming";

  switch (input.stage) {
    case "belief": {
      const result = await executeSkill<BeliefSkillOutput>(
        "belief",
        withAliases({ topic }),
        opts
      );
      return { beliefs: result.output.beliefs, warnings: result.warnings };
    }

    case "evidence": {
      if (!input.beliefs?.length) {
        throw new Error("Beliefs required for evidence stage");
      }
      const result = await executeSkill<EvidenceSkillOutput>(
        "evidence",
        withAliases({ topic, beliefs: input.beliefs }),
        opts
      );
      return { evidenceNeeds: result.output.evidenceNeeds, warnings: result.warnings };
    }

    case "research":
    case "deepen": {
      if (!input.evidenceNeeds?.length) {
        throw new Error("Evidence needs required for research stage");
      }
      const result = await executeSkill<ResearchSkillOutput>(
        "research",
        withAliases({ topic, evidenceNeeds: input.evidenceNeeds, research: input.research }),
        opts
      );
      return { research: result.output.research, warnings: result.warnings };
    }

    case "narrative": {
      if (!input.research?.length) {
        throw new Error("Research required for narrative stage");
      }
      const result = await executeSkill<NarrativeOutput>(
        "narrative",
        withAliases({ topic, research: input.research }),
        opts
      );
      return { narrative: result.output, warnings: result.warnings };
    }

    case "hook": {
      if (!input.narrative) {
        throw new Error("Narrative required for hook stage");
      }
      const result = await executeSkill<HookSkillOutput>(
        "hook",
        withAliases({ topic, narrative: input.narrative }),
        opts
      );
      return { hooks: result.output, warnings: result.warnings };
    }

    case "draft": {
      if (!input.narrative || !input.hooks) {
        throw new Error("Narrative and hooks required for draft stage");
      }
      const result = await runDraftStage(
        topic,
        input.narrative,
        input.hooks,
        input.tweetStyle,
        input.archetype ?? input.contentTopic,
        opts
      );
      return { tweets: result.tweets, warnings: result.warnings };
    }

    default:
      throw new Error(`Unknown stage: ${input.stage}`);
  }
}

export async function runResearchPipelineChain(
  input: ChainRequest,
  opts: { verbose?: boolean } = {}
) {
  const topic = input.topic || "Web3 gaming";
  const tweetStyle = input.tweetStyle || "catchphrase";
  const archetype = input.archetype ?? input.contentTopic;

  const belief = await executeSkill<BeliefSkillOutput>("belief", withAliases({ topic }), opts);
  const evidence = await executeSkill<EvidenceSkillOutput>(
    "evidence",
    withAliases({ topic, beliefs: belief.output.beliefs }),
    opts
  );
  const research = await executeSkill<ResearchSkillOutput>(
    "research",
    withAliases({ topic, evidenceNeeds: evidence.output.evidenceNeeds }),
    opts
  );
  const narrative = await executeSkill<NarrativeOutput>(
    "narrative",
    withAliases({ topic, research: research.output.research }),
    opts
  );
  const hook = await executeSkill<HookSkillOutput>(
    "hook",
    withAliases({ topic, narrative: narrative.output }),
    opts
  );
  const draft = await runDraftStage(
    topic,
    narrative.output,
    hook.output,
    tweetStyle,
    archetype,
    opts
  );

  return {
    topic,
    tweetStyle,
    archetype: archetype ?? null,
    beliefs: belief.output.beliefs,
    evidenceNeeds: evidence.output.evidenceNeeds,
    research: research.output.research,
    narrative: narrative.output,
    hooks: hook.output,
    drafts: draft.draft.drafts,
    factsUsed: draft.draft.facts_used ?? [],
    critic: draft.critic,
    tweets: draft.tweets,
    warnings: {
      belief: belief.warnings,
      evidence: evidence.warnings,
      research: research.warnings,
      narrative: narrative.warnings,
      hook: hook.warnings,
      draft: draft.warnings,
    },
  };
}
