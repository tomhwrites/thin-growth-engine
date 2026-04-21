import { prisma } from "@/lib/prisma";
import { getExemplarsForStyle, getHookExemplars } from "@/lib/exemplars";

export type ToolInput = Record<string, unknown>;

type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  run: (input: ToolInput) => Promise<string>;
};

const tools: Record<string, ToolDef> = {
  fetchExemplars: {
    name: "fetchExemplars",
    description:
      "Fetch exemplar tweets to guide drafting or hook-writing. Returns up to three buckets depending on which params are set: formExemplars (match style, for structural reference), archetypeExemplars (match archetype, for propositional content reference), and hookExemplars (match a specific hook type, for opening-line reference). Pass hookType when calling from the hook skill.",
    input_schema: {
      type: "object",
      properties: {
        style: {
          type: "string",
          description:
            "Form/structure: oneliner | multiparagraph | bigpara | stackedlines | hookbullets | causeeffect | parallelism | comparison. Optional — omit to skip formExemplars.",
        },
        topic: {
          type: "string",
          description: "Archetype to match archetype exemplars against (optional).",
        },
        hookType: {
          type: "string",
          description:
            "One of: Thesis statement | Curiosity Gap | Short | Long | Data. When set, returns hookExemplars filtered to that hook type.",
        },
      },
    },
    run: async (input) => {
      const style = input.style ? String(input.style) : undefined;
      const topic = input.topic ? String(input.topic) : undefined;
      const hookType = input.hookType ? String(input.hookType) : undefined;
      const out: Record<string, string> = {};
      if (style) {
        const exemplars = await getExemplarsForStyle(style, topic);
        out.formExemplars = exemplars.formExemplars;
        if (topic) out.archetypeExemplars = exemplars.archetypeExemplars;
      }
      if (hookType) out.hookExemplars = await getHookExemplars(hookType, topic);
      return JSON.stringify(out);
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
                description: "URL of the primary source (company blog, on-chain explorer, analyst report). REQUIRED — findings without a sourceUrl are rejected.",
              },
            },
            required: ["belief", "claim", "sourceUrl"],
          },
        },
      },
      required: ["topic", "findings"],
    },
    run: async (input) => {
      const topic = String(input.topic ?? "").toLowerCase().trim();
      const findings = Array.isArray(input.findings) ? input.findings : [];
      if (!topic || findings.length === 0) return JSON.stringify({ inserted: 0, rejected: 0 });
      let rejected = 0;
      const rows = findings
        .map((f: any) => {
          const claim = typeof f?.claim === "string" ? f.claim.trim() : "";
          const sourceUrl = typeof f?.sourceUrl === "string" ? f.sourceUrl.trim() : "";
          if (!claim || !sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
            rejected++;
            return null;
          }
          return {
            claim,
            category: topic,
            belief: String(f.belief ?? ""),
            sourceUrl,
            sourceType: "agent",
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length === 0) return JSON.stringify({ inserted: 0, rejected });
      const result = await prisma.dataPoints.createMany({ data: rows });
      return JSON.stringify({ inserted: result.count, rejected });
    },
  },

  queryDataPoints: {
    name: "queryDataPoints",
    description:
      "Search the DataPoints table for facts relevant to a topic. Returns a ranked list (immutable > verified > manual > agent, most recent first). IMMUTABLE rows are curated Immutable-specific facts and should be preferred for any Immutable-related claim.",
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

      const rank: Record<string, number> = { immutable: 0, verified: 1, manual: 2, agent: 3 };
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
