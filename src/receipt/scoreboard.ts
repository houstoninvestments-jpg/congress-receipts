import type { Party, Receipt } from "../types.js";

export interface Side {
  receipts: number;
  avgVsMarket: number | null;
}

/**
 * Democrats vs Republicans this year: how many receipts, and the average of (stock change minus
 * S&P 500 change), each measured on its own video's date. Receipts without prices don't count.
 */
export function scoreboard(receipts: Receipt[], year: number, extra?: Receipt): { year: number; dem: Side; rep: Side } {
  const all = [...receipts.filter((r) => r.date.startsWith(String(year))), ...(extra ? [extra] : [])];
  const side = (p: Party): Side => {
    const mine = all.filter((r) => r.party === p);
    const measured = mine.map((r) => r.facts.excessPts).filter((x): x is number => x !== null);
    return { receipts: mine.length, avgVsMarket: measured.length ? Math.round((measured.reduce((a, b) => a + b, 0) / measured.length) * 10) / 10 : null };
  };
  return { year, dem: side("Democrat"), rep: side("Republican") };
}
