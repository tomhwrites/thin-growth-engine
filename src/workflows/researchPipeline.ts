import { executeSkill } from "@/harness/execute";
import { withAliases } from "@/lib/skillArgs";
import type {
  Belief,
  EvidenceNeed,
  HookOutput,
  NarrativeOutput,
  ResearchResult,
} from "@/types/researchPipeline";
import { runHookedDraftStage } from "./tweetDrafting";

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

type BeliefSkillOutput = { beliefs: Belief[] };
type EvidenceSkillOutput = { evidenceNeeds: EvidenceNeed[] };
type ResearchSkillOutput = { research: ResearchResult[]; newFindingsPersisted?: number };
type HookSkillOutput = HookOutput;
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
      const archetype = input.archetype ?? input.contentTopic;
      const result = await executeSkill<HookSkillOutput>(
        "hook",
        withAliases({ topic, narrative: input.narrative, archetype, contentTopic: archetype }),
        opts
      );
      return { hooks: result.output, warnings: result.warnings };
    }

    case "draft": {
      if (!input.narrative || !input.hooks) {
        throw new Error("Narrative and hooks required for draft stage");
      }
      const result = await runHookedDraftStage(
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
    withAliases({ topic, narrative: narrative.output, archetype, contentTopic: archetype }),
    opts
  );
  const draft = await runHookedDraftStage(
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
