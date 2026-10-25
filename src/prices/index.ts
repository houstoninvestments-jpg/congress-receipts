import type { PriceLeg, PricePoint, PriceResult } from "../types.js";
import { env, path, readJson, writeJson } from "../lib/util.js";

/**
 * Daily closing prices, split-adjusted, from a source whose terms allow public news use.
 * Which source is a founder decision (see docs/SETUP.md). Until one is licensed and its key
 * is set, live runs skip the price step and nothing is published.
 */

export interface PriceSource {
  id: string;
  name: string;
  url: string; // shown as the citation
  terms: string; // the terms page we rely on
  /** May this source's numbers appear in a published video or page? */
  publishable: boolean;
  closes(symbol: string, from: string, to: string): Promise<PricePoint[]>;
}

const CACHE = () => process.env.PRICE_CACHE_FILE || path("data/prices.json");
type Cache = Record<string, { fetchedAt: string; source: string; points: PricePoint[] }>;

/**
 * Marketstack end-of-day prices. Its pricing page lists "Commercial Use" from the Basic plan up
 * (the free plan says non-commercial). Set MARKETSTACK_API_KEY only on a commercial plan.
 */
export function marketstack(fetchImpl: typeof fetch = fetch): PriceSource {
  const key = env("MARKETSTACK_API_KEY");
  return {
    id: "marketstack",
    name: "Marketstack end-of-day prices",
    url: "https://marketstack.com",
    terms: "https://marketstack.com/pricing",
    publishable: Boolean(key),
    async closes(symbol, from, to) {
      if (!key) throw new Error("MARKETSTACK_API_KEY is not set");
      const q = new URLSearchParams({ access_key: key, symbols: symbol, date_from: from, date_to: to, limit: "1000" });
      const res = await fetchImpl(`https://api.marketstack.com/v2/eod?${q}`);
      if (!res.ok) throw new Error(`marketstack ${symbol} -> ${res.status}`);
      const j = (await res.json()) as { data?: { date: string; close: number; split_factor?: number; symbol?: string; volume?: number; exchange?: string }[] };
      const rows = (j.data ?? []).filter((r) => !r.symbol || r.symbol.toUpperCase() === symbol.toUpperCase());
      liquidityCheck(symbol, rows);
      return checkJumps(splitAdjust(rows.map((r) => ({ date: r.date.slice(0, 10), close: Number(r.close), splitFactor: r.split_factor }))), symbol);
    },
  };
}

/** Major U.S. exchanges (ISO market codes). Anything else, like over-the-counter markets, is skipped. */
export const US_EXCHANGES = new Set(["XNYS", "XNAS", "ARCX", "BATS", "XASE", "IEXG"]);
export const MIN_MEDIAN_VOLUME = 50_000;

/** Thin trading means unreliable closes: skip, never guess. Checks only what the source reports. */
export function liquidityCheck(symbol: string, rows: { volume?: number; exchange?: string }[]) {
  const ex = rows.map((r) => r.exchange).filter((x): x is string => Boolean(x));
  if (ex.length && !ex.some((e) => US_EXCHANGES.has(e.toUpperCase()))) throw new Error(`${symbol}: not on a major U.S. exchange (${ex[0]})`);
  const vols = rows.map((r) => r.volume).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  if (vols.length && vols[Math.floor(vols.length / 2)] < MIN_MEDIAN_VOLUME) throw new Error(`${symbol}: thinly traded (median ${vols[Math.floor(vols.length / 2)]} shares a day)`);
}

/** A one-day move over 40% after split adjustment means bad data (or an unlisted split): skip, never guess. */
export function checkJumps(points: PricePoint[], symbol: string): PricePoint[] {
  for (let i = 1; i < points.length; i++) {
    const r = points[i].close / points[i - 1].close;
    if (r > 1.4 || r < 0.6) throw new Error(`${symbol}: ${((r - 1) * 100).toFixed(0)}% in one day on ${points[i].date}; looks like bad data`);
  }
  return points;
}

/**
 * Scale raw closes so a split never looks like a crash or a jump.
 * splitFactor on a row = shares after / shares before, effective that day.
 */
export function splitAdjust(rows: { date: string; close: number; splitFactor?: number }[]): PricePoint[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  let factor = 1;
  const out: PricePoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    out.push({ date: sorted[i].date, close: +(sorted[i].close / factor).toFixed(4) });
    const sf = sorted[i].splitFactor ?? 1;
    if (sf && sf !== 1) factor *= sf;
  }
  return out.reverse();
}

/** Saved prices from a test file. Never publishable: dry runs and tests only. */
export function fixtureSource(file: string): PriceSource {
  const data = readJson<Record<string, PricePoint[]>>(file);
  return {
    id: "fixture",
    name: "Saved test prices",
    url: "",
    terms: "",
    publishable: false,
    async closes(symbol, from, to) {
      const pts = data[symbol];
      if (!pts) throw new Error(`no saved prices for ${symbol}`);
      return pts.filter((p) => p.date >= from && p.date <= to);
    },
  };
}

export function sourceFromEnv(): PriceSource | null {
  if (env("MARKETSTACK_API_KEY")) return marketstack();
  return null;
}

async function cachedCloses(src: PriceSource, symbol: string, from: string, to: string): Promise<PricePoint[]> {
  const cache = readJson<Cache>(CACHE(), {});
  const k = `${src.id}:${symbol}:${from}:${to}`;
  if (cache[k]) return cache[k].points;
  const points = await src.closes(symbol, from, to);
  if (src.publishable) {
    cache[k] = { fetchedAt: new Date().toISOString(), source: src.id, points };
    writeJson(CACHE(), cache);
  }
  return points;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** First close on or after the trade date, and the last close available. */
export function leg(symbol: string, points: PricePoint[], tradeDate: string): PriceLeg | null {
  const sorted = [...points].filter((p) => p.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const start = sorted.find((p) => p.date >= tradeDate);
  const end = sorted.at(-1);
  if (!start || !end || end.date <= start.date) return null;
  // A trade date with no close within 5 days means a halt or a bad symbol: skip, never guess.
  if ((Date.parse(start.date) - Date.parse(tradeDate)) / 86_400_000 > 5) return null;
  return { symbol, start, end, changePct: round1((end.close / start.close - 1) * 100) };
}

export async function priceResult(src: PriceSource, ticker: string, tradeDate: string, today: string): Promise<PriceResult | { error: string }> {
  try {
    const [s, m] = await Promise.all([cachedCloses(src, ticker, tradeDate, today), cachedCloses(src, "SPY", tradeDate, today)]);
    const stock = leg(ticker, s, tradeDate);
    const market = leg("SPY", m, tradeDate);
    if (!stock || !market) return { error: `no clean closes for ${ticker} or SPY from ${tradeDate}` };
    if (stock.start.date !== market.start.date || stock.end.date !== market.end.date) return { error: `${ticker} and SPY windows differ` };
    return { source: { name: src.name, url: src.url, terms: src.terms }, stock, market };
  } catch (e) {
    return { error: String(e).slice(0, 200) };
  }
}
