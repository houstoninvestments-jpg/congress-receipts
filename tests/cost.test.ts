import { describe, expect, it } from "vitest";
import { costOf, totalUsd } from "../src/llm/pricing.js";

describe("model cost log", () => {
  it("prices the writer and checker calls per million tokens", () => {
    expect(costOf("claude-fable-5-1", { input: 2000, output: 1000, cacheRead: 0, cacheWrite: 0 })).toBe(0.07);
    expect(costOf("claude-opus-5-5", { input: 2000, output: 1000, cacheRead: 0, cacheWrite: 0 })).toBe(0.028);
    expect(costOf("unknown-model", { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 })).toBeNull();
    expect(totalUsd([{ role: "a", model: "m", input: 0, output: 0, cacheRead: 0, cacheWrite: 0, usd: 0.07 }, { role: "b", model: "m", input: 0, output: 0, cacheRead: 0, cacheWrite: 0, usd: 0.028 }])).toBe(0.098);
  });
});
