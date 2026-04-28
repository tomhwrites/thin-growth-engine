// app/api/generate-tweets/route.ts
import { NextResponse } from "next/server";
import { executeSkill } from "@/harness/execute";
import { buildFactPack, makeFactCandidates } from "@/lib/factPack";
import { withAliases } from "@/lib/skillArgs";
import {
  generateTweetsFromOpenAI,
  GenerateTweetsRequest,
} from "@/utils/generateFromOpenAI";
import { runDirectFactPackDraftStage } from "@/workflows/directFactPackDrafting";
import { tweetStyles } from "@/utils/tweetConfig";

export async function POST(request: Request) {
  try {
    const requestData = (await request.json()) as GenerateTweetsRequest;

    if (
      !requestData.topic ||
      !requestData.selectedMetrics ||
      requestData.selectedMetrics.length === 0
    ) {
      return NextResponse.json(
        { error: "Topic and at least one metric are required" },
        { status: 400 }
      );
    }

    console.log("Generating tweets for topic:", requestData.topic);
    console.log("Using tweet style:", requestData.tweetStyle);

    if (requestData.model === "OpenAI") {
      try {
        const result = await generateTweetsFromOpenAI(requestData);
        return NextResponse.json(result);
      } catch (error) {
        console.error("OpenAI API error:", error);
        return NextResponse.json(
          { error: "Error generating tweets with OpenAI" },
          { status: 500 }
        );
      }
    }

    console.log("Using Anthropic Claude model");

    const selectedStyle =
      tweetStyles[requestData.tweetStyle as keyof typeof tweetStyles] ||
      tweetStyles.catchphrase;

    if (
      requestData.dataSource === "internal" ||
      requestData.dataSource === "quick"
    ) {
      const factPack =
        requestData.factPack && requestData.factPack.length > 0
          ? requestData.factPack
          : buildFactPack(
              makeFactCandidates(
                requestData.selectedMetrics.map((claim) => ({
                  claim,
                  sourceType:
                    requestData.dataSource === "internal" ? "internal" : "metric",
                  priority: 1,
                }))
              )
            );

      const result = await runDirectFactPackDraftStage({
        topic: requestData.topic,
        archetype: requestData.archetype ?? requestData.contentTopic,
        tweetStyle: requestData.tweetStyle,
        narrative: requestData.overarchingNarrative || requestData.topic,
        factPack,
        dataSource: requestData.dataSource,
      });

      return NextResponse.json({ tweets: result.tweets });
    }

    const result = await executeSkill<{
      tweets: string[];
      factsUsed?: string[];
      rationale?: string;
    }>(
      "direct-draft",
      withAliases({
        topic: requestData.topic,
        narrative: requestData.overarchingNarrative || requestData.topic,
        metrics: requestData.selectedMetrics,
        style: requestData.tweetStyle,
        styleName: selectedStyle.name,
        styleDescription: selectedStyle.description,
        archetype: requestData.archetype ?? requestData.contentTopic,
        contentTopic: requestData.archetype ?? requestData.contentTopic,
        dataSource: requestData.dataSource,
      })
    );

    return NextResponse.json({ tweets: result.output.tweets });
  } catch (error: any) {
    console.error("Error generating tweets:", error?.message || error);
    return NextResponse.json(
      { error: `Failed to generate tweets: ${error?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
