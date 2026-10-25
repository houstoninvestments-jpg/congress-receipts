import type { Timeline } from "../src/render/timeline.js";

export interface Side {
  receipts: number;
  avgVsMarket: number | null; // points, measured on each video's date
}

export interface ReceiptProps {
  number: number;
  card: {
    member: string;
    partyState: string; // "Republican · Florida"
    owner: string; // "Self" | "Spouse" | "Joint" | "Dependent child"
    stock: string; // "Merck & Company, Inc. (MRK)"
    amount: string; // "$15,001 - $50,000"
    tradeDate: string;
    filedDate: string;
    filingId: string;
    late: string; // "" or "Filed 12 days past the 45-day deadline"
  };
  result: {
    pending: boolean;
    stockLabel: string; // "MRK"
    stockPct: number | null;
    marketPct: number | null;
    window: string; // "Aug 19 to Oct 23, 2026 closes"
    source: string; // "Prices: ..."
  };
  stamp: string; // "BEAT THE MARKET" | "LOST TO THE MARKET" | "FILED LATE" | "TEST RENDER"
  hook: string;
  scoreboard: { year: number; dem: Side; rep: Side };
  timeline: Timeline;
  closer: string;
  cta: "none" | "soft" | "direct";
  notAdvice: string;
  voiceLabel: string;
  testLabel: string; // "TEST RENDER" on dry runs, "" on real renders
  [key: string]: unknown;
}
