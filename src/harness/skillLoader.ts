import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadContext, loadLearned } from "./resolver";

const skillsRoot = join(process.cwd(), "skills");

export type SkillDefinition = {
  name: string;
  description: string;
  tools: string[];
  context: string[];
  webSearch: boolean;
  maxWebSearches: number;
  maxTokens: number;
  maxSteps: number;
  body: string;
};

function parseList(value: string): string[] {
  const match = value.match(/\[(.*)\]/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function loadSkillDefinition(name: string): Promise<SkillDefinition> {
  const path = join(skillsRoot, `${name}.md`);
  const raw = await readFile(path, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`Skill ${name} is missing frontmatter`);
  const frontmatter = m[1];
  const body = m[2];

  const get = (key: string) => {
    const line = frontmatter.split("\n").find((l) => l.startsWith(`${key}:`));
    return line ? line.slice(key.length + 1).trim() : "";
  };

  const parseInt10 = (s: string, fallback: number) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    name: get("name") || name,
    description: get("description"),
    tools: parseList(get("tools")),
    context: parseList(get("context")),
    webSearch: get("web_search").toLowerCase() === "true",
    maxWebSearches: parseInt10(get("max_web_searches"), 5),
    maxTokens: parseInt10(get("max_tokens"), 2000),
    maxSteps: parseInt10(get("max_steps"), 10),
    body,
  };
}

export async function buildSkillSystemPrompt(skillName: string): Promise<string> {
  const skill = await loadSkillDefinition(skillName);
  const context = await loadContext(skill.context);
  const learned = await loadLearned(skill.name);
  return [context, skill.body, learned].filter(Boolean).join("\n\n");
}
