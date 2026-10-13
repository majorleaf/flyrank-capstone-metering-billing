import { describe, expect, it } from "vitest";
import { computeTokenCostMicros, totalBillableTokens } from "./pricing.js";
import { InvalidTokenUsageError } from "./error.js";

describe("computeTokenCostMicros (PRICING_V1)", () => {
  it("prices cached input cheaper and reasoning as output", () => {
    // fresh 6,000 x $1/M = 6,000 + cached 4,000 x $0.25/M = 1,000 + (2,000+1,000) x $4/M = 12,000
    expect(
      computeTokenCostMicros({
        inputTokens: 10_000,
        cachedInputTokens: 4_000,
        outputTokens: 2_000,
        reasoningTokens: 1_000,
      }),
    ).toBe(19_000n);
  });

  it("differs from a naive all-fresh sum (22,000)", () => {
    expect(
      computeTokenCostMicros({ inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 3_000, reasoningTokens: 0 }),
    ).toBe(22_000n);
  });

  it("bills reasoning identically to output", () => {
    const asOutput = computeTokenCostMicros({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 500, reasoningTokens: 0 });
    const asReasoning = computeTokenCostMicros({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 500 });
    expect(asReasoning).toBe(asOutput);
    expect(asOutput).toBe(2_000n);
  });

  it("rounds half up", () => {
    const u = { outputTokens: 0, reasoningTokens: 0 };
    expect(computeTokenCostMicros({ ...u, inputTokens: 1, cachedInputTokens: 1 })).toBe(0n); // 0.25
    expect(computeTokenCostMicros({ ...u, inputTokens: 2, cachedInputTokens: 2 })).toBe(1n); // 0.50
    expect(computeTokenCostMicros({ ...u, inputTokens: 2, cachedInputTokens: 1 })).toBe(1n); // 1.25
  });

  it("returns 0 for zero usage", () => {
    expect(computeTokenCostMicros({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 })).toBe(0n);
  });

  it("rejects cached > input, negatives, and fractions", () => {
    const base = { inputTokens: 10, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
    expect(() => computeTokenCostMicros({ ...base, cachedInputTokens: 11 })).toThrow(InvalidTokenUsageError);
    expect(() => computeTokenCostMicros({ ...base, outputTokens: -1 })).toThrow(InvalidTokenUsageError);
    expect(() => computeTokenCostMicros({ ...base, inputTokens: 1.5 })).toThrow(InvalidTokenUsageError);
  });
});

describe("totalBillableTokens", () => {
  it("counts input (cached included) + output + reasoning once", () => {
    expect(totalBillableTokens({ inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 2_000, reasoningTokens: 1_000 })).toBe(13_000);
  });
});