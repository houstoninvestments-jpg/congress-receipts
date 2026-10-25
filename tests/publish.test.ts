import { describe, expect, it } from "vitest";
import { uploadRequest } from "../src/publish/youtube.js";
import { seal, unseal } from "../src/auth/seal.js";
import { receipt } from "./helpers.js";

describe("YouTube upload metadata", () => {
  const r = receipt(1, "2026-10-01", "Republican");
  const u = uploadRequest(r, "AI voice (Kokoro open model)");
  it("titles every video Receipt No. 001: <member> bought <stock>", () => {
    expect(u.snippet.title).toBe("Receipt No. 001: Rep. Maria Elvira Salazar bought Merck & Company");
  });
  it("description has the filing, the site, the not-advice line, the AI voice and hashtags", () => {
    const d = u.snippet.description;
    expect(d).toContain("https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035411.pdf");
    expect(d).toContain("/receipt/001-test/");
    expect(d).toContain("Not financial advice. Facts from public filings.");
    expect(d).toMatch(/narration is an AI voice/);
    expect(d.trim().split("\n").at(-1)).toBe("#CongressReceipts #STOCKAct #Congress #Shorts");
  });
  it("description carries the receipt's TradingView chart link for YouTube, with the paid-link disclosure", () => {
    const d = u.snippet.description;
    expect(d).toMatch(/Full MRK chart on TradingView \(paid link\): https:\/\/www\.tradingview\.com\/\S*aff_id=1173299&aff_sub=receipt-001&source=youtube/);
    expect(d).toContain("Paid link: TradingView pays us if you sign up for a paid plan through it.");
    expect(d).not.toMatch(/\$15(?![\d,])|discount|coupon/i);
  });
  it("flags synthetic media on every upload", () => {
    expect(u.status.containsSyntheticMedia).toBe(true);
    expect(u.status.selfDeclaredMadeForKids).toBe(false);
  });
});

describe("sealed YouTube token", () => {
  it("opens only with the same client secret", async () => {
    const s = await seal("1//refresh-token", "client-secret-a");
    expect(s).not.toContain("refresh");
    expect(await unseal(s, "client-secret-a")).toBe("1//refresh-token");
    await expect(unseal(s, "client-secret-b")).rejects.toThrow();
  });
});
