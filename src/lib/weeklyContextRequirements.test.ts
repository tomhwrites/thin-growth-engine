import { describe, expect, it } from "vitest";
import {
  getFreshContextRequirement,
  hasFreshWeeklyContext,
  requiresFreshWeeklyContext,
} from "./weeklyContextRequirements";
import type { WeeklyPlanSlot } from "@/types/weeklyPlanning";

function makeSlot(overrides: Partial<WeeklyPlanSlot>): WeeklyPlanSlot {
  return {
    id: "slot-1",
    slotNumber: 1,
    day: "Monday",
    scheduleLabel: "Product Launch / Update",
    archetype: "Product Launch / Update",
    goal: "",
    topic: "",
    evidence: "",
    additionalContext: "",
    draftMode: "quality",
    tweetStyle: "comparison",
    status: "planned",
    ...overrides,
  };
}

describe("weekly fresh context requirements", () => {
  it("requires fresh context for new-information archetypes", () => {
    const slot = makeSlot({});

    expect(requiresFreshWeeklyContext(slot)).toBe(true);
    expect(hasFreshWeeklyContext(slot)).toBe(false);
    expect(getFreshContextRequirement(slot)).toBe(
      "Needs fresh weekly context before drafting"
    );
  });

  it("accepts a specific topic or evidence note as fresh context", () => {
    expect(
      hasFreshWeeklyContext(
        makeSlot({ topic: "New payments dashboard launching Tuesday" })
      )
    ).toBe(true);

    expect(
      hasFreshWeeklyContext(
        makeSlot({ evidence: "Partner game has 36M MAU and launches tomorrow" })
      )
    ).toBe(true);
  });

  it("does not require fresh context for evergreen archetypes", () => {
    const slot = makeSlot({
      scheduleLabel: "Payments",
      archetype: "Payments",
    });

    expect(requiresFreshWeeklyContext(slot)).toBe(false);
    expect(hasFreshWeeklyContext(slot)).toBe(true);
  });

  it("requires macro context unless the slot uses a research mode", () => {
    const qualityMacro = makeSlot({
      scheduleLabel: "Macro trends / Regulation",
      archetype: "Macro trends / Regulation",
      draftMode: "quality",
    });
    const researchMacro = makeSlot({
      ...qualityMacro,
      draftMode: "research",
    });

    expect(requiresFreshWeeklyContext(qualityMacro)).toBe(true);
    expect(hasFreshWeeklyContext(qualityMacro)).toBe(false);
    expect(requiresFreshWeeklyContext(researchMacro)).toBe(false);
    expect(hasFreshWeeklyContext(researchMacro)).toBe(true);
  });
});
