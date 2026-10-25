import type { Ledger, Receipt } from "../types.js";
import { path, readJson, writeJson } from "./util.js";

const FILE = () => process.env.LEDGER_FILE || path("data/ledger.json");

export function loadLedger(): Ledger {
  return readJson<Ledger>(FILE(), { nextNumber: 1, receipts: [], skipped: [] });
}

export function saveLedger(l: Ledger) {
  writeJson(FILE(), l);
}

export function upsertReceipt(l: Ledger, r: Receipt) {
  const i = l.receipts.findIndex((e) => e.number === r.number);
  if (i >= 0) l.receipts[i] = r;
  else l.receipts.push(r);
}

export const published = (l: Ledger) => l.receipts.filter((r) => r.status === "published");
