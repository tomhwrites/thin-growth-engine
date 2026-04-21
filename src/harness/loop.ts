import Anthropic from "@anthropic-ai/sdk";
import { getToolDefinitions, runTool } from "./tools";
import { buildSkillSystemPrompt, loadSkillDefinition } from "./skillLoader";

export async function runSkill(
  skillName: string,
  args: Record<string, unknown>,
  opts: { verbose?: boolean } = {}
): Promise<string> {
  const skill = await loadSkillDefinition(skillName);
  const customTools = getToolDefinitions(skill.tools);
  const serverTools = skill.webSearch
    ? [{ type: "web_search_20250305", name: "web_search", max_uses: skill.maxWebSearches }]
    : [];
  const allTools = [...serverTools, ...customTools];

  const system = await buildSkillSystemPrompt(skillName);
  const userMessage = `Run skill: ${skill.name}\n\nArguments:\n${JSON.stringify(args, null, 2)}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

  for (let step = 0; step < skill.maxSteps; step++) {
    const maxAttempts = 4;
    let response: Awaited<ReturnType<typeof client.messages.create>> | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: skill.maxTokens,
          system,
          tools: allTools.length > 0 ? (allTools as any) : undefined,
          messages,
        });
        break;
      } catch (error: any) {
        const status = error?.status ?? error?.response?.status;
        const message = String(error?.message ?? "");
        const retryable =
          status === 429 ||
          status === 503 ||
          status === 529 ||
          /rate limit/i.test(message) ||
          /connection error/i.test(message);

        if (!retryable || attempt === maxAttempts) {
          throw error;
        }

        const retryAfterSeconds = Number(error?.headers?.get?.("retry-after"));
        const delayMs = Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds * 1000
          : 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);

        if (opts.verbose) {
          console.error(
            `[runSkill:${skillName}] retrying after ${delayMs}ms due to ${status ?? "error"}`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    if (!response) {
      throw new Error(`Skill ${skillName} failed without a response`);
    }

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
