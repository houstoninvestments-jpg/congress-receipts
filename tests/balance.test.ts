import { describe, expect, it } from "vitest";
import type { Ledger } from "../src/types.js";
import { allowedParties, balanced } from "../src/receipt/select.js";
import { receipt } from "./helpers.js";

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);

describe("party balance", () => {
  it("rules out only the party that would put the last 7 days more than one apart", () => {
    const l: Ledger = { nextNumber: 3, receipts: [receipt(1, day(0), "Democrat"), receipt(2, day(1), "Democrat")], skipped: [] };
    expect(balanced({ ...l, receipts: l.receipts })).toBe(false);
    const one: Ledger = { nextNumber: 2, receipts: [receipt(1, day(0), "Democrat")], skipped: [] };
    expect([...allowedParties(one, day(1), 7)].sort()).toEqual(["Independent", "Republican"]);
    expect([...allowedParties({ ...one, receipts: [] }, day(1), 7)].sort()).toEqual(["Democrat", "Independent", "Republican"]);
  });
  it("stays within one over every 7-day window for 60 days, whatever the supply looks like", () => {
    const l: Ledger = { nextNumber: 1, receipts: [], skipped: [] };
    for (let d = 0; d < 60; d++) {
      // Lopsided supply: Democrat trades are offered first most days.
      const want = d % 5 === 0 ? ["Republican", "Democrat"] : ["Democrat", "Republican"];
      const ok = allowedParties(l, day(d), 7);
      const pick = want.find((p) => ok.has(p as never));
      if (pick) l.receipts.push(receipt(l.nextNumber++, day(d), pick as never));
    }
    expect(balanced(l)).toBe(true);
  });
});
