// app/api/fetchInternalData/route.ts
import { NextResponse } from "next/server";
import { Metric } from "@/components/TweetGenerator";
import { getRelevantDataPoints } from "@/lib/dataPoints";
import { callClaude } from "@/utils/agents";

interface FetchInternalDataRequest {
  topic: string;
}

export async function POST(request: Request) {
  try {
    const { topic } = (await request.json()) as FetchInternalDataRequest;
    const topicToUse = topic || "Web3 gaming";

    const dataPoints = await getRelevantDataPoints(topicToUse, 20);

    if (dataPoints.length === 0) {
      return NextResponse.json({
        metrics: [],
        overarchingNarrative: "",
        count: 0,
      });
    }

    const metrics: Metric[] = dataPoints.map((dp, i) => ({
      id: i.toString(),
      name: dp.claim,
      selected: false,
    }));

    // Synthesize a short narrative from DB claims only — no web search.
    const claimsBlock = dataPoints.map((dp) => `- ${dp.claim}`).join("\n");
    const overarchingNarrative = await callClaude(
      "You are a concise editorial assistant.",
      `Based only on the data points below, write a 1–2 sentence bullish narrative about "${topicToUse}" relevant to Immutable's position. Write ONLY the narrative — no preamble, no labels.\n\n${claimsBlock}`,
      200,
      { includeBusinessContext: false }
    );

    return NextResponse.json({ metrics, overarchingNarrative, count: dataPoints.length });
  } catch (error: any) {
    console.error("Error fetching internal data:", error?.message || error);
    return NextResponse.json(
      { error: `Failed to fetch internal data: ${error?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
