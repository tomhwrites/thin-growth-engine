// app/api/sync/push/route.ts
// Push DB → Google Sheets. data_points always pushes. exemplar_tweets only
// pushes when explicitly requested so the sheet can remain the source of truth.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushTableToSheet } from "@/lib/googleSheets";

const DATA_POINTS_COLUMNS = [
  "id",
  "claim",
  "category",
  "belief",
  "tags",
  "sourceUrl",
  "sourceType",
  "asOfDate",
  "confidence",
  "archived",
  "createdAt",
  "updatedAt",
];

const EXEMPLARS_COLUMNS = [
  "id",
  "tweet_text",
  "archetype",
  "tweet_style",
  "hook_value",
  "archived",
  "createdAt",
  "updatedAt",
];

function shouldPushExemplars(request: Request): boolean {
  return new URL(request.url).searchParams.get("includeExemplars") === "true";
}

export async function POST(request: Request) {
  try {
    const includeExemplars = shouldPushExemplars(request);
    const allDataPoints = await prisma.dataPoints.findMany({ orderBy: { id: "asc" } });
    const dataPoints = allDataPoints.filter((r) => r.sourceType !== "immutable");
    const immutableFacts = allDataPoints.filter((r) => r.sourceType === "immutable");

    await pushTableToSheet("data_points", DATA_POINTS_COLUMNS, dataPoints);
    await pushTableToSheet("immutable_facts", DATA_POINTS_COLUMNS, immutableFacts);

    let exemplarsPushed = 0;
    if (includeExemplars) {
      const exemplars = await prisma.exemplarTweets.findMany({ orderBy: { id: "asc" } });
      await pushTableToSheet("exemplar_tweets", EXEMPLARS_COLUMNS, exemplars);
      exemplarsPushed = exemplars.length;
    }

    return NextResponse.json({
      ok: true,
      pushed: {
        data_points: dataPoints.length,
        immutable_facts: immutableFacts.length,
        exemplar_tweets: exemplarsPushed,
      },
      skipped: includeExemplars ? [] : ["exemplar_tweets"],
    });
  } catch (e: any) {
    console.error("[sync/push]", e);
    return NextResponse.json(
      { error: e?.message || "push failed" },
      { status: 500 }
    );
  }
}

// Also accept GET so Vercel cron can hit it.
export async function GET(request: Request) {
  return POST(request);
}
