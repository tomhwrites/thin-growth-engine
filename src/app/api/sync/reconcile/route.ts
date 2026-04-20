// app/api/sync/reconcile/route.ts
// Pull sheet edits into DB, then push DB state back to the sheet.
// This is the safe round-trip: any fresh sheet rows get merged into DB before
// the push overwrites the sheet, so sheet edits never get lost.
// Exemplars are NOT included — those stay pull-only (sheet is source of truth).

import { NextResponse } from "next/server";

async function internalPost(path: string, origin: string): Promise<Response> {
  return fetch(`${origin}${path}`, { method: "POST" });
}

export async function POST(request: Request) {
  try {
    const origin = new URL(request.url).origin;

    const pullRes = await internalPost("/api/sync/pull", origin);
    const pull = await pullRes.json();
    if (!pullRes.ok) {
      return NextResponse.json(
        { error: "pull failed", detail: pull },
        { status: 500 }
      );
    }

    const pushRes = await internalPost("/api/sync/push", origin);
    const push = await pushRes.json();
    if (!pushRes.ok) {
      return NextResponse.json(
        { error: "push failed", detail: push, pull },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, pull, push });
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
