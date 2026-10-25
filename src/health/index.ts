import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadLedger, published } from "../lib/ledger.js";
import { path, readJson } from "../lib/util.js";
import type { RunReport } from "../pipeline/daily.js";
import { balanced } from "../receipt/select.js";

export interface HealthInput {
  lastRun: RunReport | null;
  dryRun: RunReport | null;
  ledger: ReturnType<typeof loadLedger>;
  now?: Date;
}

/** Everything that counts as broken. An empty list means stay quiet. */
export function findProblems({ lastRun, dryRun, ledger, now = new Date() }: HealthInput): string[] {
  const out: string[] = [];
  const run = [lastRun, dryRun].filter(Boolean).sort((a, b) => b!.date.localeCompare(a!.date))[0];
  if (run?.status === "failed") out.push(`The ${run.dryRun ? "dry run" : "daily run"} on ${run.date} failed: ${run.errors[0]?.split("\n")[0] ?? "unknown error"}`);
  if (ledger.firstUploadCheck?.locked) out.push("YouTube has locked uploads to private. The audit answers are ready in docs/youtube-audit-request.md; the form must be sent from the channel owner's Google account.");
  if (!balanced(ledger)) out.push("Party balance broke: some 7-day window has Democrat and Republican receipts more than one apart.");
  const live = ledger.firstUploadCheck && !ledger.firstUploadCheck.locked;
  const last = published(ledger).at(-1);
  if (live && last) {
    const hours = (now.getTime() - Date.parse(`${last.date}T23:59:00Z`)) / 3_600_000;
    if (hours > 72) out.push(`No new Short in ${Math.round(hours)} hours (last: Receipt No. ${last.number} on ${last.date}).`);
  }
  const recentSkips = ledger.skipped.filter((s) => (now.getTime() - Date.parse(s.date)) / 86_400_000 <= 4);
  if (live && new Set(recentSkips.map((s) => s.date)).size >= 3 && !published(ledger).some((e) => (now.getTime() - Date.parse(e.date)) / 86_400_000 <= 4))
    out.push(`Every trade was skipped for 3 days or more. Last reason: ${recentSkips.at(-1)?.reason}`);
  return out;
}

/** Exit 0 and say nothing when healthy. Exit 2 with an issue body when something broke. */
export async function health(): Promise<number> {
  const read = (f: string) => (existsSync(path(f)) ? readJson<RunReport>(path(f)) : null);
  const problems = findProblems({ lastRun: read("data/last-run.json"), dryRun: read("data/dry-run/last-run.json"), ledger: loadLedger() });
  if (!problems.length) return 0;
  const body = `Congress Receipts health check found ${problems.length} problem${problems.length > 1 ? "s" : ""}:\n\n${problems.map((p) => `- ${p}`).join("\n")}\n\nThis issue closes itself when the next check passes.`;
  mkdirSync(path("work"), { recursive: true });
  writeFileSync(path("work/health-issue.md"), body);
  console.log(body);
  return 2;
}
