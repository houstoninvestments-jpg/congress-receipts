import { appendFileSync, mkdirSync } from "node:fs";
import { AnthropicLLM } from "./llm/client.js";
import { runDaily } from "./pipeline/daily.js";
import { oauthUploader } from "./publish/youtube.js";
import { sourceFromEnv } from "./prices/index.js";
import { env, log, path, writeJson } from "./lib/util.js";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (f: string) => rest.includes(f);
const arg = (f: string) => {
  const i = rest.indexOf(f);
  return i >= 0 ? rest[i + 1] : undefined;
};
const note = (title: string, msg: string) => console.log(process.env.GITHUB_ACTIONS ? `::notice title=${title}::${msg.replace(/[\r\n]+/g, " ").slice(0, 900)}` : `${title}: ${msg}`);

async function main() {
  switch (cmd) {
    case "daily": {
      const dryRun = flag("--dry-run");
      if (dryRun) {
        // Dry runs keep their own ledger so test numbering never touches the real channel.
        process.env.LEDGER_FILE ??= path("data/dry-run/ledger.json");
        mkdirSync(path("data/dry-run"), { recursive: true });
      }
      const prices = sourceFromEnv();
      const report = await runDaily({
        dryRun,
        llm: env("ANTHROPIC_API_KEY") ? new AnthropicLLM() : null,
        prices,
        uploader: dryRun ? undefined : oauthUploader(),
        offline: flag("--offline"),
        workDir: arg("--work"),
      });
      log(`result: ${report.status}${report.videoFile ? ` ${report.videoFile}` : ""}`);
      note("Run result", `${report.status}${report.errors[0] ? ` | ${report.errors[0]}` : ""}${report.warnings.length ? ` | warnings: ${report.warnings.join("; ")}` : ""}`);
      for (const [k, v] of Object.entries(report.summary)) note(k, v);
      if (process.env.GITHUB_OUTPUT && report.videoFile) appendFileSync(process.env.GITHUB_OUTPUT, `video=${report.videoFile}\n`);
      if (report.status === "failed") {
        console.error(report.errors.join("\n"));
        process.exitCode = 1;
      }
      break;
    }
    case "fetch": {
      const { refreshMembers } = await import("./data/members.js");
      const { refreshHouse } = await import("./data/house.js");
      const m = await refreshMembers();
      const h = await refreshHouse({ max: Number(arg("--max") ?? 60) });
      note("Data", `${m.length} House members; ${h.indexed} reports indexed, ${h.fresh} new, ${h.parsed} parsed`);
      break;
    }
    case "site": {
      // --test-preview builds from the dry-run ledger, for local checks only. Never deploy that output.
      const preview = flag("--test-preview");
      if (preview) process.env.LEDGER_FILE ??= path("data/dry-run/ledger.json");
      if (process.env.TV_CHECK === "1") {
        // Check each receipt's TradingView chart page exists before linking to it (needs the network).
        const { checkSymbols } = await import("./site/affiliate.js");
        const { loadLedger } = await import("./lib/ledger.js");
        await checkSymbols(loadLedger().receipts.map((x) => x.facts.ticker));
      }
      const { buildSite } = await import("./site/build.js");
      const r = await buildSite({ dryRun: preview, dir: preview ? path("work/site-preview") : undefined });
      log(`site: ${r.pages.length} pages in ${r.dir}`);
      break;
    }
    case "site-target": {
      // First step of the daily job: Cloudflare Pages once the token is set, GitHub Pages until then.
      const { pickSiteTarget } = await import("./site/cloudflare.js");
      const t = await pickSiteTarget();
      const project = t.kind === "cloudflare" ? t.project : "";
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `kind=${t.kind}\nbase_url=${t.baseUrl}\nproject=${project}\naccount=${t.kind === "cloudflare" ? t.account : ""}\n`);
      if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `SITE_BASE_URL=${t.baseUrl}\n`);
      note("Website address", `${t.kind} ${t.baseUrl}`);
      break;
    }
    case "auth-arm": {
      const { armAuthFunction, authState } = await import("./auth/store.js");
      note("YouTube authorize link", await armAuthFunction());
      const s = await authState().catch(() => ({ connected: false }) as const);
      note("YouTube connected", s.connected ? `yes: ${"channelTitle" in s ? s.channelTitle : ""}` : "not yet");
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `youtube=${s.connected ? "connected" : "no"}\n`);
      break;
    }
    case "auth-reset": {
      const { resetAuth } = await import("./auth/store.js");
      await resetAuth();
      note("YouTube", "connection cleared; the authorize link works again");
      break;
    }
    case "channel-info": {
      const { channelInfo } = await import("./publish/youtube.js");
      const c = await channelInfo(oauthUploader());
      writeJson(path("data/youtube-channel.json"), c);
      note("YouTube channel", `${c.title} ${c.handle || c.id}`);
      break;
    }
    case "learn": {
      const { learn } = await import("./learn/index.js");
      await learn(oauthUploader());
      break;
    }
    case "health": {
      const { health } = await import("./health/index.js");
      process.exitCode = await health();
      break;
    }
    default:
      console.log("commands: daily [--dry-run] [--offline] | fetch | site [--test-preview] | site-target | auth-arm | auth-reset | channel-info | learn | health");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
