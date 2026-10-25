import { describe, expect, it } from "vitest";
import { buildTimeline, MAX_SECONDS } from "../src/render/timeline.js";
import { CAPTIONS, CARD, HEAD, RESULT, overlaps } from "../remotion/layout.js";
import { scoreboard } from "../src/receipt/scoreboard.js";
import { facts, receipt } from "./helpers.js";

const seg = (id: string, duration: number) => ({ id, text: "one two three four", file: `/x/${id}.wav`, duration });

describe("video", () => {
  it("stays under 40 seconds and ends on a 3-second scoreboard", () => {
    const t = buildTimeline({ hook: seg("hook", 4), receipt: seg("receipt", 6), result: seg("result", 5), stamp: seg("stamp", 3), closer: seg("closer", 1.5) }, (id) => `${id}.wav`);
    expect(t.total / t.fps).toBeLessThan(MAX_SECONDS);
    const sb = t.beats.find((b) => b.id === "scoreboard")!;
    expect((t.total - sb.from) / t.fps).toBeGreaterThanOrEqual(3);
  });
  it("refuses a voice that would run 40 seconds or more", () => {
    expect(() => buildTimeline({ hook: seg("hook", 10), receipt: seg("receipt", 12), result: seg("result", 10), stamp: seg("stamp", 5), closer: seg("closer", 2) }, (id) => id)).toThrow(/under 40s/);
  });
  it("nothing is laid out on top of the key numbers", () => {
    for (const b of [HEAD, CAPTIONS]) {
      expect(overlaps(b, CARD)).toBe(false);
      expect(overlaps(b, RESULT)).toBe(false);
    }
    expect(overlaps(CARD, RESULT)).toBe(false);
  });
  it("scoreboard averages stock minus S&P 500 per party, this year only", () => {
    const b = scoreboard([receipt(1, "2026-10-01", "Republican"), receipt(2, "2026-10-02", "Democrat", facts(null)), receipt(3, "2025-12-01", "Democrat")], 2026);
    expect(b.rep).toEqual({ receipts: 1, avgVsMarket: 7.8 });
    expect(b.dem).toEqual({ receipts: 1, avgVsMarket: null });
  });
});
