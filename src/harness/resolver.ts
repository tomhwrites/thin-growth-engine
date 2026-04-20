import { readFile } from "node:fs/promises";
import { join } from "node:path";

const skillsRoot = join(process.cwd(), "skills");

export async function loadContext(paths: string[]): Promise<string> {
  if (paths.length === 0) return "";
  const parts: string[] = [];
  for (const p of paths) {
    const abs = join(skillsRoot, p);
    const text = await readFile(abs, "utf8");
    parts.push(`# Context: ${p}\n\n${text}`);
  }
  return parts.join("\n\n---\n\n");
}

export async function loadLearned(skillName: string): Promise<string> {
  const path = join(skillsRoot, "learned", `${skillName}.learned.md`);
  try {
    const text = await readFile(path, "utf8");
    return `\n\n---\n\n# Learned rules (auto-appended, review before promoting)\n\n${text}`;
  } catch {
    return "";
  }
}
