import { z } from "zod";

export type Party = "Democrat" | "Republican" | "Independent";

/** One periodic transaction report (PTR) as listed in the House Clerk's yearly index. */
export interface Filing {
  docId: string;
  year: number;
  prefix: string;
  first: string;
  last: string;
  suffix: string;
  stateDst: string; // "TX37"
  filingDate: string; // YYYY-MM-DD, from the Clerk's index
  pdfUrl: string;
}

/** One line of a PTR, exactly as filed. Amounts are the filed range, never a guess. */
export interface Transaction {
  id: string; // `${docId}-${row}`
  docId: string;
  row: number;
  owner: string; // "", "SP" (spouse), "JT" (joint), "DC" (dependent child)
  asset: string; // full asset text as filed
  ticker: string | null; // from "(NVDA)" in the asset text
  assetType: string | null; // "[ST]" = stock
  type: "P" | "S" | "S (partial)" | "E";
  tradeDate: string; // YYYY-MM-DD
  notifiedDate: string | null; // YYYY-MM-DD
  amountMin: number;
  amountMax: number | null; // null for "Over $50,000,000"
  amountText: string; // "$1,001 - $15,000" as filed
}

export interface ParsedFiling {
  filing: Filing;
  /** "electronic" when the PDF had a text layer we could read; "scanned" or "unreadable" filings are never used. */
  status: "electronic" | "scanned" | "unreadable";
  filedDateOnForm: string | null; // the "Filing date" printed on the PDF, if any
  transactions: Transaction[];
  problems: string[];
  parsedAt: string;
}

export interface Member {
  bioguide: string;
  name: string; // "Lloyd Doggett"
  official: string; // "Rep. Lloyd Doggett"
  party: Party;
  state: string; // "TX"
  district: number | null;
  gender: "M" | "F" | null;
}

export interface PricePoint {
  date: string; // trading day used
  close: number; // split-adjusted close
}

export interface PriceLeg {
  symbol: string;
  start: PricePoint; // close on the trade date (or the next trading day)
  end: PricePoint; // latest close
  changePct: number; // rounded to 0.1
}

export interface PriceResult {
  source: { name: string; url: string; terms: string };
  stock: PriceLeg;
  market: PriceLeg; // SPY, same window
}

export type Stamp = "BEAT THE MARKET" | "LOST TO THE MARKET" | "FILED LATE";

/** Every number a script may say, worked out in code from the filing and the prices. */
export interface Facts {
  memberName: string;
  memberTitle: string; // "Rep."
  memberNoun: string; // "congressman" | "congresswoman" | "member of Congress"
  party: Party;
  partyLetter: "D" | "R" | "I";
  state: string;
  stateName: string;
  district: number | null;
  owner: string; // "the member" | "a spouse" | "jointly" | "a dependent child"
  company: string; // short name people say ("Merck & Company")
  companyFull: string; // as filed, without the ticker
  ticker: string;
  amountText: string;
  amountMin: number;
  amountMax: number | null;
  amountMid: number | null;
  tradeDate: string;
  filedDate: string;
  daysToFile: number;
  daysLate: number; // 0 if on time
  /** null only in dry runs before a licensed price source is set up. Never published that way. */
  prices: PriceResult | null;
  excessPts: number | null; // stock change minus market change, in points
  stamp: Stamp | null;
  pdfUrl: string;
}

export const CtaState = z.enum(["none", "soft", "direct"]);
export type CtaState = z.infer<typeof CtaState>;

/** What the writer returns: only words. Every number in it must come from Facts. */
export const Script = z.object({
  hook: z.string().describe("Spoken first, under 2.5 seconds. Under 14 words."),
  receiptSay: z.string().describe("Spoken over the filing card. Who, party, state, and the two dates. Under 26 words."),
  resultSay: z.string().describe("Spoken over the result. The stock's change and the S&P 500's change over the same days. Under 24 words."),
  stampSay: z.string().describe("Spoken as the stamp lands. Under 10 words."),
  title: z.string().describe("Leave empty. Set in code."),
  description: z.string().describe("Two short plain sentences that restate the facts. No hashtags."),
});
export type Script = z.infer<typeof Script>;

export const Verdict = z.object({
  verdict: z.enum(["publish", "skip"]),
  confidence: z.number().min(0).max(1),
  problems: z.array(z.string()).describe("Each number that does not match the facts, each hint at motive, each line that is not neutral."),
});
export type Verdict = z.infer<typeof Verdict>;

export interface Receipt {
  number: number; // Receipt No. 001
  date: string; // video date YYYY-MM-DD
  txnId: string;
  docId: string;
  bioguide: string;
  party: Party;
  facts: Facts;
  script: Script;
  slug: string;
  cta: CtaState;
  hookVariant: string;
  status: "checked" | "rendered" | "published";
  writer: string; // "claude-fable-5-1" or "template"
  review: string; // what reviewed it
  voice?: string;
  youtubeId?: string;
  youtubePrivacy?: "public" | "unlisted" | "private";
}

export interface Ledger {
  nextNumber: number;
  receipts: Receipt[];
  skipped: { txnId: string; date: string; reason: string }[];
  firstUploadCheck?: { videoId: string; checkedAt: string; locked: boolean; detail: string };
}
