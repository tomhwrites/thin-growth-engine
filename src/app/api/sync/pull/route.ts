// app/api/sync/pull/route.ts
// Pull Google Sheets → DB. Existing rows are updated in place and new rows
// added in Sheets can be inserted into the DB.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  pullEditsFromSheet,
  pullSheetRecords,
  writeSheetColumnValues,
  parseBool,
  parseList,
} from "@/lib/googleSheets";

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
  deleted: number;
  skipped: number;
  ids_backfilled: number;
}> {
  const { header, rows } = await pullSheetRecords("exemplar_tweets");
  const requiredColumns = ["id", "tweet_text", "tweet_style"];
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;
  let idsBackfilled = 0;

  for (const column of requiredColumns) {
    if (!header.includes(column)) {
      throw new Error(`Missing required exemplar_tweets column: ${column}`);
    }
  }
  if (!header.includes("archetype") && !header.includes("content_topic")) {
    throw new Error("Missing required exemplar_tweets column: archetype");
  }

  const keepIds = new Set<number>();
  const seenSheetIds = new Set<number>();
  const pendingIdWrites: { rowNumber: number; value: string }[] = [];

  for (const row of rows) {
    const r = row.values;
    const id = parseIntOrNull(r.id);
    const tweetText = (r.tweet_text ?? "").trim();
    const archetype = (r.archetype ?? r.content_topic ?? "").trim();
    const tweetStyle = (r.tweet_style ?? "").trim();

    if (!tweetText || !archetype || !tweetStyle) {
      skipped++;
      continue;
    }

    if (id && seenSheetIds.has(id)) {
      skipped++;
      continue;
    }

      const data = {
        tweet_text: tweetText,
        archetype,
        subtopic: r.subtopic ?? "",
        tweet_style: tweetStyle,
        hook_value: r.hook_value ?? "",
        archived: parseBool(r.archived),
      };

    try {
      if (id) {
        seenSheetIds.add(id);
        const existing = await prisma.exemplarTweets.findUnique({ where: { id } });
        if (existing) {
          await prisma.exemplarTweets.update({
            where: { id },
            data,
          });
          updated++;
        } else {
          await prisma.exemplarTweets.create({
            data: { id, ...data },
          });
          created++;
        }
        keepIds.add(id);
        continue;
      }

      const createdRow = await prisma.exemplarTweets.create({ data });
      created++;
      keepIds.add(createdRow.id);
      pendingIdWrites.push({
        rowNumber: row.rowNumber,
        value: String(createdRow.id),
      });
    } catch {
      skipped++;
    }
  }

  const deleteResult =
    keepIds.size > 0
      ? await prisma.exemplarTweets.deleteMany({
          where: { id: { notIn: Array.from(keepIds) } },
        })
      : await prisma.exemplarTweets.deleteMany();
  deleted = deleteResult.count;

  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"ExemplarTweets"', 'id'),
      GREATEST(COALESCE((SELECT MAX(id) FROM "ExemplarTweets"), 1), 1),
      true
    )
  `);

  if (pendingIdWrites.length > 0) {
    await writeSheetColumnValues("exemplar_tweets", header, "id", pendingIdWrites);
    idsBackfilled = pendingIdWrites.length;
  }

  return {
    created,
    updated,
    deleted,
    skipped,
    ids_backfilled: idsBackfilled,
  };
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
