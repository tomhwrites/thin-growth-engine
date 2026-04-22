// app/api/fetchInternalData/route.ts
import { NextResponse } from "next/server";
import { Metric } from "@/components/TweetGenerator";
import { executeSkill } from "@/harness/execute";
import { getRelevantDataPoints } from "@/lib/dataPoints";
import { buildFactPack, makeFactCandidates } from "@/lib/factPack";
import { withAliases } from "@/lib/skillArgs";
import type { FactPackItem } from "@/types/factPack";

interface FetchInternalDataRequest {
  topic: string;
}

interface FetchInternalDataResponse {
  metrics: Metric[];
  overarchingNarrative: string;
  count: number;
  factPack: FactPackItem[];
}

export async function POST(request: Request) {
  try {
    const { topic } = (await request.json()) as FetchInternalDataRequest;
    const topicToUse = topic || "Web3 gaming";

    const dataPoints = await getRelevantDataPoints(topicToUse, 20, {
      includeImmutableFallback: true,
    });

    if (dataPoints.length === 0) {
      const emptyResponse: FetchInternalDataResponse = {
        metrics: [],
        overarchingNarrative: "",
        count: 0,
        factPack: [],
      };
      return NextResponse.json(emptyResponse);
    }

    const factPack = buildFactPack(
      makeFactCandidates(
        dataPoints.map((dataPoint) => ({
          claim: dataPoint.claim,
          sourceUrl: dataPoint.sourceUrl,
          sourceType: dataPoint.sourceType,
          priority: dataPoint.sourceType === "immutable" ? 0 : 1,
          updatedAt: dataPoint.updatedAt ?? null,
        }))
      )
    );

    const metrics: Metric[] = factPack.map((item, i) => ({
      id: i.toString(),
      name: item.claim,
      selected: false,
    }));

    // Synthesize a short narrative from DB claims only — no web search.
    const narrativeResult = await executeSkill<{ overarchingNarrative: string }>(
      "internal-narrative",
      withAliases({
        topic: topicToUse,
        claims: factPack.map((item) => item.claim),
      })
    );
    const overarchingNarrative = narrativeResult.output.overarchingNarrative;

    const response: FetchInternalDataResponse = {
      metrics,
      overarchingNarrative,
      count: dataPoints.length,
      factPack,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error fetching internal data:", error?.message || error);
    return NextResponse.json(
      { error: `Failed to fetch internal data: ${error?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
