import type { NarrativeOutput } from "@/types/researchPipeline";

type JsonBlock<T> = {
  head: string;
  json: string;
  parsed: T;
  tail: string;
};

export function extractJsonBlock<T = unknown>(raw: string): JsonBlock<T> | null {
  const tryParse = (jsonStr: string, head = "", tail = ""): JsonBlock<T> | null => {
    try {
      const parsed = JSON.parse(jsonStr) as T;
      return { head, json: jsonStr, parsed, tail };
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw.trim());
  if (direct) return direct;

  const fences = Array.from(raw.matchAll(/```json\s*\n([\s\S]*?)\n```/g));
  for (let i = fences.length - 1; i >= 0; i--) {
    const fence = fences[i];
    const parsed = tryParse(
      fence[1].trim(),
      raw.slice(0, fence.index!),
      raw.slice(fence.index! + fence[0].length)
    );
    if (parsed) return parsed;
  }

  return extractBalancedJson(raw, tryParse);
}

function extractBalancedJson<T>(
  raw: string,
  tryParse: (jsonStr: string, head?: string, tail?: string) => JsonBlock<T> | null
): JsonBlock<T> | null {
  const starts = [...raw.matchAll(/[{\[]/g)].map((match) => match.index ?? -1);

  for (const start of starts) {
    const opener = raw[start];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < raw.length; i++) {
      const char = raw[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
      } else if (char === opener) {
        depth += 1;
      } else if (char === closer) {
        depth -= 1;
        if (depth === 0) {
          const jsonStr = raw.slice(start, i + 1);
          const parsed = tryParse(jsonStr, raw.slice(0, start), raw.slice(i + 1));
          if (parsed) return parsed;
          break;
        }
      }
    }
  }

  return null;
}

export function parseJsonOutput<T = unknown>(skillName: string, raw: string): T {
  const extracted = extractJsonBlock<T>(raw);
  if (!extracted) {
    throw new Error(`${skillName}: output did not contain valid JSON. Raw output:\n${raw}`);
  }
  return extracted.parsed;
}

export function resolveNarrativeOutput(
  parsed: Record<string, unknown>,
  args: Record<string, unknown>
): NarrativeOutput {
  if (
    "supportingData" in parsed ||
    "findings" in parsed ||
    "claim" in parsed ||
    "sourceUrl" in parsed
  ) {
    throw new Error(
      "narrative: model emitted forbidden keys. The schema requires citations only."
    );
  }

  const citations = parsed.citations;
  if (!Array.isArray(citations) || citations.length === 0) {
    throw new Error("narrative: output missing `citations` array.");
  }

  const research = (args.research ?? args.RESEARCH) as
    | Array<{ findings?: Array<{ claim?: string; sourceUrl?: string }> }>
    | undefined;

  if (!Array.isArray(research)) {
    throw new Error("narrative: input args are missing a `research` array.");
  }

  const supportingData = citations.map((citation) => {
    const researchIndex =
      typeof citation === "object" && citation !== null ? (citation as any).researchIndex : undefined;
    const findingIndex =
      typeof citation === "object" && citation !== null ? (citation as any).findingIndex : undefined;
    const finding = research[researchIndex]?.findings?.[findingIndex];

    if (!finding?.claim) {
      throw new Error(
        `narrative: citation { researchIndex: ${researchIndex}, findingIndex: ${findingIndex} } did not resolve to a finding in the input research.`
      );
    }

    return {
      claim: finding.claim,
      sourceUrl: finding.sourceUrl ?? "",
    };
  });

  return {
    insight: String(parsed.insight ?? ""),
    angle: String(parsed.angle ?? ""),
    supportingData,
  };
}

function narrativeHaystack(args: Record<string, unknown>): string {
  const narrative = (args.narrative ?? args.NARRATIVE) as
    | { insight?: string; supportingData?: Array<{ claim?: string }> }
    | undefined;

  if (!narrative) return "";

  return [
    narrative.insight ?? "",
    ...(Array.isArray(narrative.supportingData)
      ? narrative.supportingData.map((item) => item.claim ?? "")
      : []),
  ]
    .join(" ")
    .toLowerCase();
}

function checkTweetNumbers(label: string, tweets: string[], haystack: string): string[] {
  const warnings: string[] = [];

  tweets.forEach((tweet, index) => {
    const numbers = String(tweet).match(/\d[\d,.%kmb+]*/gi) ?? [];
    for (const rawNumber of numbers) {
      const number = rawNumber.replace(/[.,]+$/, "");
      if (!number) continue;
      if (!haystack.includes(number.toLowerCase())) {
        warnings.push(
          `${label}[${index}] "${tweet}" contains "${number}" not found in grounded sources.`
        );
      }
    }
  });

  return warnings;
}

export function getGroundingWarnings(
  skillName: string,
  output: Record<string, unknown>,
  args: Record<string, unknown>
): string[] {
  if (skillName === "hook") {
    const hooks = Array.isArray(output.hooks)
      ? output.hooks.map((hook) => {
          if (typeof hook === "string") return hook;
          if (hook && typeof hook === "object") {
            return String((hook as { text?: unknown }).text ?? "");
          }
          return "";
        })
      : [];
    const haystack = narrativeHaystack(args);
    return haystack ? checkTweetNumbers("hook", hooks, haystack) : [];
  }

  if (skillName === "draft-tweet") {
    const drafts = Array.isArray(output.drafts) ? output.drafts.map(String) : [];
    const narrative = narrativeHaystack(args);
    const factsUsed = Array.isArray(output.facts_used)
      ? output.facts_used.map(String).join(" ").toLowerCase()
      : "";
    const haystack = `${narrative} ${factsUsed}`.trim();
    return haystack ? checkTweetNumbers("draft", drafts, haystack) : [];
  }

  if (skillName === "critic" || skillName === "critic-hookbullets") {
    const finalTweets = Array.isArray(output.finalTweets)
      ? output.finalTweets.map(String)
      : [];
    const haystack = narrativeHaystack(args);
    return haystack ? checkTweetNumbers("final", finalTweets, haystack) : [];
  }

  return [];
}
