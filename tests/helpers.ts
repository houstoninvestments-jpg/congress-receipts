import { readFileSync } from "node:fs";
import type { Facts, Filing, Member, PriceResult, Receipt } from "../src/types.js";
import { parsePtrText } from "../src/data/ptr.js";
import { buildFacts } from "../src/receipt/facts.js";
import { templateScript } from "../src/writer/index.js";
import { path } from "../src/lib/util.js";

export const SALAZAR: Filing = { docId: "20035411", year: 2026, prefix: "", first: "Maria Elvira", last: "Salazar", suffix: "", stateDst: "FL27", filingDate: "2026-09-09", pdfUrl: "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035411.pdf" };
export const SALAZAR_M: Member = { bioguide: "S000168", name: "Maria Elvira Salazar", official: "Rep. Maria Elvira Salazar", party: "Republican", state: "FL", district: 27, gender: "F" };

export const parsed = (f: Filing = SALAZAR) => parsePtrText(f, readFileSync(path(`fixtures/ptr/${f.docId}.txt`), "utf8"));

/** Made-up prices for tests only (never published: the fixture source is not publishable). */
export const PRICES: PriceResult = {
  source: { name: "Test prices", url: "https://example.com", terms: "" },
  stock: { symbol: "MRK", start: { date: "2026-08-19", close: 100 }, end: { date: "2026-10-23", close: 112.3 }, changePct: 12.3 },
  market: { symbol: "SPY", start: { date: "2026-08-19", close: 600 }, end: { date: "2026-10-23", close: 627 }, changePct: 4.5 },
};

export function facts(prices: PriceResult | null = PRICES, filedDate?: string): Facts {
  const pf = parsed();
  const t = pf.transactions.find((x) => x.ticker === "MRK")!;
  return buildFacts(t, { ...SALAZAR, filingDate: filedDate ?? SALAZAR.filingDate }, SALAZAR_M, prices);
}

export function receipt(n: number, date: string, party: Receipt["party"], f: Facts = facts()): Receipt {
  return {
    number: n, date, txnId: `x-${n}`, docId: "20035411", bioguide: `B${n}`, party, facts: f, script: templateScript(f, n),
    slug: `${String(n).padStart(3, "0")}-test`, cta: "none", hookVariant: "what-next", status: "published", writer: "template", review: "code checks",
  };
}
