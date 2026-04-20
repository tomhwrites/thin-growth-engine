#!/usr/bin/env -S node --import tsx
import { config as loadEnv } from "dotenv";
loadEnv({ override: true });
import { runResearchPipelineChain } from "../src/workflows/researchPipeline";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-v" || arg === "--verbose") {
      verbose = true;
      continue;
    }

    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
      continue;
    }

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }

  return { args, verbose };
}

async function main() {
  const { args, verbose } = parseArgs(process.argv.slice(2));
  const topic = args.topic;

  if (!topic) {
    console.error("Usage: ge-chain --topic='Immutable Play user acquisition' [--style=catchphrase] [--contentTopic='Product'] [-v]");
    process.exit(1);
  }

  const result = await runResearchPipelineChain(
    {
      topic,
      tweetStyle: args.style ?? args.tweetStyle,
      contentTopic: args.contentTopic,
    },
    { verbose }
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
