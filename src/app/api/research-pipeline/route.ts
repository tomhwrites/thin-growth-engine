import { NextResponse } from "next/server";
import type { StageRequest } from "@/workflows/researchPipeline";
import { runResearchPipelineStage } from "@/workflows/researchPipeline";

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
    const result = await runResearchPipelineStage(body);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Pipeline] Error:", error?.message || error);
    return NextResponse.json(
      { error: `Pipeline failed: ${error?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
