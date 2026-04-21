// Transitional compatibility surface.
//
// Prompt authority now lives in `skills/` and shared services/workflows.
// Keep this module tiny so older ad hoc imports do not reintroduce a second
// prompt system in TypeScript.

export type { HookDraft, HookOutput } from "@/types/researchPipeline";
export type { ExemplarSets } from "@/lib/exemplars";

export { getExemplarsForStyle } from "@/lib/exemplars";
export { buildSkillSystemPrompt } from "@/harness/skillLoader";
