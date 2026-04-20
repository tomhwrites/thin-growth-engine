// app/api/sync/pull/route.ts
// Pull Google Sheets → DB. Existing rows are updated in place and new rows
// added in Sheets can be inserted into the DB.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pullEditsFromSheet, parseBool, parseList } from "@/lib/googleSheets";

function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDateOrNull(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function pullDataPoints(): Promise<{
  created: number;
  updated: number;
  skipped: number;
}> {
  const rows = await pullEditsFromSheet("data_points");
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const id = parseIntOrNull(r.id);
    const claim = (r.claim ?? "").trim();
    const category = (r.category ?? "").trim();

    if (!claim || !category) {
      skipped++;
      continue;
    }

    const data = {
      claim,
      category,
      belief: r.belief ?? "",
      tags: parseList(r.tags),
      sourceUrl: r.sourceUrl ?? "",
      sourceType: r.sourceType || "agent",
      asOfDate: parseDateOrNull(r.asOfDate),
      confidence: parseIntOrNull(r.confidence) ?? 3,
      archived: parseBool(r.archived),
    };

    try {
      if (id) {
        const existing = await prisma.dataPoints.findUnique({ where: { id } });
        if (!existing) {
          skipped++;
          continue;
        }

        await prisma.dataPoints.update({
          where: { id },
          data,
        });

        updated++;
        continue;
      }

      await prisma.dataPoints.create({ data });
      created++;
    } catch {
      skipped++;
    }
  }
  return { created, updated, skipped };
}

async function pullExemplarTweets(): Promise<{
  created: number;
  updated: number;
  skipped: number;
}> {
  const rows = await pullEditsFromSheet("exemplar_tweets");
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const id = parseIntOrNull(r.id);
    const tweetText = (r.tweet_text ?? "").trim();
    const contentTopic = (r.content_topic ?? "").trim();
    const tweetStyle = (r.tweet_style ?? "").trim();

    if (!tweetText || !contentTopic || !tweetStyle) {
      skipped++;
      continue;
    }

    const data = {
      tweet_text: tweetText,
      content_topic: contentTopic,
      subtopic: r.subtopic ?? "",
      tweet_style: tweetStyle,
      hook_value: r.hook_value ?? "",
      isThread: parseBool(r.isThread),
      archived: parseBool(r.archived),
    };

    try {
      if (id) {
        const existing = await prisma.exemplarTweets.findUnique({ where: { id } });
        if (!existing) {
          skipped++;
          continue;
        }

        await prisma.exemplarTweets.update({
          where: { id },
          data,
        });

        updated++;
        continue;
      }

      await prisma.exemplarTweets.create({ data });
      created++;
    } catch {
      skipped++;
    }
  }
  return { created, updated, skipped };
}

export async function POST() {
  try {
    const [dp, ex] = await Promise.all([pullDataPoints(), pullExemplarTweets()]);
    return NextResponse.json({
      ok: true,
      data_points: dp,
      exemplar_tweets: ex,
    });
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
