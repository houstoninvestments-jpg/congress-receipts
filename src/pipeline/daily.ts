import { join } from "node:path";
import type { CtaState, Facts, Ledger, Receipt, Script } from "../types.js";
import type { ReceiptProps } from "../../remotion/props.js";
import { config } from "../lib/config.js";
import { loadLedger, saveLedger, upsertReceipt } from "../lib/ledger.js";
import { log, pad3, path, slugify, today, writeJson } from "../lib/util.js";
import type { LLM } from "../llm/client.js";
import { loadCache, refreshHouse } from "../data/house.js";
import { loadMembers, refreshMembers } from "../data/members.js";
import { candidates, pickOrder, type Candidate } from "../receipt/select.js";
import { buildFacts, daysLate, longDate, shortDate } from "../receipt/facts.js";
import { scoreboard } from "../receipt/scoreboard.js";
import { priceResult, type PriceSource } from "../prices/index.js";
import { templateScript, videoTitle, write } from "../writer/index.js";
import { check, mechanicalCheck, spokenLines } from "../checker/index.js";
import { loadHooks, pickHook } from "../learn/hooks.js";
import { synthesize } from "../voice/index.js";
import { assertShort, extractCover, prepareTimeline, probe, readWindowChecks, renderShort } from "../render/index.js";
import { publishShort, recheckLock, uploadRequest, type Uploader } from "../publish/youtube.js";

export interface RunOptions {
  dryRun: boolean;
  llm: LLM | null; // null: no model key, dry run only (fixed wording, code checks only)
  prices: PriceSource | null; // null: no licensed price source yet (dry run only)
  uploader?: Uploader;
  offline?: boolean; // use the saved filings and members, fetch nothing
  workDir?: string;
}

export interface RunReport {
  date: string;
  dryRun: boolean;
  status: "published" | "rendered" | "skipped" | "failed";
  receipt?: number;
  videoFile?: string;
  youtubeId?: string;
  warnings: string[];
  errors: string[];
  steps: { step: string; ok: boolean; detail: string }[];
  summary: Record<string, string>;
}

/** Spread the three call-to-action states evenly so each can be measured. */
export function chooseCta(past: Receipt[], states: CtaState[] = ["none", "soft", "direct"]): CtaState {
  const window = past.slice(-9);
  const used = past.map((e) => e.cta);
  const counts = states.map((s) => ({ s, n: window.filter((e) => e.cta === s).length, lastAt: used.lastIndexOf(s) }));
  counts.sort((a, b) => a.n - b.n || a.lastAt - b.lastAt || states.indexOf(a.s) - states.indexOf(b.s));
  return counts[0].s;
}

const OWNER_CARD: Record<string, string> = { "the member": "Member", "a spouse": "Spouse", jointly: "Joint", "a dependent child": "Dependent child" };

export function receiptProps(r: Receipt, ledger: Ledger, opts: { testLabel: string; voiceLabel: string; timeline: ReceiptProps["timeline"] }): ReceiptProps {
  const f: Facts = r.facts;
  const cfg = config();
  const year = Number(r.date.slice(0, 4));
  return {
    number: r.number,
    card: {
      member: `${f.memberTitle} ${f.memberName}`,
      partyState: `${f.party} · ${f.stateName}`,
      owner: OWNER_CARD[f.owner] ?? "Member",
      stock: `${f.companyFull} (${f.ticker})`,
      amount: f.amountText,
      tradeDate: longDate(f.tradeDate),
      filedDate: longDate(f.filedDate),
      filingId: r.docId,
      late: f.daysLate > 0 ? `${f.daysLate} days past the 45-day deadline` : "",
    },
    result: {
      pending: !f.prices,
      stockLabel: f.ticker,
      stockPct: f.prices?.stock.changePct ?? null,
      marketPct: f.prices?.market.changePct ?? null,
      window: f.prices ? `Closing prices ${shortDate(f.prices.stock.start.date)} to ${longDate(f.prices.stock.end.date)}` : "",
      source: f.prices ? `Prices: ${f.prices.source.name}. S&P 500 as SPY.` : "",
    },
    stamp: f.stamp ?? "TEST RENDER",
    hook: r.script.hook,
    scoreboard: scoreboard(ledger.receipts.filter((x) => x.number !== r.number), year, r),
    timeline: opts.timeline,
    closer: cfg.channel.closer,
    cta: r.cta,
    notAdvice: cfg.channel.notAdvice,
    voiceLabel: opts.voiceLabel,
    testLabel: opts.testLabel,
  };
}

