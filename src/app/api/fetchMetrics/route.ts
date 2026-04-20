// app/api/fetchMetrics/route.ts
import { NextResponse } from "next/server";
import { Metric } from "@/components/TweetGenerator";
import { runMetricResearchAgent } from "@/utils/agents";

// Define the expected request body type
interface FetchMetricsRequest {
  topic: string;
}

// Define the response type
interface FetchMetricsResponse {
  metrics: Metric[];
  overarchingNarrative?: string;
}

export async function POST(request: Request) {
  try {
    const { topic } = (await request.json()) as FetchMetricsRequest;
    const { metrics, overarchingNarrative } = await runMetricResearchAgent(topic);

    const formattedMetrics: Metric[] = metrics.map((metric, index) => ({
      id: index.toString(),
      name: metric,
      selected: false,
    }));

    const response: FetchMetricsResponse = {
      metrics: formattedMetrics,
      overarchingNarrative,
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
