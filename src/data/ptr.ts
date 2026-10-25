import type { Filing, ParsedFiling, Transaction } from "../types.js";

/**
 * Reads the text of a House periodic transaction report (from `pdftotext -layout`).
 * Strict on purpose: a line we can't read cleanly is reported as a problem and left out, never guessed.
 */

/** The value ranges printed on the House form. Anything else means we misread the line. */
export const HOUSE_RANGES: [number, number | null][] = [
  [1, 1000],
  [1001, 15000],
  [15001, 50000],
  [50001, 100000],
  [100001, 250000],
  [250001, 500000],
  [500001, 1000000],
  [1000001, 5000000],
  [5000001, 25000000],
  [25000001, 50000000],
  [50000001, null], // "Over $50,000,000"
  [1000001, null], // "Spouse/DC Over $1,000,000"
];

const ROW = /^(.*?)\s+(P|S \(partial\)|S|E)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s*(.*)$/;
const HEADER = /^\s*(ID\s+Owner\s+Asset|Type\s+Date\s+Gains|\$200\?|Filing ID #|P\s+T\s+R\s*$|Clerk of the House|F\s+I\s*$|Name:|Status:|State\/District:|T\s*$)/;
const DETAIL = /^\s*(F\s+S\s*:|S\s+O\s*:|D\s*:|L\s*:|C\s*:|\*\s*For the complete list)/;
const END = /^\s*(I\s+P\s+O|Yes\s+No|C\s+S\s*$|I CERTIFY|my knowledge and belief|Digitally Signed:)/;

export function usDate(mdy: string): string {
  const [m, d, y] = mdy.split("/");
  return `${y}-${m}-${d}`;
}

const money = (s: string) => Number(s.replace(/[$,]/g, ""));

/** "$1,001 - $15,000", "$100,001 - $250,000", "Over $50,000,000", "Spouse/DC Over $1,000,000". */
export function parseAmount(text: string): { min: number; max: number | null; text: string } | null {
  const t = text.replace(/\s+/g, " ").trim();
  const nums = t.match(/\$[\d,]+/g) ?? [];
  let min: number;
  let max: number | null;
  if (/over/i.test(t) && nums.length === 1) {
    min = money(nums[0]) + 1;
    max = null;
  } else if (nums.length === 2) {
    min = money(nums[0]);
    max = money(nums[1]);
  } else return null;
  if (!HOUSE_RANGES.some(([a, b]) => a === min && b === max)) return null;
  const label = max === null ? `Over $${(min - 1).toLocaleString("en-US")}` : `$${min.toLocaleString("en-US")} - $${max.toLocaleString("en-US")}`;
  return { min, max, text: label };
}

interface Draft {
  pre: string;
  type: Transaction["type"];
  tradeDate: string;
  notifiedDate: string;
  amount: string;
  assetMore: string[];
  status: string | null;
  comment: string;
  line: string;
}

export function parsePtrText(filing: Filing, text: string, now = new Date()): ParsedFiling {
  const out: ParsedFiling = { filing, status: "electronic", filedDateOnForm: null, transactions: [], problems: [], parsedAt: now.toISOString() };
  const clean = text.replace(/\f/g, "\n");
  if (clean.replace(/\s+/g, "").length < 80) return { ...out, status: "scanned", problems: ["no text layer (paper filing scanned as an image)"] };

  const idOnForm = clean.match(/Filing ID #(\d+)/)?.[1];
  if (idOnForm !== filing.docId) out.problems.push(`form says Filing ID ${idOnForm ?? "none"}, index says ${filing.docId}`);
  const dst = clean.match(/State\/District:\s*([A-Z]{2}\d{2})/)?.[1];
  if (dst && dst !== filing.stateDst) out.problems.push(`form says ${dst}, index says ${filing.stateDst}`);
  const signed = clean.match(/Digitally Signed:.*?(\d{2}\/\d{2}\/\d{4})/)?.[1];
  out.filedDateOnForm = signed ? usDate(signed) : null;

  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  let inDetail = false;
  for (const raw of clean.split("\n")) {
    if (!raw.trim()) continue;
    if (END.test(raw)) {
      cur = null;
      continue;
    }
    const m = raw.match(ROW);
    if (m && !HEADER.test(raw)) {
      cur = { pre: m[1], type: m[2] as Transaction["type"], tradeDate: m[3], notifiedDate: m[4], amount: m[5].trim(), assetMore: [], status: null, comment: "", line: raw.trim() };
      drafts.push(cur);
      inDetail = false;
      continue;
    }
    if (!cur || HEADER.test(raw)) continue;
    if (DETAIL.test(raw)) {
      inDetail = true;
      const st = raw.match(/^\s*F\s+S\s*:\s*(.*)$/);
      if (st) cur.status = st[1].trim();
      const c = raw.match(/^\s*C\s*:\s*(.*)$/);
      if (c) cur.comment = c[1].trim();
      continue;
    }
    // Continuation line: more of the asset name on the left, the top of the amount range on the right.
    const parts = raw.trim().split(/\s{2,}/);
    for (const p of parts) {
      if (/^\$[\d,]+$/.test(p) && cur.amount.endsWith("-")) cur.amount += ` ${p}`;
      else if (!inDetail) cur.assetMore.push(p);
      else if (cur.comment) cur.comment += ` ${p}`;
    }
  }

  drafts.forEach((d, i) => {
    const row = i + 1;
    let pre = d.pre.trim();
    let owner = "";
    const o = pre.match(/^(SP|JT|DC)\b\s*(.*)$/);
    if (o) {
      owner = o[1];
      pre = o[2];
    }
    const asset = [pre, ...d.assetMore].join(" ").replace(/\s+/g, " ").trim();
    const amount = parseAmount(d.amount);
    const problem = (why: string) => out.problems.push(`row ${row} (${asset.slice(0, 50)}): ${why}`);
    if (!amount) return problem(`amount not a standard range: "${d.amount}"`);
    if (d.status && !/^new$/i.test(d.status)) return problem(`filing status "${d.status}"`);
    const tickers = [...asset.matchAll(/\(([A-Z][A-Z0-9.\-]{0,9})\)/g)].map((x) => x[1]);
    const types = [...asset.matchAll(/\[([A-Z]{2,4})\]/g)].map((x) => x[1]);
    out.transactions.push({
      id: `${filing.docId}-${row}`,
      docId: filing.docId,
      row,
      owner,
      asset,
      ticker: tickers.length === 1 ? tickers[0] : null,
      assetType: types.length === 1 ? types[0] : null,
      type: d.type,
      tradeDate: usDate(d.tradeDate),
      notifiedDate: usDate(d.notifiedDate),
      amountMin: amount.min,
      amountMax: amount.max,
      amountText: amount.text,
    });
  });
  if (!drafts.length) {
    out.status = "unreadable";
    out.problems.push("no transaction rows found");
  }
  return out;
}

/** Company name as filed, without the ticker, type code or "Common Stock" boilerplate. */
export function companyName(asset: string): string {
  return asset
    .replace(/\[[A-Z]{2,4}\]/g, "")
    .replace(/\([A-Z][A-Z0-9.\-]{0,9}\)/g, "")
    .replace(/\s+-\s*$/, "")
    .replace(/\b(-\s*)?(New\s+)?(Class [A-Z]\s+)?(Common|Ordinary)(\s+(Stock|Shares))?\b.*$/i, "")
    .replace(/[\s,\-–]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(-\s*)?(Class\s+)?([A-Z]\s+)?(SHS|SHARES|ORD|ORDINARY|ADR|ADS|SPONSORED ADR|SPON ADR|REG|REGISTERED)\b.*$/i, "")
    .replace(/\s+(-\s*)?(CL|CLASS)\s+[A-Z]\b.*$/i, "")
    .replace(/[\s,\-–]+$/, "")
    .split(" ")
    .map((w, _i, all) => (all.join(" ") === all.join(" ").toUpperCase() && /^[A-Z]{4,}$/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/**
 * Foreign shares that trade over the counter in the U.S. (five-letter tickers ending in F, like NOKBF)
 * often trade thinly, so their prices are less reliable. We skip them.
 */
export const isOtcForeign = (ticker: string) => /^[A-Z]{4}F$/.test(ticker);

/** The name people say: "Merck & Company, Inc." -> "Merck & Company", "Apple Inc." -> "Apple". */
export function shortCompany(name: string): string {
  let n = name.trim();
  for (let i = 0; i < 3; i++) n = n.replace(/,?\s+(Inc|Incorporated|Corp|Corporation|Co|Ltd|Limited|plc|PLC|N\.V|S\.A|SE|AG|Holdings?|Group)\.?$/i, "").trim();
  return n.replace(/[.,\s]+$/, "") || name;
}
