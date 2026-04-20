// app/api/generate-tweets/route.ts
import { NextResponse } from "next/server";
import {
  generateTweetsFromOpenAI,
  GenerateTweetsRequest,
} from "@/utils/generateFromOpenAI";
import {
  runTweetDrafter,
  getExemplarsForStyle,
  NarrativeOutput,
  HookOutput,
} from "@/utils/agents";
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

    const exemplarText = await getExemplarsForStyle(
      requestData.tweetStyle as string,
      requestData.contentTopic
    );

    // Adapt the direct-path inputs into the shared drafter's shape so both
    // entrypoints go through the same prompt template in runTweetDrafter.
    const narrative: NarrativeOutput = {
      insight: requestData.overarchingNarrative || "",
      angle: "",
      supportingData: requestData.selectedMetrics,
    };
    const hooks: HookOutput = { hooks: [] };

    const tweets = await runTweetDrafter(
      requestData.topic,
      narrative,
      hooks,
      selectedStyle.name,
      selectedStyle.description,
      exemplarText,
      requestData.contentTopic
    );

    return NextResponse.json({ tweets });
  } catch (error: any) {
    console.error("Error generating tweets:", error?.message || error);
    return NextResponse.json(
      { error: `Failed to generate tweets: ${error?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
