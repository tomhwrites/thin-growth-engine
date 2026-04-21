// app/api/fetchInternalData/route.ts
import { NextResponse } from "next/server";
import { Metric } from "@/components/TweetGenerator";
import { executeSkill } from "@/harness/execute";
import { getRelevantDataPoints } from "@/lib/dataPoints";
import { withAliases } from "@/lib/skillArgs";

interface FetchInternalDataRequest {
  topic: string;
}

export async function POST(request: Request) {
  try {
    const { topic } = (await request.json()) as FetchInternalDataRequest;
    const topicToUse = topic || "Web3 gaming";

    const dataPoints = await getRelevantDataPoints(topicToUse, 20, {
      includeImmutableFallback: true,
    });

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
    const narrativeResult = await executeSkill<{ overarchingNarrative: string }>(
      "internal-narrative",
      withAliases({
        topic: topicToUse,
        claims: dataPoints.map((dataPoint) => dataPoint.claim),
      })
    );
    const overarchingNarrative = narrativeResult.output.overarchingNarrative;

    return NextResponse.json({ metrics, overarchingNarrative, count: dataPoints.length });
  } catch (error: any) {
    console.error("Error fetching internal data:", error?.message || error);
    return NextResponse.json(
      { error: `Failed to fetch internal data: ${error?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
