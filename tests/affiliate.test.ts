import { describe, expect, it } from "vitest";
import { chartLink, checkSymbols, generalLink } from "../src/site/affiliate.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("TradingView links", () => {
  const map = { DDOG: { path: "/symbols/NASDAQ-DDOG/", checkedAt: "x" }, ZZZZQX: { path: null, checkedAt: "x" } };
  it("links a checked ticker to its chart page with our codes", () => {
    expect(chartLink("DDOG", 7, "site", map)).toBe("https://www.tradingview.com/symbols/NASDAQ-DDOG/?aff_id=1173299&aff_sub=receipt-007&source=site");
    expect(chartLink("DDOG", 7, "youtube", map)).toContain("source=youtube");
  });
  it("falls back to the base link when TradingView has no page, or the ticker isn't checked yet", () => {
    expect(chartLink("ZZZZQX", 7, "site", map)).toBe("https://www.tradingview.com/?aff_id=1173299&aff_sub=receipt-007&source=site");
    expect(chartLink("NEWT", 7, "site", map)).toBe("https://www.tradingview.com/?aff_id=1173299&aff_sub=receipt-007&source=site");
    expect(generalLink("home")).toBe("https://www.tradingview.com/?aff_id=1173299&aff_sub=home&source=site");
  });
  it("records the exchange page TradingView redirects to, and a 404 as no page", async () => {
    process.env.TV_SYMBOLS_FILE = join(mkdtempSync(join(tmpdir(), "tv-")), "tv.json");
    const fake = (async (url: string) => {
      const t = url.split("/symbols/")[1].replace("/", "");
      if (t === "MSFT") return { status: 200, url: "https://www.tradingview.com/symbols/NASDAQ-MSFT/" };
      return { status: 404, url };
    }) as unknown as typeof fetch;
    const m = await checkSymbols(["MSFT", "ZZZZQX"], fake);
    expect(m.MSFT.path).toBe("/symbols/NASDAQ-MSFT/");
    expect(m.ZZZZQX.path).toBeNull();
  });
});
