import type { Filing, Ledger, Member, ParsedFiling, Party, Transaction } from "../types.js";
import { config } from "../lib/config.js";
import { matchMember } from "../data/members.js";
import { daysBetween } from "./facts.js";

export interface Candidate {
  txn: Transaction;
  filing: Filing;
  member: Member;
  score: number;
}

/**
 * Today's party rule: over any 7 days in a row, Democrat and Republican receipts stay within one
 * of each other. Returns the parties that keep that true if chosen today. Party is never a reason
 * to pick a trade; it only rules out the one choice that would break the balance.
 */
export function allowedParties(ledger: Ledger, today: string, windowDays = config().selection.partyWindowDays): Set<Party> {
  // The 7 days ending today, including receipts already posted today in an earlier slot.
  const recent = ledger.receipts.filter((r) => {
    const age = daysBetween(r.date, today);
    return age >= 0 && age < windowDays;
  });
  const d = recent.filter((r) => r.party === "Democrat").length;
  const r = recent.filter((r) => r.party === "Republican").length;
  const ok = new Set<Party>(["Independent"]);
  if (Math.abs(d + 1 - r) <= 1) ok.add("Democrat");
  if (Math.abs(d - (r + 1)) <= 1) ok.add("Republican");
  return ok;
}

/** True if every 7-day window in the ledger keeps D and R within one. Used by tests and the health check. */
export function balanced(ledger: Ledger, windowDays = 7): boolean {
  const dates = [...new Set(ledger.receipts.map((r) => r.date))].sort();
  return dates.every((end) => {
    const inWin = ledger.receipts.filter((r) => {
      const age = daysBetween(r.date, end);
      return age >= 0 && age < windowDays;
    });
    const d = inWin.filter((x) => x.party === "Democrat").length;
    const r = inWin.filter((x) => x.party === "Republican").length;
    return Math.abs(d - r) <= 1;
  });
}

/**
 * Neutral ranking: bigger filed amounts first, then the most recently filed. Nothing here looks at
 * party, name, or what the stock did.
 */
export function score(t: Transaction, f: Filing, today: string): number {
  const size = Math.log10(t.amountMin + 1); // 3 (=$1K) .. 7.7 (=$50M)
  const age = daysBetween(f.filingDate, today);
  return +(size - age / 30).toFixed(4);
}

export function candidates(cache: Record<string, ParsedFiling>, members: Member[], ledger: Ledger, today: string): { list: Candidate[]; dropped: Record<string, number> } {
  const sel = config().selection;
  const used = new Set(ledger.receipts.map((r) => r.txnId));
  const skipped = new Set(ledger.skipped.map((s) => s.txnId));
  const recentMembers = new Set(ledger.receipts.filter((r) => daysBetween(r.date, today) < sel.memberCooldownDays).map((r) => r.bioguide));
  const dropped: Record<string, number> = {};
  const drop = (why: string) => {
    dropped[why] = (dropped[why] ?? 0) + 1;
  };
  const list: Candidate[] = [];
  for (const pf of Object.values(cache)) {
    if (pf.status !== "electronic") {
      drop(`filing ${pf.status}`);
      continue;
    }
    if (daysBetween(pf.filing.filingDate, today) > sel.maxDaysSinceFiling) continue;
    const member = matchMember(pf.filing, members);
    for (const t of pf.transactions) {
      if (t.type !== "P") {
        drop("not a purchase");
        continue;
      }
      if (t.assetType !== "ST" || !t.ticker) {
        drop("not a listed stock with a ticker");
        continue;
      }
      if (!member) {
        drop("filer not matched to one sitting member");
        continue;
      }
      if (used.has(t.id) || skipped.has(t.id)) continue;
      if (daysBetween(t.tradeDate, today) < sel.minDaysSinceTrade) {
        drop("trade too recent to measure");
        continue;
      }
      if (t.tradeDate > pf.filing.filingDate) {
        drop("trade date after filing date");
        continue;
      }
      if (recentMembers.has(member.bioguide)) {
        drop("member featured in the last 7 days");
        continue;
      }
      list.push({ txn: t, filing: pf.filing, member, score: score(t, pf.filing, today) });
    }
  }
  list.sort((a, b) => b.score - a.score || a.txn.id.localeCompare(b.txn.id));
  return { list, dropped };
}

/** Same member and ticker filed more than once (several lots): keep only the first, so one trade isn't shown twice. */
export function dedupe(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = `${c.member.bioguide}:${c.txn.ticker}:${c.txn.tradeDate}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function pickOrder(list: Candidate[], ledger: Ledger, today: string): Candidate[] {
  const ok = allowedParties(ledger, today);
  return dedupe(list).filter((c) => ok.has(c.member.party));
}
