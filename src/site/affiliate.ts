import { config } from "../lib/config.js";
import { log, path, readJson, writeJson } from "../lib/util.js";

/**
 * TradingView Partner Program links (paid links). Rules followed, from tradingview.com/partner-rules
 * as read on 2026-10-25:
 * - every link is labeled "Paid link" and the page says plainly that we're paid (Rule 1, disclosure);
 * - no discount or offer in our wording (Rule 1: not allowed unless site-wide or authorised in writing);
 * - TradingView is never presented as advice or a way to make money (Rule 1, accuracy);
 * - a normal link the reader clicks: no pop-ups, iframes, cloaking or links in widget code (Rule 1).
 */

export const TV = "https://www.tradingview.com";
const FILE = () => process.env.TV_SYMBOLS_FILE || path("data/tradingview-symbols.json");

/** Ticker -> resolved symbol path ("/symbols/NASDAQ-MSFT/") or null when TradingView has no page for it. */
export type SymbolMap = Record<string, { path: string | null; checkedAt: string }>;
export const loadSymbols = (): SymbolMap => readJson<SymbolMap>(FILE(), {});

export const sub = (n: number) => `receipt-${String(n).padStart(3, "0")}`;

function withCodes(url: string, aff_sub: string, source: "site" | "youtube") {
  const u = new URL(url);
  u.searchParams.set("aff_id", config().affiliate.affId);
  u.searchParams.set("aff_sub", aff_sub);
  u.searchParams.set("source", source);
  return u.toString();
}

/** The general link (home page, scoreboard). */
export function generalLink(aff_sub: string, source: "site" | "youtube" = "site") {
  return withCodes(`${TV}/`, aff_sub, source);
}

/**
 * The stock's chart page. Only a ticker we've checked resolves to a real TradingView page gets a
 * symbol link; anything else (unchecked or no page) gets the general link instead.
 */
export function chartLink(ticker: string, receiptNo: number, source: "site" | "youtube", symbols: SymbolMap = loadSymbols()) {
  const s = symbols[ticker.toUpperCase()];
  return withCodes(s?.path ? `${TV}${s.path}` : `${TV}/`, sub(receiptNo), source);
}

/**
 * Check each ticker once: /symbols/TICKER/ redirects to the exchange page (NASDAQ-MSFT) when it exists
 * and answers 404 when it doesn't. Runs in GitHub Actions (this needs the network).
 */
export async function checkSymbols(tickers: string[], fetchImpl: typeof fetch = fetch): Promise<SymbolMap> {
  const map = loadSymbols();
  for (const t of [...new Set(tickers.map((x) => x.toUpperCase()))]) {
    if (map[t]) continue;
    try {
      const res = await fetchImpl(`${TV}/symbols/${encodeURIComponent(t).replace(/%2E/g, ".")}/`, {
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0 (compatible; CongressReceipts link check)" },
      });
      const p = new URL(res.url).pathname;
      if (res.status === 200 && /^\/symbols\/[A-Z0-9.:_-]+\/$/i.test(p)) map[t] = { path: p, checkedAt: new Date().toISOString() };
      else if (res.status === 404) map[t] = { path: null, checkedAt: new Date().toISOString() };
      else log(`tradingview ${t}: ${res.status}, will try again next run`);
    } catch (e) {
      log(`tradingview ${t}: ${String(e).slice(0, 120)}, will try again next run`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  writeJson(FILE(), map);
  return map;
}

/** Plain-English disclosure shown next to every paid link. */
export const DISCLOSURE =
  "Paid link: TradingView pays us if you sign up for a paid TradingView plan through this link. It has no effect on which trades we show. TradingView is a charting site; nothing here is advice.";

/** Same disclosure, for video descriptions. */
export const DESCRIPTION_DISCLOSURE = "Paid link: TradingView pays us if you sign up for a paid plan through it. It has no effect on which trades we show.";
