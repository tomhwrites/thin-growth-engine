import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getToolDefinitions, runTool } from "./tools";
import { loadContext, loadLearned } from "./resolver";

const skillsRoot = join(process.cwd(), "skills");

type Skill = {
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

async function loadSkill(name: string): Promise<Skill> {
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

export async function runSkill(
  skillName: string,
  args: Record<string, unknown>,
  opts: { verbose?: boolean } = {}
): Promise<string> {
  const skill = await loadSkill(skillName);
  const context = await loadContext(skill.context);
  const learned = await loadLearned(skill.name);
  const customTools = getToolDefinitions(skill.tools);
  const serverTools = skill.webSearch
    ? [{ type: "web_search_20250305", name: "web_search", max_uses: skill.maxWebSearches }]
    : [];
  const allTools = [...serverTools, ...customTools];

  const system = [context, skill.body, learned].filter(Boolean).join("\n\n");
  const userMessage = `Run skill: ${skill.name}\n\nArguments:\n${JSON.stringify(args, null, 2)}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

  for (let step = 0; step < skill.maxSteps; step++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: skill.maxTokens,
      system,
      tools: allTools.length > 0 ? (allTools as any) : undefined,
      messages,
    });

    if (opts.verbose) {
      console.error(`[step ${step}] stop_reason=${response.stop_reason}`);
    }

    const toolUses = response.content.filter((c) => c.type === "tool_use") as Array<{
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }>;

    if (toolUses.length === 0 || response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((c) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n")
        .trim();
      return text;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      if (opts.verbose) console.error(`  → ${use.name}(${JSON.stringify(use.input)})`);
      try {
        const result = await runTool(use.name, use.input);
        toolResults.push({ type: "tool_result", tool_use_id: use.id, content: result });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: `ERROR: ${(err as Error).message}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Skill exceeded ${skill.maxSteps} tool-use steps`);
}
