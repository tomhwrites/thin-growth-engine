#!/usr/bin/env -S node --import tsx
import { config as loadEnv } from "dotenv";
loadEnv({ override: true });
import { readFileSync } from "node:fs";
import { executeSkill } from "../src/harness/execute";

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

async function main() {
  const { skill, args, verbose } = parseArgs(process.argv.slice(2));
  const result = await executeSkill(skill, args, { verbose });

  if (result.warnings.length > 0) {
    console.error("\n[grounding-warning]");
    for (const warning of result.warnings) {
      console.error("  " + warning);
    }
  }

  console.log(JSON.stringify(result.output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
