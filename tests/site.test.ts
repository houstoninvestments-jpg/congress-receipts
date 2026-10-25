import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "../src/site/build.js";
import { BANNED, bannedHits } from "../src/checker/index.js";
import { writeJson } from "../src/lib/util.js";
import { receipt } from "./helpers.js";

let dir = "";
let pages: string[] = [];
const html = (rel: string) => readFileSync(join(dir, rel), "utf8");
const text = (rel: string) => html(rel).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&");

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), "site-"));
  process.env.LEDGER_FILE = join(tmp, "ledger.json");
  process.env.TV_SYMBOLS_FILE = join(tmp, "tv.json");
  writeJson(process.env.TV_SYMBOLS_FILE, { MRK: { path: "/symbols/NYSE-MRK/", checkedAt: "2026-10-25T00:00:00Z" } });
  writeJson(process.env.LEDGER_FILE, { nextNumber: 3, receipts: [receipt(1, "2026-10-01", "Republican"), receipt(2, "2026-10-02", "Democrat")], skipped: [] });
  const r = await buildSite({ dir: join(tmp, "dist") });
  dir = r.dir;
  pages = r.pages;
});

describe("website", () => {
  it("has home, all receipts, scoreboard, one page per receipt, privacy and terms", () => {
    for (const p of ["index.html", "receipts/index.html", "scoreboard/index.html", "privacy/index.html", "terms/index.html", "receipt/001-test/index.html", "receipt/002-test/index.html"]) expect(pages).toContain(p);
  });
  it("every page says it is not financial advice and uses no banned wording", () => {
    for (const p of pages) {
      expect(text(p), p).toContain("Not financial advice. Facts from public filings.");
      expect(bannedHits(text(p), BANNED), p).toEqual([]);
    }
  });
  it("each receipt page links the filing PDF and shows the math", () => {
    const t = html("receipt/001-test/index.html");
    expect(t).toContain("https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035411.pdf");
    expect(text("receipt/001-test/index.html")).toMatch(/112\.30 ÷ 100\.00 − 1 = \+12\.3%/);
    expect(text("receipt/001-test/index.html")).toMatch(/Days late/);
  });
  it("privacy page meets the YouTube API Services rules", () => {
    const t = html("privacy/index.html");
    expect(t).toContain("YouTube API Services");
    expect(t).toContain("https://www.youtube.com/t/terms");
    expect(t).toContain("http://www.google.com/policies/privacy");
    expect(t).toContain("https://security.google.com/settings/security/permissions");
    expect(text("privacy/index.html")).toMatch(/delete stored YouTube data within 30 days/);
  });
  it("privacy and terms give a way to reach us even without an email address set", () => {
    expect(text("privacy/index.html")).toMatch(/YouTube channel's About page/);
  });
  it("terms explain the news-media use and that we never sell data or alerts", () => {
    expect(text("terms/index.html")).toMatch(/13107\(c\)/);
    expect(text("terms/index.html")).toMatch(/never sell the data, and we never sell alerts/);
  });
  it("weekly email is built but hidden until set up", () => {
    expect(html("index.html")).toMatch(/<section id="newsletter" hidden>/);
    expect(html("index.html")).toContain("This week's receipts");
  });
  it("every receipt page has the TradingView chart link under the result, labeled and disclosed", () => {
    for (const [n, slug] of [[1, "001-test"], [2, "002-test"]] as const) {
      const t = html(`receipt/${slug}/index.html`);
      const link = `https://www.tradingview.com/symbols/NYSE-MRK/?aff_id=1173299&amp;aff_sub=receipt-00${n}&amp;source=site`;
      expect(t).toContain(link);
      expect(t.indexOf(link)).toBeGreaterThan(t.indexOf("What happened next"));
      expect(t.indexOf(link)).toBeLessThan(t.indexOf("The math"));
      expect(t).toMatch(/See the full chart on TradingView<\/a> <span class="paid">Paid link<\/span>/);
      expect(t).toContain("TradingView pays us if you sign up for a paid TradingView plan through this link.");
      expect(t).toMatch(/rel="sponsored noopener"/);
    }
  });
  it("home and scoreboard carry one general TradingView link, same label", () => {
    expect(html("index.html")).toContain("https://www.tradingview.com/?aff_id=1173299&amp;aff_sub=home&amp;source=site");
    expect(html("scoreboard/index.html")).toContain("https://www.tradingview.com/?aff_id=1173299&amp;aff_sub=scoreboard&amp;source=site");
    for (const p of ["index.html", "scoreboard/index.html"]) expect(html(p)).toContain('<span class="paid">Paid link</span>');
  });
  it("follows TradingView's rules: no discount or offer in our wording, no buy/sell wording near the links", () => {
    for (const p of pages) {
      expect(text(p), p).not.toMatch(/\$15(?![\d,])|% off|\boff your\b|discount|coupon|special offer/i);
      expect(text(p), p).not.toMatch(/copy (this|the) trade|\bbuy now\b|\bsell now\b/i);
    }
  });
});
