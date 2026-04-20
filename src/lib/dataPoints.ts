// src/lib/dataPoints.ts
// Helpers for the DataPoints store: persist research findings, fetch relevant
// facts to inject into prompts, and format them for the model.

import { prisma } from "@/lib/prisma";
import type { ResearchResult } from "@/utils/agents";

/** Insert research findings as atomized data points (one row per finding). */
export async function persistResearchAsDataPoints(
  topic: string,
  research: { belief: string; findings: string[] }[]
): Promise<number> {
  const rows: {
    claim: string;
    category: string;
    belief: string;
    sourceType: string;
  }[] = [];

  for (const r of research) {
    for (const finding of r.findings) {
      const claim = finding.trim();
      if (!claim) continue;
      rows.push({
        claim,
        category: topic.toLowerCase().trim(),
        belief: r.belief,
        sourceType: "agent",
      });
    }
  }

  if (rows.length === 0) return 0;
  const result = await prisma.dataPoints.createMany({ data: rows });
  return result.count;
}

/**
 * Pull existing data points relevant to a topic. Cheap keyword match for now —
 * upgrade to pgvector later if recall gets bad. Manual/verified rows are
 * always preferred over agent rows.
 */
export async function getRelevantDataPoints(
  topic: string,
  limit = 20
): Promise<
  {
    claim: string;
    category: string;
    sourceType: string;
    asOfDate: Date | null;
    sourceUrl: string;
  }[]
> {
  const t = topic.toLowerCase().trim();
  // Tokenize topic into words and OR-match category for broader recall.
  const words = t.split(/\s+/).filter((w) => w.length > 3);

  const rows = await prisma.dataPoints.findMany({
    where: {
      archived: false,
      OR: [
        { category: { contains: t, mode: "insensitive" } },
        ...words.map((w) => ({
          category: { contains: w, mode: "insensitive" } as const,
        })),
        ...words.map((w) => ({
          claim: { contains: w, mode: "insensitive" } as const,
        })),
      ],
    },
    take: limit * 2,
    orderBy: { updatedAt: "desc" },
  });

  // Sort: verified > manual > agent, then most recent first.
  const rank: Record<string, number> = { verified: 0, manual: 1, agent: 2 };
  rows.sort((a, b) => {
    const ra = rank[a.sourceType] ?? 3;
    const rb = rank[b.sourceType] ?? 3;
    if (ra !== rb) return ra - rb;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return rows.slice(0, limit).map((r) => ({
    claim: r.claim,
    category: r.category,
    sourceType: r.sourceType,
    asOfDate: r.asOfDate,
    sourceUrl: r.sourceUrl,
  }));
}

/** Format relevant data points as a prompt block. Empty string if none. */
export function formatDataPointsForPrompt(
  rows: Awaited<ReturnType<typeof getRelevantDataPoints>>
): string {
  if (rows.length === 0) return "";
  const lines = rows.map((r) => {
    const trust = r.sourceType === "agent" ? "" : ` [${r.sourceType.toUpperCase()}]`;
    const date = r.asOfDate ? ` (as of ${r.asOfDate.toISOString().slice(0, 10)})` : "";
    const src = r.sourceUrl ? ` — ${r.sourceUrl}` : "";
    return `- ${r.claim}${date}${trust}${src}`;
  });
  return `Known facts already in our database (prefer these over re-researching, and prefer [VERIFIED]/[MANUAL] over agent-sourced):\n${lines.join("\n")}`;
}
