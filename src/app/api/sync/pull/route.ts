// app/api/sync/pull/route.ts
// Pull Google Sheets → DB. Existing rows are updated in place and new rows
// added in Sheets can be inserted into the DB.

import { NextResponse } from "next/server";
import { runPullFromSheet } from "@/lib/sheetSync";

export async function POST() {
  try {
    return NextResponse.json(await runPullFromSheet());
  } catch (e: any) {
    console.error("[sync/pull]", e);
    return NextResponse.json(
      { error: e?.message || "pull failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
