import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { Filing, ParsedFiling } from "../types.js";
import { log, path, readJson, writeJson } from "../lib/util.js";
import { parsePtrText, usDate } from "./ptr.js";

/**
 * House Clerk's free bulk disclosure files: one yearly index (zip with XML), one PDF per report.
 * We ask politely: a clear user agent, one request at a time, a pause between PDFs, and every
 * parsed report is cached so it is fetched once, ever.
 */

export const CLERK = "https://disclosures-clerk.house.gov/public_disc";
export const USER_AGENT = "CongressReceipts/0.1 (public-interest news; https://github.com/houstoninvestments-jpg/congress-receipts)";
const PAUSE_MS = 1500;
const CACHE = () => process.env.PTR_CACHE_FILE || path("data/house/ptrs.json");

export const indexUrl = (year: number) => `${CLERK}/financial-pdfs/${year}FD.zip`;
export const pdfUrl = (year: number, docId: string) => `${CLERK}/ptr-pdfs/${year}/${docId}.pdf`;

export function parseIndexXml(xml: string, year: number): Filing[] {
  const doc = new XMLParser({ parseTagValue: false }).parse(xml);
  const members = [doc?.FinancialDisclosure?.Member ?? []].flat();
  return members
    .filter((m: any) => m.FilingType === "P" && m.DocID && m.FilingDate)
    .map((m: any) => ({
      docId: String(m.DocID),
      year: Number(m.Year) || year,
      prefix: String(m.Prefix ?? ""),
      first: String(m.First ?? ""),
      last: String(m.Last ?? ""),
      suffix: String(m.Suffix ?? ""),
      stateDst: String(m.StateDst ?? ""),
      filingDate: usDate(String(m.FilingDate).split("/").map((p: string) => p.padStart(2, "0")).join("/")),
      pdfUrl: pdfUrl(Number(m.Year) || year, String(m.DocID)),
    }));
}

async function get(url: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const res = await fetchImpl(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchIndex(year: number, fetchImpl: typeof fetch = fetch): Promise<Filing[]> {
  const files = unzipSync(await get(indexUrl(year), fetchImpl));
  const name = Object.keys(files).find((f) => f.toLowerCase().endsWith(".xml"));
  if (!name) throw new Error(`${year}FD.zip has no XML index`);
  return parseIndexXml(strFromU8(files[name]).replace(/^﻿/, ""), year);
}

export function pdfToText(pdf: Uint8Array, workDir: string, id: string): string {
  mkdirSync(workDir, { recursive: true });
  const file = join(workDir, `${id}.pdf`);
  writeFileSync(file, pdf);
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
}

export type PtrCache = Record<string, ParsedFiling>;
export const loadCache = (): PtrCache => readJson<PtrCache>(CACHE(), {});
export const saveCache = (c: PtrCache) => writeJson(CACHE(), c);

/**
 * Bring the cache up to date: read this year's index (and last year's in January),
 * then fetch and parse every report not seen before, newest first, up to `max` per run.
 */
export async function refreshHouse(opts: { now?: Date; max?: number; fetchImpl?: typeof fetch; workDir?: string } = {}) {
  const now = opts.now ?? new Date();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const year = now.getUTCFullYear();
  const years = now.getUTCMonth() === 0 ? [year - 1, year] : [year];
  const cache = loadCache();
  const filings: Filing[] = [];
  for (const y of years) filings.push(...(await fetchIndex(y, fetchImpl)));
  const fresh = filings.filter((f) => !cache[f.docId]).sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const todo = fresh.slice(0, opts.max ?? 60);
  const workDir = opts.workDir ?? path("work/pdfs");
  let n = 0;
  for (const f of todo) {
    try {
      const text = pdfToText(await get(f.pdfUrl, fetchImpl), workDir, f.docId);
      cache[f.docId] = parsePtrText(f, text, now);
    } catch (e) {
      log(`ptr ${f.docId}: ${String(e).slice(0, 160)}`);
      continue; // tried again next run
    }
    n++;
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  saveCache(cache);
  log(`house: ${filings.length} reports in the index, ${fresh.length} new, ${n} parsed this run`);
  return { indexed: filings.length, fresh: fresh.length, parsed: n, cache };
}

export const hasCache = () => existsSync(CACHE());
