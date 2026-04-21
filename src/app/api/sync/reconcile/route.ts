// app/api/sync/reconcile/route.ts
// Pull sheet edits into DB, then push DB state back to the sheet.
// This is the safe round-trip: any fresh sheet rows get merged into DB before
// the push overwrites the sheet, so sheet edits never get lost.
// Exemplars are NOT included — those stay pull-only (sheet is source of truth).

import { NextResponse } from "next/server";
import { runReconcileSheets, shouldPushExemplars } from "@/lib/sheetSync";

export async function POST(request: Request) {
  try {
    const includeExemplars = shouldPushExemplars(request);
    return NextResponse.json(await runReconcileSheets(includeExemplars));
  } catch (e: any) {
    console.error("[sync/reconcile]", e);
    return NextResponse.json(
      { error: e?.message || "reconcile failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
