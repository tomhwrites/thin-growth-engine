import { describe, expect, it } from "vitest";
import { extractJsonBlock } from "./postprocess";

describe("extractJsonBlock", () => {
  it("parses raw JSON directly", () => {
    const extracted = extractJsonBlock<{ ok: boolean }>('{"ok":true}');

    expect(extracted?.parsed).toEqual({ ok: true });
  });

  it("uses the last valid json fence when prose comes first", () => {
    const raw = [
      "Scoring notes that should not be emitted.",
      "```",
      "not json",
      "```",
      "```json",
      '{"scores":[],"finalTweets":[]}',
      "```",
    ].join("\n");

    const extracted = extractJsonBlock<{ finalTweets: string[] }>(raw);

    expect(extracted?.parsed.finalTweets).toEqual([]);
    expect(extracted?.head).toContain("Scoring notes");
  });

  it("extracts a balanced JSON object surrounded by commentary", () => {
    const raw = [
      "Now I have the exemplars.",
      '{"rewrites":{"0":"hook\\n• one"},"finalTweets":["a"]}',
      "extra text",
    ].join("\n");

    const extracted = extractJsonBlock<{ rewrites: Record<string, string> }>(raw);

    expect(extracted?.parsed.rewrites["0"]).toBe("hook\n• one");
  });
});