const late = (c: Candidate) => daysLate(c.txn.tradeDate, c.filing.filingDate) > 0;

export async function runDaily(opts: RunOptions): Promise<RunReport> {
  const cfg = config();
  const date = today(cfg.cadence.timezone);
  const report: RunReport = { date, dryRun: opts.dryRun, status: "failed", warnings: [], errors: [], steps: [], summary: {} };
  const step = (s: string, ok: boolean, detail: string) => {
    report.steps.push({ step: s, ok, detail });
    log(`${ok ? "ok  " : "FAIL"} ${s}: ${detail}`);
  };
  const work = opts.workDir ?? path("work", date);

  try {
    if (!opts.dryRun && (!opts.llm || !opts.prices?.publishable)) throw new Error("live runs need the writer and checker models and a licensed price source");
    const ledger = loadLedger();
    if (!opts.dryRun && ledger.receipts.some((r) => r.date === date && r.status === "published")) {
      step("cadence", true, "already published today");
      report.status = "skipped";
      return report;
    }
    if (!opts.dryRun && ledger.firstUploadCheck?.locked && opts.uploader) {
      const lock = await recheckLock(opts.uploader, ledger);
      saveLedger(ledger);
      step("upload lock", !lock.locked, lock.detail);
      if (lock.locked) {
        report.status = "skipped";
        report.warnings.push("uploads still locked private by Google (API audit pending); skipped before spending anything");
        return report;
      }
    }

    // 1. Filings and members
    if (!opts.offline) {
      const members = await refreshMembers();
      const house = await refreshHouse();
      step("data", true, `${members.length} House members; ${house.indexed} reports in the Clerk's index, ${house.parsed} new parsed`);
    }
    const cache = loadCache();
    const pool = candidates(cache, loadMembers(), ledger, date);
    let order = pickOrder(pool.list, ledger, date);
    if (!opts.prices) order = [...order.filter((c) => late(c)), ...order.filter((c) => !late(c))]; // dry run without prices: a late filing still gets a real stamp
    step("pick", order.length > 0, `${pool.list.length} purchases qualify, ${order.length} after the party-balance and repeat rules; set aside: ${JSON.stringify(pool.dropped)}`);
    if (!order.length) {
      report.status = "skipped";
      report.warnings.push("no trade qualified today");
      return report;
    }

    // 2. Prices, words, checks. Unsure means skip.
    const number = ledger.nextNumber;
    const hooks = loadHooks();
    const recent = ledger.receipts.slice(-3).map((r) => r.hookVariant).reverse();
    let chosen: { c: Candidate; facts: Facts; script: Script; hookId: string; review: string } | undefined;
    for (const c of order.slice(0, 8)) {
      let prices = null;
      if (opts.prices) {
        const p = await priceResult(opts.prices, c.txn.ticker!, c.txn.tradeDate, date);
        if ("error" in p) {
          step("prices", false, `${c.txn.ticker}: ${p.error}`);
          if (!opts.dryRun) ledger.skipped.push({ txnId: c.txn.id, date, reason: `prices: ${p.error}` });
          continue;
        }
        prices = p;
      }
      const facts = buildFacts(c.txn, c.filing, c.member, prices);
      const hook = pickHook(hooks, recent);
      let script = opts.llm ? await write(opts.llm, facts, number, hook) : templateScript(facts, number, hook.id);
      script.title = videoTitle(facts, number);
      let mech = mechanicalCheck(script, facts, number);
      if (!mech.ok && opts.llm) {
        script = await write(opts.llm, facts, number, hook, mech.problems, script);
        mech = mechanicalCheck(script, facts, number);
      }
      const verdict = await check(opts.llm, script, facts, number);
      step("check", verdict.pass, `${facts.memberName} / ${facts.ticker}: ${verdict.reason}`);
      if (verdict.pass) {
        chosen = { c, facts, script, hookId: hook.id, review: verdict.reviewed };
        break;
      }
      if (!opts.dryRun) ledger.skipped.push({ txnId: c.txn.id, date, reason: verdict.reason });
    }
    if (!chosen) {
      saveLedger(ledger);
      report.status = "skipped";
      report.warnings.push("no trade passed every check today; skipped");
      return report;
    }

    const { c, facts, script } = chosen;
    const r: Receipt = {
      number,
      date,
      txnId: c.txn.id,
      docId: c.txn.docId,
      bioguide: c.member.bioguide,
      party: c.member.party,
      facts,
      script,
      slug: `${pad3(number)}-${slugify(`${facts.memberName} ${facts.ticker}`, 60)}`,
      cta: chooseCta(ledger.receipts),
      hookVariant: chosen.hookId,
      status: "checked",
      writer: opts.llm ? cfg.models.writer : "template",
      review: chosen.review,
    };
    report.summary.receipt = `${facts.memberTitle} ${facts.memberName} (${facts.partyLetter}-${facts.state}) bought ${facts.ticker} ${facts.amountText}, traded ${facts.tradeDate}, filed ${facts.filedDate}, ${facts.daysLate} days late | ${facts.pdfUrl}`;
    report.summary.result = facts.prices ? `${facts.ticker} ${facts.prices.stock.changePct}% vs SPY ${facts.prices.market.changePct}% (${facts.prices.stock.start.date} to ${facts.prices.stock.end.date}), stamp ${facts.stamp}` : `no licensed price source yet; stamp ${facts.stamp ?? "none"}`;

    // 3. Voice and render
    const lines = spokenLines(script).map((text, i) => ({ id: ["hook", "receipt", "result", "stamp", "closer"][i], text }));
    const voice = synthesize(lines, join(work, "audio"));
    const publicDir = join(work, "public");
    const timeline = prepareTimeline(voice, publicDir);
    step("voice", true, `${voice.label}, ${(timeline.total / timeline.fps).toFixed(1)}s`);
    const props = receiptProps(r, ledger, { testLabel: opts.dryRun ? "TEST RENDER" : "", voiceLabel: "AI voice", timeline });
    writeJson(join(work, "props.json"), props);
    const videoFile = join(work, `receipt-${pad3(number)}${opts.dryRun ? "-test" : ""}.mp4`);
    await renderShort(props, publicDir, videoFile);
    const p = probe(videoFile);
    assertShort(p);
    step("render", true, `${videoFile} (${p.width}x${p.height}, ${p.seconds}s)`);
    const rw = readWindowChecks(videoFile, timeline.beats);
    if (rw.card > 0.01) throw new Error(`read window: ${(rw.card * 100).toFixed(1)}% of the filing card changed after it was up`);
    if (rw.result > 0.01) throw new Error(`stamp covered the result: ${(rw.result * 100).toFixed(1)}% of the numbers changed`);
    report.summary.readWindow = `filing card untouched (${(rw.card * 100).toFixed(2)}% changed), result untouched by the stamp (${(rw.result * 100).toFixed(2)}%)`;
    const cover = extractCover(videoFile, videoFile.replace(/\.mp4$/, "-cover.jpg"));
    r.status = "rendered";
    r.voice = voice.label;
    report.videoFile = videoFile;
    report.receipt = number;

    // 4. Publish
    const upload = uploadRequest(r, voice.label);
    writeJson(join(work, "upload-request.json"), upload);
    report.summary.title = upload.snippet.title;
    if (opts.dryRun) {
      step("publish", true, "dry run: upload request saved, nothing sent to YouTube");
      report.status = "rendered";
    } else {
      const res = await publishShort(opts.uploader!, r, videoFile, voice.label, ledger, cover.file);
      r.youtubeId = res.videoId;
      r.youtubePrivacy = res.privacy;
      r.status = res.lockedPrivate ? "rendered" : "published";
      report.youtubeId = res.videoId;
      report.status = res.lockedPrivate ? "rendered" : "published";
      report.summary.upload = `${res.videoId}, ${res.privacy}${res.lockedPrivate ? ", LOCKED private by Google" : ""}; ${res.thumbnail?.detail ?? ""}`;
      if (res.lockedPrivate) report.errors.push("first upload is locked private; audit answers prepared in docs/youtube-audit-request.md");
      step("publish", !res.lockedPrivate, res.detail);
    }
    upsertReceipt(ledger, r);
    ledger.nextNumber = number + 1;
    saveLedger(ledger);
    return report;
  } catch (e) {
    report.errors.push(String((e as Error)?.stack ?? e).slice(0, 1200));
    report.status = "failed";
    return report;
  } finally {
    writeJson(join(work, "run-report.json"), report);
    writeJson(path(opts.dryRun ? "data/dry-run/last-run.json" : "data/last-run.json"), report);
  }
}
