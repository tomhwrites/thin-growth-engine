// src/lib/dataPoints.ts
// Helpers for the DataPoints store: persist research findings, fetch relevant
// facts to inject into prompts, and format them for the model.

import { prisma } from "@/lib/prisma";

type RelevantDataPoint = {
  claim: string;
  category: string;
  sourceType: string;
  asOfDate: Date | null;
  sourceUrl: string;
};

type GetRelevantDataPointsOptions = {
  includeImmutableFallback?: boolean;
};

const IMMUTABLE_TOPIC_ALIASES: Record<string, string[]> = {
  immutable: ["immutable"],
  "immutable play": ["immutable play", "perpetual rewards"],
  passport: ["passport", "immutable passport", "identity"],
  audience: ["audience", "immutable audience", "unified player identity", "upi"],
  chain: ["immutable chain", "immutable zkevm", "zkevm"],
};

function normalizeTopic(value: string) {
  return value.toLowerCase().trim();
}

function isImmutableRelatedTopic(topic: string) {
  const normalized = normalizeTopic(topic);
  return Object.keys(IMMUTABLE_TOPIC_ALIASES).some((key) =>
    normalized.includes(key)
  );
}

function expandTopicTerms(topic: string) {
  const normalized = normalizeTopic(topic);
  const terms = new Set<string>();

  if (normalized) {
    terms.add(normalized);
  }

  for (const [key, aliases] of Object.entries(IMMUTABLE_TOPIC_ALIASES)) {
    if (
      normalized.includes(key) ||
      aliases.some((alias) => normalized.includes(alias))
    ) {
      terms.add(key);
      aliases.forEach((alias) => terms.add(alias));
    }
  }

  for (const phrase of Array.from(terms)) {
    phrase
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 3)
      .forEach((word) => terms.add(word));
  }

  return Array.from(terms);
}

function rankDataPoints(
  rows: Array<{
    sourceType: string;
    updatedAt: Date;
  }>
) {
  const rank: Record<string, number> = {
    immutable: 0,
    verified: 1,
    manual: 2,
    agent: 3,
  };

  rows.sort((a, b) => {
    const ra = rank[a.sourceType] ?? 4;
    const rb = rank[b.sourceType] ?? 4;
    if (ra !== rb) return ra - rb;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}

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
  limit = 20,
  options: GetRelevantDataPointsOptions = {}
): Promise<RelevantDataPoint[]> {
  const t = normalizeTopic(topic);
  const searchTerms = expandTopicTerms(t);
  const claimWords = searchTerms.filter((term) => term.length > 3);

  const matchedRows = await prisma.dataPoints.findMany({
    where: {
      archived: false,
      OR: [
        ...searchTerms.map((term) => ({
          category: { contains: term, mode: "insensitive" } as const,
        })),
        ...claimWords.map((term) => ({
          claim: { contains: term, mode: "insensitive" } as const,
        })),
      ],
    },
    take: limit * 3,
    orderBy: { updatedAt: "desc" },
  });

  const rowsById = new Map(matchedRows.map((row) => [row.id, row]));

  if (options.includeImmutableFallback && isImmutableRelatedTopic(t)) {
    const immutableRows = await prisma.dataPoints.findMany({
      where: {
        archived: false,
        sourceType: "immutable",
      },
      take: Math.max(limit, 12),
      orderBy: { updatedAt: "desc" },
    });

    for (const row of immutableRows) {
      if (!rowsById.has(row.id)) {
        rowsById.set(row.id, row);
      }
    }
  }

  const rows = Array.from(rowsById.values());
  rankDataPoints(rows);

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
