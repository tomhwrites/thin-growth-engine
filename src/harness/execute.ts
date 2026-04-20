import { runSkill } from "./loop";
import { getGroundingWarnings, parseJsonOutput, resolveNarrativeOutput } from "./postprocess";

export type ExecuteSkillResult<T> = {
  raw: string;
  output: T;
  warnings: string[];
};

export async function executeSkill<T = Record<string, unknown>>(
  skillName: string,
  args: Record<string, unknown>,
  opts: { verbose?: boolean } = {}
): Promise<ExecuteSkillResult<T>> {
  const raw = await runSkill(skillName, args, opts);
  const parsed = parseJsonOutput<Record<string, unknown>>(skillName, raw);
  const output =
    skillName === "narrative" ? resolveNarrativeOutput(parsed, args) : (parsed as T);
  const warnings = getGroundingWarnings(
    skillName,
    output as Record<string, unknown>,
    args
  );

  return { raw, output: output as T, warnings };
}
