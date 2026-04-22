// app/api/fetchMetrics/route.ts
import { NextResponse } from "next/server";
import { Metric } from "@/components/TweetGenerator";
import { executeSkill } from "@/harness/execute";
import { buildFactPack, makeFactCandidates } from "@/lib/factPack";
import { withAliases } from "@/lib/skillArgs";
import type { FactPackItem } from "@/types/factPack";

// Define the expected request body type
interface FetchMetricsRequest {
  topic: string;
}

// Define the response type
interface FetchMetricsResponse {
  metrics: Metric[];
  overarchingNarrative?: string;
  factPack: FactPackItem[];
}

export async function POST(request: Request) {
  try {
    const { topic } = (await request.json()) as FetchMetricsRequest;
    const result = await executeSkill<{
      metrics: string[];
      overarchingNarrative: string;
    }>("metrics", withAliases({ topic }));
    const { metrics, overarchingNarrative } = result.output;

    const factPack = buildFactPack(
      makeFactCandidates(
        metrics.map((claim) => ({
          claim,
          sourceType: "metric",
          priority: 1,
        }))
      )
    );

    const formattedMetrics: Metric[] = factPack.map((metric, index) => ({
      id: index.toString(),
      name: metric.claim,
      selected: false,
    }));

    const response: FetchMetricsResponse = {
      metrics: formattedMetrics,
      overarchingNarrative,
      factPack,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error fetching metrics:", error?.message || error);
    return NextResponse.json(
      { error: `Failed to fetch metrics: ${error?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
