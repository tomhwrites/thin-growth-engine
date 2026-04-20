import { prisma } from "@/lib/prisma";

export type ToolInput = Record<string, unknown>;

type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  run: (input: ToolInput) => Promise<string>;
};

const dbStyleMapping: Record<string, string> = {
  multiparagraph: "Multiple paras",
  hookbullets: "Hook + list",
  causeeffect: "Cause + effect 2 liner",
  oneliner: "One liner",
  parallelism: "Parallelism",
  comparison: "Comparison",
  catchphrase: "One liner",
};

const tools: Record<string, ToolDef> = {
  fetchExemplars: {
    name: "fetchExemplars",
    description:
      "Fetch exemplar tweets to guide drafting. Returns two buckets: formExemplars (match style, for structural reference) and archetypeExemplars (match archetype, for propositional content reference).",
    input_schema: {
      type: "object",
      properties: {
        style: {
          type: "string",
          description:
            "Form/structure: oneliner | multiparagraph | hookbullets | causeeffect | parallelism | comparison",
        },
        topic: {
          type: "string",
          description: "Archetype to match archetype exemplars against (optional).",
        },
      },
      required: ["style"],
    },
    run: async (input) => {
      const style = String(input.style ?? "oneliner");
      const topic = input.topic ? String(input.topic) : undefined;
      const dbStyle = dbStyleMapping[style] ?? dbStyleMapping.oneliner;

      const format = (rows: { tweet_text: string; archetype: string; hook_value: string }[]) =>
        rows
          .map(
            (t, i) =>
              `Example ${i + 1} (Archetype: ${t.archetype}; Hook type: ${t.hook_value || "Unspecified"}):\n"${t.tweet_text}"`
          )
          .join("\n\n");

      const formTweets = await prisma.exemplarTweets.findMany({
        select: { tweet_text: true, archetype: true, hook_value: true },
        where: { tweet_style: dbStyle, archived: false },
        take: 5,
      });

      const archetypeTweets = topic
        ? await prisma.exemplarTweets.findMany({
            select: { tweet_text: true, archetype: true, hook_value: true },
            where: { archetype: topic, archived: false },
            take: 5,
          })
        : [];

      return JSON.stringify({
        formExemplars: format(formTweets),
        archetypeExemplars: format(archetypeTweets),
      });
    },
  },

  persistDataPoints: {
    name: "persistDataPoints",
    description:
      "Save new research findings to the DataPoints table so future pipeline runs can reuse them without re-researching. Call once after you have all new findings (do NOT re-persist findings that already came back from queryDataPoints).",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The topic/category this research is about. Will be stored as DataPoint.category in lowercase.",
        },
        findings: {
          type: "array",
          description: "One item per new finding. Include belief, specific claim, and sourceUrl.",
          items: {
            type: "object",
            properties: {
              belief: {
                type: "string",
                description: "Which belief this finding supports (restate the belief text).",
              },
              claim: {
                type: "string",
                description: "The specific factual claim — include numbers, dates, names.",
              },
              sourceUrl: {
                type: "string",
                description: "URL of the primary source (company blog, on-chain explorer, analyst report).",
              },
            },
            required: ["belief", "claim"],
          },
        },
      },
      required: ["topic", "findings"],
    },
    run: async (input) => {
      const topic = String(input.topic ?? "").toLowerCase().trim();
      const findings = Array.isArray(input.findings) ? input.findings : [];
      if (!topic || findings.length === 0) return JSON.stringify({ inserted: 0 });
      const rows = findings
        .filter((f: any) => typeof f?.claim === "string" && f.claim.trim())
        .map((f: any) => ({
          claim: String(f.claim).trim(),
          category: topic,
          belief: String(f.belief ?? ""),
          sourceUrl: String(f.sourceUrl ?? ""),
          sourceType: "agent",
        }));
      if (rows.length === 0) return JSON.stringify({ inserted: 0 });
      const result = await prisma.dataPoints.createMany({ data: rows });
      return JSON.stringify({ inserted: result.count });
    },
  },

  queryDataPoints: {
    name: "queryDataPoints",
    description:
      "Search the DataPoints table for facts relevant to a topic. Returns a ranked list (verified > manual > agent, most recent first). Use these as grounding for tweets — prefer VERIFIED/MANUAL over agent.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The topic to search facts for (free-text; matched against category and claim).",
        },
        limit: {
          type: "number",
          description: "Max rows to return (default 10).",
        },
      },
      required: ["topic"],
    },
    run: async (input) => {
      const topic = String(input.topic ?? "").toLowerCase().trim();
      const limit = typeof input.limit === "number" ? input.limit : 10;
      if (!topic) return JSON.stringify({ rows: [] });

      const words = topic.split(/\s+/).filter((w) => w.length > 3);
      const rows = await prisma.dataPoints.findMany({
        where: {
          archived: false,
          OR: [
            { category: { contains: topic, mode: "insensitive" } },
            ...words.map((w) => ({ category: { contains: w, mode: "insensitive" as const } })),
            ...words.map((w) => ({ claim: { contains: w, mode: "insensitive" as const } })),
          ],
        },
        take: limit * 2,
        orderBy: { updatedAt: "desc" },
      });

      const rank: Record<string, number> = { verified: 0, manual: 1, agent: 2 };
      rows.sort((a, b) => {
        const ra = rank[a.sourceType] ?? 3;
        const rb = rank[b.sourceType] ?? 3;
        if (ra !== rb) return ra - rb;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });

      return JSON.stringify({
        rows: rows.slice(0, limit).map((r) => ({
          claim: r.claim,
          category: r.category,
          sourceType: r.sourceType.toUpperCase(),
          asOfDate: r.asOfDate?.toISOString().slice(0, 10) ?? null,
          sourceUrl: r.sourceUrl || null,
        })),
      });
    },
  },
};

export function getToolDefinitions(names: string[]) {
  return names
    .map((n) => tools[n])
    .filter(Boolean)
    .map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
}

export async function runTool(name: string, input: ToolInput): Promise<string> {
  const tool = tools[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.run(input);
}
