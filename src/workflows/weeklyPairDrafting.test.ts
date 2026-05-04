import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeSkill } from "@/harness/execute";
import { runWeeklyPairDraftStage } from "./weeklyPairDrafting";

vi.mock("@/harness/execute", () => ({
  executeSkill: vi.fn(),
}));

const mockedExecuteSkill = vi.mocked(executeSkill);

function makeLongDraft(length: number) {
  return "x".repeat(length);
}

describe("runWeeklyPairDraftStage", () => {
  beforeEach(() => {
    mockedExecuteSkill.mockReset();
  });

  it("recovers when a rewritten alternate draft is still over length", async () => {
    const validPrimary = "Onchain gaming is becoming an operating model, not a genre.";

    mockedExecuteSkill
      .mockResolvedValueOnce({
        raw: "{}",
        warnings: [],
        output: {
          primaryDraft: validPrimary,
          alternateDraft: makeLongDraft(284),
          factsUsed: [],
          rationale: "",
        },
      })
      .mockResolvedValueOnce({
        raw: "{}",
        warnings: [],
        output: {
          primaryDraft: validPrimary,
          alternateDraft: makeLongDraft(284),
          factsUsed: [],
          rationale: "Recovered from an over-length alternate.",
        },
      });

    const result = await runWeeklyPairDraftStage({
      topic: "Onchain gaming thesis",
      archetype: "New combined Web3 thesis",
      tweetStyle: "oneliner",
      goal: "Make the thesis concise",
      factPack: [],
    });

    expect(result.primaryDraft).toBe(validPrimary);
    expect(result.alternateDraft).toBe(validPrimary);
    expect(mockedExecuteSkill).toHaveBeenCalledTimes(2);
  });
});
