import { describe, expect, it } from "vitest";
import { companyName, isOtcForeign, parseAmount, shortCompany } from "../src/data/ptr.js";
import { factsForModel } from "../src/writer/index.js";
import { liquidityCheck } from "../src/prices/index.js";
import { matchMember } from "../src/data/members.js";
import { daysLate } from "../src/receipt/facts.js";
import { leg, splitAdjust } from "../src/prices/index.js";
import { facts, parsed, SALAZAR, SALAZAR_M } from "./helpers.js";
import { parsePtrText } from "../src/data/ptr.js";

describe("House PTR parser", () => {
  it("reads every row of a real filing, with ranges, owners and dates", () => {
    const p = parsed();
    expect(p.status).toBe("electronic");
    expect(p.problems).toEqual([]);
    expect(p.transactions.map((t) => `${t.type} ${t.ticker} ${t.tradeDate} ${t.amountText}`)).toEqual([
      "P BRK.B 2026-08-07 $1,001 - $15,000",
      "S CB 2026-08-19 $15,001 - $50,000",
      "S (partial) IBM 2026-08-24 $1,001 - $15,000",
      "P MRK 2026-08-19 $15,001 - $50,000",
      "S (partial) MRNA 2026-08-19 $1,001 - $15,000",
      "P SPCX 2026-08-12 $1,001 - $15,000",
    ]);
  });
  it("keeps the owner column (dependent child) and joins split rows across pages", () => {
    const p = parsed({ ...SALAZAR, docId: "20035408", stateDst: "MD06" });
    expect(p.transactions.map((t) => [t.owner, t.ticker, t.amountText])).toEqual([
      ["DC", "BRO", "$100,001 - $250,000"],
      ["DC", "CHRW", "$1,001 - $15,000"],
      ["DC", "CPAY", "$15,001 - $50,000"],
    ]);
  });
  it("marks a filing with no text layer as scanned and takes nothing from it", () => {
    const p = parsePtrText(SALAZAR, "   \n\f  ");
    expect(p.status).toBe("scanned");
    expect(p.transactions).toEqual([]);
  });
  it("only accepts the House form's own ranges", () => {
    expect(parseAmount("$1,001 - $15,000")).toMatchObject({ min: 1001, max: 15000 });
    expect(parseAmount("Over $50,000,000")).toMatchObject({ min: 50000001, max: null });
    expect(parseAmount("$1,000 - $15,000")).toBeNull();
    expect(parseAmount("$15,001 -")).toBeNull();
  });
  it("names companies the way people say them", () => {
    expect(shortCompany(companyName("Merck & Company, Inc. Common Stock (MRK) [ST]"))).toBe("Merck & Company");
    expect(shortCompany(companyName("Space Exploration Technologies Corp. - Class A Common Stock (SPCX) [ST]"))).toBe("Space Exploration Technologies");
  });
  it("matches a filer to exactly one sitting member by seat and last name", () => {
    expect(matchMember(SALAZAR, [SALAZAR_M])?.party).toBe("Republican");
    expect(matchMember({ ...SALAZAR, last: "Someone" }, [SALAZAR_M])).toBeNull();
  });
});

describe("STOCK Act days late", () => {
  it("is filed date minus trade date minus 45, never negative", () => {
    expect(daysLate("2026-01-01", "2026-03-01")).toBe(59 - 45);
    expect(daysLate("2026-08-19", "2026-09-09")).toBe(0);
    expect(daysLate(null, "2026-09-09")).toBe(0);
  });
});

describe("prices", () => {
  it("adjusts for splits so a 10-for-1 split is not a 90% drop", () => {
    const pts = splitAdjust([{ date: "2026-01-02", close: 1000 }, { date: "2026-01-05", close: 101, splitFactor: 10 }]);
    expect(pts[0].close).toBe(100);
    expect(leg("X", pts, "2026-01-02")!.changePct).toBe(1);
  });
  it("starts at the first close on or after the trade date, and skips when there is none nearby", () => {
    const pts = [{ date: "2026-01-05", close: 10 }, { date: "2026-02-02", close: 11 }];
    expect(leg("X", pts, "2026-01-03")!.start.date).toBe("2026-01-05");
    expect(leg("X", pts, "2025-12-01")).toBeNull();
  });
});

describe("fixes after the first live dry run", () => {
  it("cleans all-caps share names from the filing", () => {
    expect(shortCompany(companyName("NOKIA A SHS (NOKBF) [ST]"))).toBe("Nokia");
    expect(shortCompany(companyName("IBM CORP (IBM) [ST]"))).toBe("IBM");
    expect(shortCompany(companyName("META PLATFORMS INC CL A (META) [ST]"))).toBe("Meta Platforms");
  });
  it("skips thin over-the-counter foreign shares", () => {
    expect(isOtcForeign("NOKBF")).toBe(true);
    expect(isOtcForeign("MSFT")).toBe(false);
    expect(isOtcForeign("BRK.B")).toBe(false);
    expect(() => liquidityCheck("X", [{ volume: 1000, exchange: "XNAS" }, { volume: 2000, exchange: "XNAS" }])).toThrow(/thinly traded/);
    expect(() => liquidityCheck("X", [{ volume: 1e6, exchange: "OTCM" }])).toThrow(/major U.S. exchange/);
    expect(() => liquidityCheck("X", [{ volume: 1e6, exchange: "XNYS" }])).not.toThrow();
  });
  it("tells the reviewers the filing says purchase", () => {
    expect(factsForModel(facts()).transaction).toMatch(/purchase/);
  });
});
