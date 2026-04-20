import { NextResponse } from "next/server";
import {
  getExemplarsForStyle,
  runBeliefAgent,
  runEvidenceAgent,
  runHookAgent,
  runNarrativeAgent,
  runResearchAgent,
  runStandaloneTweetCriticRewrite,
  runTweetDrafter,
  type Belief,
  type EvidenceNeed,
  type HookOutput,
  type NarrativeOutput,
  type ResearchResult,
} from "@/utils/agents";
import { hookTypeOptions, tweetStyles, type HookType } from "@/utils/tweetConfig";

type BespokeAgentKey =
  | "belief"
  | "evidence"
  | "research"
  | "narrative"
  | "hook"
  | "draft"
  | "critic";

interface BespokeAgentRequest {
  agent: BespokeAgentKey;
  inputText?: string;
  topic?: string;
  tweetStyle?: string;
  archetype?: string;
  contentTopic?: string;
}

function cleanLine(value: string) {
  return value.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
}

function isEvidenceNeed(value: EvidenceNeed | null): value is EvidenceNeed {
  return Boolean(value?.belief) && Array.isArray(value?.dataPointsNeeded);
}

function isResearchResult(value: ResearchResult | null): value is ResearchResult {
  return Boolean(value?.belief) && Array.isArray(value?.findings);
}

function parseBeliefsInput(inputText: string): Belief[] {
  const blocks = inputText
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const beliefsFromBlocks = blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const beliefLine =
        lines.find((line) => !/^why it matters:/i.test(line)) || "";
      const whyLine = lines.find((line) => /^why it matters:/i.test(line)) || "";

      return {
        belief: cleanLine(beliefLine).replace(/^belief:\s*/i, "").trim(),
        whyItMatters: whyLine.replace(/^why it matters:\s*/i, "").trim(),
      };
    })
    .filter((item) => item.belief.length > 0);

  if (beliefsFromBlocks.length > 0) return beliefsFromBlocks;

  return inputText
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .map((belief) => ({ belief, whyItMatters: "" }));
}

function parseEvidenceNeedsInput(inputText: string, topic: string): EvidenceNeed[] {
  const blocks = inputText
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const structuredBlocks = blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) return null;

      const beliefLine =
        lines.find((line) => !/^data needed:/i.test(line) && !/^[-*•]/.test(line)) ||
        lines[0];
      const dataPointsNeeded = lines
        .filter((line) => line !== beliefLine)
        .map((line) => line.replace(/^[-*•]\s*/, ""))
        .map((line) => line.replace(/^evidence needed:\s*/i, ""))
        .map((line) => line.replace(/^data needed:\s*/i, ""))
        .map((line) => line.trim())
        .filter(Boolean);

      return {
        belief: cleanLine(beliefLine).replace(/^belief:\s*/i, "").trim(),
        dataPointsNeeded,
      };
    })
    .filter(isEvidenceNeed);

  if (structuredBlocks.some((item) => item.dataPointsNeeded.length > 0)) {
    return structuredBlocks;
  }

  const flatDataPoints = inputText
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);

  return flatDataPoints.length > 0
    ? [{ belief: topic, dataPointsNeeded: flatDataPoints }]
    : [];
}

function parseResearchInput(inputText: string, topic: string): ResearchResult[] {
  const blocks = inputText
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const structuredBlocks = blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) return null;

      const beliefLine =
        lines.find((line) => !/^finding:/i.test(line) && !/^[-*•]/.test(line)) ||
        lines[0];
      const findings = lines
        .filter((line) => line !== beliefLine)
        .map((line) => line.replace(/^[-*•]\s*/, ""))
        .map((line) => line.replace(/^finding:\s*/i, ""))
        .map((line) => line.trim())
        .filter(Boolean);

      return {
        belief: cleanLine(beliefLine).replace(/^belief:\s*/i, "").trim(),
        findings,
      };
    })
    .filter(isResearchResult);

  if (structuredBlocks.some((item) => item.findings.length > 0)) {
    return structuredBlocks;
  }

  const flatFindings = inputText
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);

  return flatFindings.length > 0 ? [{ belief: topic, findings: flatFindings }] : [];
}

function parseNarrativeInput(inputText: string): NarrativeOutput {
  const insightMatch = inputText.match(/Insight:\s*([\s\S]*?)(?:\nAngle:|\nData:|$)/i);
  const angleMatch = inputText.match(/Angle:\s*([^\n]+)/i);
  const dataSection = inputText.split(/Data:\s*/i)[1] || "";
  const supportingData = dataSection
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);

  const fallbackLines = inputText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    insight: insightMatch?.[1]?.trim() || fallbackLines[0] || "",
    angle: angleMatch?.[1]?.trim() || "",
    supportingData,
  };
}

function parseDraftInput(inputText: string): {
  narrative: NarrativeOutput;
  hooks: HookOutput;
} {
  const narrative = parseNarrativeInput(inputText);
  const hooksSection = inputText.split(/Hooks:\s*/i)[1] || "";
  const hooks = hooksSection
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .map((line) => {
      const typedMatch = line.match(
        /^\s*(?:\[(.+?)\]|([^:]+)):\s*(.+)\s*$/i
      );

      if (typedMatch) {
        const typeCandidate = (typedMatch[1] || typedMatch[2] || "").trim();
        const text = typedMatch[3].trim();
        const matchedType = hookTypeOptions.find(
          (option) => option.value.toLowerCase() === typeCandidate.toLowerCase()
        )?.value;

        return {
          type: (matchedType || "Thesis statement") as HookType,
          text,
        };
      }

      return {
        type: "Thesis statement" as HookType,
        text: line,
      };
    });

  return {
    narrative,
    hooks: { hooks },
  };
}

