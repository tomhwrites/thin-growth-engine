import { describe, expect, it } from "vitest";
import { mapWithConcurrency, withTimeout } from "./async";

describe("mapWithConcurrency", () => {
  it("preserves input order while limiting concurrent work", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await mapWithConcurrency([3, 1, 2, 4], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, item));
      active -= 1;
      return item * 10;
    });

    expect(results).toEqual([30, 10, 20, 40]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});

describe("withTimeout", () => {
  it("rejects with the supplied message when the operation takes too long", async () => {
    await expect(
      withTimeout(
        new Promise((resolve) => setTimeout(resolve, 25)),
        1,
        "too slow"
      )
    ).rejects.toThrow("too slow");
  });
});
