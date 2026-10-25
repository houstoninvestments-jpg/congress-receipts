import type { Facts, Filing, Member, PriceResult, Stamp, Transaction } from "../types.js";
import { companyName, shortCompany } from "../data/ptr.js";
import { STATES } from "../data/members.js";

/** STOCK Act: a transaction must be reported no later than 45 days after it happens. */
export const STOCK_ACT_DAYS = 45;

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Days late = filed date minus trade date minus 45. Only when the filing shows both dates. */
export function daysLate(tradeDate: string | null, filedDate: string | null): number {
  if (!tradeDate || !filedDate) return 0;
  return Math.max(0, daysBetween(tradeDate, filedDate) - STOCK_ACT_DAYS);
}

export const OWNER_WORDS: Record<string, string> = { "": "the member", SP: "a spouse", JT: "jointly", DC: "a dependent child" };

export function stampFor(excessPts: number | null, late: number): Stamp | null {
  if (late > 0) return "FILED LATE";
  if (excessPts === null) return null;
  return excessPts > 0 ? "BEAT THE MARKET" : "LOST TO THE MARKET";
}

export function buildFacts(t: Transaction, f: Filing, m: Member, prices: PriceResult | null): Facts {
  const late = daysLate(t.tradeDate, f.filingDate);
  const excess = prices ? Math.round((prices.stock.changePct - prices.market.changePct) * 10) / 10 : null;
  const noun = m.gender === "F" ? "congresswoman" : m.gender === "M" ? "congressman" : "member of Congress";
  return {
    memberName: m.name,
    memberTitle: "Rep.",
    memberNoun: noun,
    party: m.party,
    partyLetter: m.party === "Democrat" ? "D" : m.party === "Republican" ? "R" : "I",
    state: m.state,
    stateName: STATES[m.state] ?? m.state,
    district: m.district,
    owner: OWNER_WORDS[t.owner] ?? "the member",
    company: shortCompany(companyName(t.asset)),
    companyFull: companyName(t.asset),
    ticker: t.ticker!,
    amountText: t.amountText,
    amountMin: t.amountMin,
    amountMax: t.amountMax,
    amountMid: t.amountMax === null ? null : Math.round((t.amountMin + t.amountMax) / 2),
    tradeDate: t.tradeDate,
    filedDate: f.filingDate,
    daysToFile: daysBetween(t.tradeDate, f.filingDate),
    daysLate: late,
    prices,
    excessPts: excess,
    stamp: stampFor(excess, late),
    pdfUrl: f.pdfUrl,
  };
}

// ---------- How numbers are written. The writer, the card and the checker all use these. ----------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
export const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
};

/** $250,000 -> "$250K", $1,000,000 -> "$1M", $5,000,000 -> "$5M". */
export function shortMoney(n: number): string {
  if (n >= 1_000_000) return `$${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}
export const fullMoney = (n: number) => `$${n.toLocaleString("en-US")}`;

/** "up 12.3%" / "down 4.1%" / "flat". */
export function moveWords(pct: number): string {
  if (pct === 0) return "flat";
  return `${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}%`;
}

export const ptsWords = (x: number) => `${Math.abs(x).toFixed(1)} points`;

/** "up to $250K" for a range, "over $50M" for the open top range. */
export function amountWords(f: Pick<Facts, "amountMin" | "amountMax">): string {
  return f.amountMax === null ? `over ${shortMoney(f.amountMin - 1)}` : `up to ${shortMoney(f.amountMax)}`;
}

/** Every number a script is allowed to say, in every way we might write it. */
export function allowedNumbers(f: Facts, receiptNo: number): Set<string> {
  const s = new Set<string>();
  const add = (x: string | number) => s.add(String(x).replace(/[$,%]/g, "").replace(/\.0$/, ""));
  for (const n of [f.amountMin, f.amountMax, f.amountMid, f.amountMin - 1]) {
    if (n === null) continue;
    add(n);
    add(shortMoney(n).replace(/[KM]$/, ""));
  }
  const p = f.prices;
  for (const d of [f.tradeDate, f.filedDate, ...(p ? [p.stock.start.date, p.stock.end.date] : [])]) {
    const [y, m, dd] = d.split("-").map(Number);
    add(y);
    add(dd);
    add(m);
  }
  for (const x of p ? [p.stock.changePct, p.market.changePct, f.excessPts ?? 0] : []) {
    add(Math.abs(x).toFixed(1));
    add(Math.round(Math.abs(x)));
  }
  for (const n of [f.daysLate, f.daysToFile, STOCK_ACT_DAYS, receiptNo, 500]) add(n); // 500 as in "S&P 500"
  if (f.district !== null) add(f.district);
  add(String(receiptNo).padStart(3, "0"));
  for (const c of p ? [p.stock.start.close, p.stock.end.close, p.market.start.close, p.market.end.close] : []) add(c.toFixed(2));
  return s;
}