function formatBeliefs(beliefs: Belief[]) {
  return beliefs
    .map(
      (belief, index) =>
        `${index + 1}. ${belief.belief}\nWhy it matters: ${belief.whyItMatters || "(none)"}`
    )
    .join("\n\n");
}

function formatEvidenceNeeds(evidenceNeeds: EvidenceNeed[]) {
  return evidenceNeeds
    .map(
      (need, index) =>
        `Belief ${index + 1}: ${need.belief}\n${need.dataPointsNeeded
          .map((item) => `- ${item}`)
          .join("\n")}`
    )
    .join("\n\n");
}

function formatResearchResults(research: ResearchResult[]) {
  return research
    .map(
      (result, index) =>
        `Belief ${index + 1}: ${result.belief}\n${result.findings
          .map((finding) => `- ${finding}`)
          .join("\n")}`
    )
    .join("\n\n");
}

function formatNarrative(narrative: NarrativeOutput) {
  return [
    `Insight: ${narrative.insight}`,
    `Angle: ${narrative.angle || "(none)"}`,
    "Data:",
    ...(narrative.supportingData.length > 0
      ? narrative.supportingData.map((item) => `- ${item}`)
      : ["- (none)"]),
  ].join("\n");
}

function formatHooks(hooks: HookOutput) {
  return hooks.hooks
    .map((hook, index) => `${index + 1}. [${hook.type}] ${hook.text}`)
    .join("\n");
}

function formatTweets(tweets: string[]) {
  return tweets.map((tweet, index) => `${index + 1}. ${tweet}`).join("\n\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BespokeAgentRequest;
    const agent = body.agent;
    const inputText = String(body.inputText ?? "").trim();
    const topic = String(body.topic ?? "").trim() || "Web3 gaming";
    const tweetStyle = body.tweetStyle || "catchphrase";
    const archetype = body.archetype || body.contentTopic || undefined;
    const selectedStyle =
      tweetStyles[tweetStyle as keyof typeof tweetStyles] || tweetStyles.catchphrase;

    if (!agent) {
      return NextResponse.json({ error: "Agent is required" }, { status: 400 });
    }

    switch (agent) {
      case "belief": {
        const beliefs = await runBeliefAgent(inputText || topic);
        return NextResponse.json({ outputText: formatBeliefs(beliefs) });
      }

      case "evidence": {
        const beliefs = parseBeliefsInput(inputText);
        if (beliefs.length === 0) {
          return NextResponse.json(
            { error: "Add at least one belief for the evidence agent." },
            { status: 400 }
          );
        }

        const evidenceNeeds = await runEvidenceAgent(topic, beliefs);
        return NextResponse.json({ outputText: formatEvidenceNeeds(evidenceNeeds) });
      }

      case "research": {
        const evidenceNeeds = parseEvidenceNeedsInput(inputText, topic);
        if (evidenceNeeds.length === 0) {
          return NextResponse.json(
            { error: "Add at least one evidence request for the research agent." },
            { status: 400 }
          );
        }

        const research = await runResearchAgent(topic, evidenceNeeds);
        return NextResponse.json({ outputText: formatResearchResults(research) });
      }

      case "narrative": {
        const research = parseResearchInput(inputText, topic);
        if (research.length === 0) {
          return NextResponse.json(
            { error: "Add research findings for the narrative agent." },
            { status: 400 }
          );
        }

        const narrative = await runNarrativeAgent(topic, research);
        return NextResponse.json({ outputText: formatNarrative(narrative) });
      }

      case "hook": {
        const narrative = parseNarrativeInput(inputText);
        if (!narrative.insight) {
          return NextResponse.json(
            { error: "Add an insight or narrative text for the hook agent." },
            { status: 400 }
          );
        }

        const hooks = await runHookAgent(topic, narrative);
        return NextResponse.json({ outputText: formatHooks(hooks) });
      }

      case "draft": {
        const { narrative, hooks } = parseDraftInput(inputText);
        if (!narrative.insight) {
          return NextResponse.json(
            { error: "Add narrative input for the draft agent." },
            { status: 400 }
          );
        }

        const exemplars = await getExemplarsForStyle(tweetStyle, archetype);
        const tweets = await runTweetDrafter(
          topic,
          narrative,
          hooks,
          selectedStyle.name,
          selectedStyle.description,
          exemplars,
          archetype,
          { skipCritic: true }
        );

        return NextResponse.json({ outputText: formatTweets(tweets) });
      }

      case "critic": {
        if (!inputText) {
          return NextResponse.json(
            { error: "Paste the tweet you want the critic to rewrite." },
            { status: 400 }
          );
        }

        const exemplars = await getExemplarsForStyle(tweetStyle, archetype);
        const critique = await runStandaloneTweetCriticRewrite(
          inputText,
          topic,
          selectedStyle.name,
          selectedStyle.description,
          exemplars,
          archetype
        );

        const outputText = [
          critique.rationale ? `Rationale: ${critique.rationale}` : "",
          "Rewrite:",
          critique.rewrittenTweet,
        ]
          .filter(Boolean)
          .join("\n\n");

        return NextResponse.json({ outputText });
      }

      default:
        return NextResponse.json(
          { error: `Unknown bespoke agent: ${agent}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("[Bespoke Agent] Error:", error?.message || error);
    return NextResponse.json(
      { error: `Bespoke agent failed: ${error?.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
