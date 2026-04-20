// app/api/sync/push/route.ts
// Push DB → Google Sheets. Overwrites the data_points and exemplar_tweets tabs
// with current DB state. Safe to call repeatedly; idempotent.

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
  "content_topic",
  "subtopic",
  "tweet_style",
  "hook_value",
  "isThread",
  "archived",
  "createdAt",
  "updatedAt",
];

export async function POST() {
  try {
    const [dataPoints, exemplars] = await Promise.all([
      prisma.dataPoints.findMany({ orderBy: { id: "asc" } }),
      prisma.exemplarTweets.findMany({ orderBy: { id: "asc" } }),
    ]);

    await pushTableToSheet("data_points", DATA_POINTS_COLUMNS, dataPoints);
    await pushTableToSheet("exemplar_tweets", EXEMPLARS_COLUMNS, exemplars);

    return NextResponse.json({
      ok: true,
      pushed: {
        data_points: dataPoints.length,
        exemplar_tweets: exemplars.length,
      },
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
export async function GET() {
  return POST();
}
