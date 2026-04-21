import type { ExemplarSets } from "@/lib/exemplars";

export function buildDirectDraftUserPrompt(input: {
  topic: string;
  narrative: string;
  metrics: string[];
  styleName: string;
  styleDescription: string;
  archetype?: string;
  exemplars: ExemplarSets;
  liveResearch?: string;
}) {
  const sections: string[] = [
    `Topic: ${input.topic}`,
    `Narrative: ${input.narrative}`,
    `Style: ${input.styleName}`,
    `Style description: ${input.styleDescription}`,
  ];

  if (input.archetype) {
    sections.push(`Archetype: ${input.archetype}`);
  }

  if (input.metrics.length > 0) {
    sections.push(
      `Metrics:\n${input.metrics.map((metric) => `- ${metric}`).join("\n")}`
    );
  }

  if (input.exemplars.formExemplars) {
    sections.push(
      `Form exemplars:\n${input.exemplars.formExemplars}`
    );
  }

  if (input.exemplars.archetypeExemplars) {
    sections.push(
      `Archetype exemplars:\n${input.exemplars.archetypeExemplars}`
    );
  }

  if (input.liveResearch?.trim()) {
    sections.push(`Live research:\n${input.liveResearch.trim()}`);
  }

  sections.push("Return only the 6 tweets separated by ||.");

  return sections.join("\n\n");
}
