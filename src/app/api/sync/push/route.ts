// app/api/sync/push/route.ts
// Push DB → Google Sheets. data_points always pushes. exemplar_tweets only
// pushes when explicitly requested so the sheet can remain the source of truth.

import { NextResponse } from "next/server";
import { runPushToSheet, shouldPushExemplars } from "@/lib/sheetSync";

export async function POST(request: Request) {
  try {
    const includeExemplars = shouldPushExemplars(request);
    return NextResponse.json(await runPushToSheet(includeExemplars));
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
