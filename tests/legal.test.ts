import { describe, expect, it } from "vitest";
import { BANNED, bannedHits, mechanicalCheck } from "../src/checker/index.js";
import { templateScript } from "../src/writer/index.js";
import { facts } from "./helpers.js";
import { buildFacts } from "../src/receipt/facts.js";
import { parsed, SALAZAR, SALAZAR_M, PRICES } from "./helpers.js";

const f = facts();
const ok = templateScript(f, 1);

describe("legal gates in the checker", () => {
  it("the fixed wording passes every code check", () => {
    expect(mechanicalCheck(ok, f, 1)).toEqual({ ok: true, problems: [] });
  });
  it.each(["insider trading", "an insider", "dumped", "dumping", "before the vote", "corrupt", "corruption", "she knew", "a tip-off", "suspicious timing", "just before", "copy this trade"])(
    "blocks %s anywhere",
    (w) => {
      for (const field of ["hook", "receiptSay", "resultSay", "stampSay", "title", "description"] as const) {
        const r = mechanicalCheck({ ...ok, [field]: `${ok[field]} ${w}` }, f, 1);
        expect(r.ok, `${field}: ${w}`).toBe(false);
      }
    },
  );
  it("blocks buy and sell advice in what is said", () => {
    expect(mechanicalCheck({ ...ok, stampSay: "You should buy it." }, f, 1).ok).toBe(false);
    expect(mechanicalCheck({ ...ok, stampSay: "Sell signal." }, f, 1).ok).toBe(false);
  });
  it("blocks any number that is not in the filing or the prices", () => {
    const r = mechanicalCheck({ ...ok, resultSay: ok.resultSay.replace("12.3%", "13.3%") }, f, 1);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/13.3/);
    expect(mechanicalCheck({ ...ok, hook: ok.hook.replace("$50K", "$75K") }, f, 1).ok).toBe(false);
  });
  it("blocks the wrong party and a missing state or date", () => {
    expect(mechanicalCheck({ ...ok, receiptSay: ok.receiptSay.replace("Republican", "Democrat") }, f, 1).ok).toBe(false);
    expect(mechanicalCheck({ ...ok, receiptSay: ok.receiptSay.replace("Florida", "") }, f, 1).ok).toBe(false);
    expect(mechanicalCheck({ ...ok, receiptSay: ok.receiptSay.replace("Sep 9", "") }, f, 1).ok).toBe(false);
  });
  it("requires saying a spouse made the trade when the filing says so", () => {
    const t = { ...parsed().transactions.find((x) => x.ticker === "MRK")!, owner: "SP" };
    const sf = buildFacts(t, SALAZAR, SALAZAR_M, PRICES);
    const good = templateScript(sf, 1);
    expect(good.hook).toMatch(/spouse/);
    expect(mechanicalCheck(good, sf, 1).ok).toBe(true);
    expect(mechanicalCheck({ ...good, hook: ok.hook }, sf, 1).ok).toBe(false);
  });
  it("says filed late with the exact days when it was late", () => {
    const lf = facts(PRICES, "2026-10-20"); // 62 days after Aug 19
    expect(lf.daysLate).toBe(17);
    expect(lf.stamp).toBe("FILED LATE");
    const s = templateScript(lf, 1);
    expect(s.stampSay).toBe("It was filed 17 days past the 45-day deadline.");
    expect(mechanicalCheck(s, lf, 1).ok).toBe(true);
  });
  it("the banned list covers every word the brief names", () => {
    for (const w of ["insider trading", "insider", "dumped", "before the vote", "corrupt"]) expect(bannedHits(w, BANNED).length, w).toBeGreaterThan(0);
  });
});
