// app/api/research-pipeline/route.ts
// Runs a single stage of the pipeline, given prior stage outputs.
// The frontend orchestrates the chain, calling stage by stage.
import { NextResponse } from "next/server";
import {
  Belief,
  EvidenceNeed,
  ResearchResult,
  NarrativeOutput,
  HookOutput,
  runBeliefAgent,
  runEvidenceAgent,
  runResearchAgent,
  runDeeperResearchAgent,
  runNarrativeAgent,
  runHookAgent,
  runTweetDrafter,
  getExemplarsForStyle,
} from "@/utils/agents";
import { tweetStyles } from "@/utils/tweetConfig";

type Stage = "belief" | "evidence" | "research" | "deepen" | "narrative" | "hook" | "draft";

interface StageRequest {
  stage: Stage;
  topic: string;
  tweetStyle?: string;
  contentTopic?: string;
  // Prior outputs — each stage uses what it needs
  beliefs?: Belief[];
  evidenceNeeds?: EvidenceNeed[];
  research?: ResearchResult[];
  narrative?: NarrativeOutput;
  hooks?: HookOutput;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StageRequest;
    const { stage, topic } = body;

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }
    if (!stage) {
      return NextResponse.json({ error: "Stage is required" }, { status: 400 });
    }

    console.log(`[Pipeline] Running stage: ${stage} for topic: "${topic}"`);

    switch (stage) {
      case "belief": {
        const beliefs = await runBeliefAgent(topic);
        return NextResponse.json({ beliefs });
      }

      case "evidence": {
        if (!body.beliefs?.length) {
          return NextResponse.json({ error: "Beliefs required for evidence stage" }, { status: 400 });
        }
        const evidenceNeeds = await runEvidenceAgent(topic, body.beliefs);
        return NextResponse.json({ evidenceNeeds });
      }

      case "research": {
        if (!body.evidenceNeeds?.length) {
          return NextResponse.json({ error: "Evidence needs required for research stage" }, { status: 400 });
        }
        const research = await runResearchAgent(topic, body.evidenceNeeds);
        return NextResponse.json({ research });
      }

      case "deepen": {
        if (!body.evidenceNeeds?.length) {
          return NextResponse.json({ error: "Evidence needs required for deepen stage" }, { status: 400 });
        }
        if (!body.research?.length) {
          return NextResponse.json({ error: "Prior research required for deepen stage" }, { status: 400 });
        }
        const research = await runDeeperResearchAgent(topic, body.evidenceNeeds, body.research);
        return NextResponse.json({ research });
      }

      case "narrative": {
        if (!body.research?.length) {
          return NextResponse.json({ error: "Research required for narrative stage" }, { status: 400 });
        }
        const narrative = await runNarrativeAgent(topic, body.research);
        return NextResponse.json({ narrative });
      }

      case "hook": {
        if (!body.narrative) {
          return NextResponse.json({ error: "Narrative required for hook stage" }, { status: 400 });
        }
        const hooks = await runHookAgent(topic, body.narrative);
        return NextResponse.json({ hooks });
      }

      case "draft": {
        if (!body.narrative || !body.hooks) {
          return NextResponse.json({ error: "Narrative and hooks required for draft stage" }, { status: 400 });
        }
        const tweetStyle = body.tweetStyle || "catchphrase";
        const selectedStyle =
          tweetStyles[tweetStyle as keyof typeof tweetStyles] || tweetStyles.catchphrase;

        const exemplarText = await getExemplarsForStyle(tweetStyle, body.contentTopic);

        const tweets = await runTweetDrafter(
          topic,
          body.narrative,
          body.hooks,
          selectedStyle.name,
          selectedStyle.description,
          exemplarText,
          body.contentTopic
        );
        return NextResponse.json({ tweets });
      }

      default:
        return NextResponse.json({ error: `Unknown stage: ${stage}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[Pipeline] Error:", error?.message || error);
    return NextResponse.json(
      { error: `Pipeline failed: ${error?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
