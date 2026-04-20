#!/usr/bin/env -S node --import tsx
import { config as loadEnv } from "dotenv";
loadEnv({ override: true });
import { readFileSync } from "node:fs";
import { runSkill } from "../src/harness/loop";

function coerce(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function parseArgs(argv: string[]): { skill: string; args: Record<string, unknown>; verbose: boolean } {
  if (argv.length === 0) {
    console.error("Usage: ge <skill> [--arg=value | --arg-file=path] [-v]");
    console.error("Example: ge belief --topic='Immutable Play'");
    console.error("Example: ge evidence --topic='...' --beliefs-file=./tmp/beliefs.json");
    process.exit(1);
  }
  const skill = argv[0];
  const args: Record<string, unknown> = {};
  let verbose = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-v" || a === "--verbose") {
      verbose = true;
      continue;
    }
    const m = a.match(/^--([^=]+)=(.*)$/);
    let key: string | undefined;
    let rawValue: string | undefined;
    if (m) {
      key = m[1];
      rawValue = m[2];
    } else if (a.startsWith("--")) {
      key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        rawValue = next;
        i++;
      } else {
        rawValue = "true";
      }
    }
    if (!key) continue;
    if (key.endsWith("-file")) {
      const argKey = key.slice(0, -"-file".length);
      const fileContents = readFileSync(rawValue ?? "", "utf8");
      args[argKey] = coerce(fileContents);
    } else {
      args[key] = coerce(rawValue ?? "");
    }
  }
  return { skill, args, verbose };
}

function extractJson(raw: string): { head: string; parsed: any; json: string; tail: string } | null {
  const fence = raw.match(/```json\s*\n([\s\S]*?)\n```/);
  const jsonStr = fence ? fence[1] : raw.trim();
  try {
    const parsed = JSON.parse(jsonStr);
    const head = fence ? raw.slice(0, fence.index!) : "";
    const tail = fence ? raw.slice(fence.index! + fence[0].length) : "";
    return { head, parsed, json: jsonStr, tail };
  } catch {
    return null;
  }
}

function postProcessNarrative(raw: string, args: Record<string, unknown>): string {
  const extracted = extractJson(raw);
  if (!extracted) {
    throw new Error(
      "narrative: output did not contain a valid JSON block. Raw output:\n" + raw
    );
  }

  const { parsed } = extracted;
  if (parsed.supportingData || parsed.findings) {
    throw new Error(
      "narrative: model emitted forbidden `supportingData`/`findings` keys. The schema requires `citations` only — the model must reference research by index, not restate claims. Raw output:\n" +
        raw
    );
  }
  if (!Array.isArray(parsed.citations) || parsed.citations.length === 0) {
    throw new Error(
      "narrative: output missing `citations` array. Raw output:\n" + raw
    );
  }

  const research = (args.research ?? args.RESEARCH) as any[] | undefined;
  if (!Array.isArray(research)) {
    throw new Error("narrative: input args are missing a `research` array to resolve citations against.");
  }

  const supportingData: Array<{ claim: string; sourceUrl: string }> = [];
  for (const c of parsed.citations) {
    const r = research[c.researchIndex];
    const f = r?.findings?.[c.findingIndex];
    if (!f?.claim) {
      throw new Error(
        `narrative: citation { researchIndex: ${c.researchIndex}, findingIndex: ${c.findingIndex} } did not resolve to a finding in the input research.`
      );
    }
    supportingData.push({ claim: f.claim, sourceUrl: f.sourceUrl ?? "" });
  }

  const resolved = {
    insight: parsed.insight,
    angle: parsed.angle,
    supportingData,
  };
  const resolvedJson = "```json\n" + JSON.stringify(resolved, null, 2) + "\n```";
  return (extracted.head + resolvedJson + extracted.tail).trim();
}

function narrativeHaystack(args: Record<string, unknown>): string {
  const narrative = (args.narrative ?? args.NARRATIVE) as any;
  if (!narrative) return "";
  return [
    narrative.insight ?? "",
    ...(Array.isArray(narrative.supportingData)
      ? narrative.supportingData.map((s: any) => s.claim ?? "")
      : []),
  ]
    .join(" ")
    .toLowerCase();
}

function checkTweetNumbers(
  label: string,
  tweets: string[],
  haystack: string
): string[] {
  const warnings: string[] = [];
  tweets.forEach((tweet, i) => {
    const numbers = String(tweet).match(/\d[\d,.%kmb+]*/gi) ?? [];
    for (const rawN of numbers) {
      const n = rawN.replace(/[.,]+$/, "");
      if (!n) continue;
      if (!haystack.includes(n.toLowerCase())) {
        warnings.push(`${label}[${i}] "${tweet}" contains "${n}" not found in grounded sources.`);
      }
    }
  });
  return warnings;
}

function groundingCheckHooks(raw: string, args: Record<string, unknown>): string {
  const extracted = extractJson(raw);
  if (!extracted || !Array.isArray(extracted.parsed?.hooks)) return raw;
  const haystack = narrativeHaystack(args);
  if (!haystack) return raw;
  const warnings = checkTweetNumbers("hook", extracted.parsed.hooks, haystack);
  if (warnings.length > 0) {
    console.error("\n[grounding-warning]");
    for (const w of warnings) console.error("  " + w);
  }
  return raw;
}

function groundingCheckDrafts(raw: string, args: Record<string, unknown>): string {
  const extracted = extractJson(raw);
  if (!extracted || !Array.isArray(extracted.parsed?.drafts)) return raw;
  const narrHaystack = narrativeHaystack(args);
  const factsHaystack = Array.isArray(extracted.parsed.facts_used)
    ? extracted.parsed.facts_used.join(" ").toLowerCase()
    : "";
  const haystack = (narrHaystack + " " + factsHaystack).trim();
  if (!haystack) return raw;
  const warnings = checkTweetNumbers("draft", extracted.parsed.drafts, haystack);
  if (warnings.length > 0) {
    console.error("\n[grounding-warning]");
    for (const w of warnings) console.error("  " + w);
    console.error(
      "  (draft-tweet: numbers must appear verbatim in NARRATIVE or facts_used)"
    );
  }
  return raw;
}

function groundingCheckCritic(raw: string, args: Record<string, unknown>): string {
  const extracted = extractJson(raw);
  if (!extracted || !Array.isArray(extracted.parsed?.finalTweets)) return raw;
  const haystack = narrativeHaystack(args);
  if (!haystack) return raw;
  const warnings = checkTweetNumbers("final", extracted.parsed.finalTweets, haystack);
  if (warnings.length > 0) {
    console.error("\n[grounding-warning]");
    for (const w of warnings) console.error("  " + w);
    console.error("  (critic rewrites must stay within NARRATIVE facts)");
  }
  return raw;
}

async function main() {
  const { skill, args, verbose } = parseArgs(process.argv.slice(2));
  let output = await runSkill(skill, args, { verbose });
  if (skill === "narrative") output = postProcessNarrative(output, args);
  if (skill === "hook") groundingCheckHooks(output, args);
  if (skill === "draft-tweet") groundingCheckDrafts(output, args);
  if (skill === "critic") groundingCheckCritic(output, args);
  console.log(output);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
