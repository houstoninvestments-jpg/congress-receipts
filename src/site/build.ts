import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Receipt } from "../types.js";
import { config } from "../lib/config.js";
import { loadLedger, published } from "../lib/ledger.js";
import { path, today } from "../lib/util.js";
import { longDate } from "../receipt/facts.js";
import { scoreboard } from "../receipt/scoreboard.js";
import { CSS, boardBlock, esc, page, receiptCard, receiptPage } from "./templates.js";
import { privacyPage, termsPage } from "./legal.js";

const pad3 = (n: number) => String(n).padStart(3, "0");

function out(dir: string, rel: string, content: string) {
  const f = join(dir, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, content);
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B0B0C"/><path d="M18 10h28v44l-5-4-5 4-4-4-4 4-5-4-5 4z" fill="#F7F4EC"/><rect x="23" y="20" width="18" height="4" fill="#111"/><rect x="23" y="29" width="18" height="4" fill="#111"/><rect x="23" y="38" width="11" height="4" fill="#FFC531"/></svg>`;

const listItem = (r: Receipt, root: string) =>
  `<a href="${root}receipt/${r.slug}/"><b>Receipt No. ${pad3(r.number)}</b>: ${esc(`${r.facts.memberTitle} ${r.facts.memberName}`)} (${r.facts.partyLetter}-${esc(r.facts.state)}) bought ${esc(r.facts.ticker)}<small>${esc(longDate(r.date))}${r.facts.stamp ? ` · ${esc(r.facts.stamp)}` : ""}</small></a>`;

function homePage(eps: Receipt[]) {
  const c = config();
  const last = eps.at(-1);
  const year = Number(today(c.cadence.timezone).slice(0, 4));
  const aff = c.affiliate;
  const nl = c.newsletter;
  const body = `
<h1>${esc(c.channel.tagline)}</h1>
<p class="lede">Each day: one trade a member of Congress reported, the receipt, and what the stock did next to the S&amp;P 500. Facts and numbers only.</p>
${
  last
    ? `<h2>Today's receipt</h2>
<p><b>${esc(last.script.title)}</b></p>
${last.facts.stamp ? `<span class="stamp">${esc(last.facts.stamp)}</span>` : ""}
${receiptCard(last)}
<p class="lede">${esc(last.script.resultSay)}</p>
<a class="btn" href="receipt/${last.slug}/">See the filing and the math</a>`
    : `<div class="card"><p><b>The first receipt lands soon.</b></p><p>Every receipt comes straight from a filing with the U.S. House Clerk. Each one links to the filing itself.</p></div>`
}
<h2>Scoreboard</h2>
${boardBlock(scoreboard(eps, year))}
${eps.length > 1 ? `<h2>Recent receipts</h2><div class="list">${[...eps].reverse().slice(1, 8).map((e) => listItem(e, "")).join("\n")}</div><p><a href="receipts/">See every receipt</a></p>` : ""}

<section id="newsletter"${nl.enabled && nl.formAction ? "" : " hidden"}>
<h2>${esc(nl.name)}</h2>
<p>${esc(nl.blurb)}</p>
<form method="post" action="${esc(nl.formAction)}">
<input type="email" name="email" placeholder="you@example.com" autocomplete="email" required aria-label="Email address">
<button class="btn" type="submit" style="width:100%;background:transparent;color:inherit;font:inherit;font-weight:800">Send me the weekly receipts</button>
</form>
</section>

<section id="paid-link" class="card"${aff.enabled && aff.url ? "" : " hidden"}>
<p><span class="paid">${esc(aff.label)}</span></p>
<p><b>${esc(aff.name)}</b></p><p>${esc(aff.blurb)}</p>
<a class="btn" href="${esc(aff.url)}" rel="sponsored noopener">See it</a>
<p class="small">We earn money if you sign up through this link. It has no effect on which trades we show.</p>
</section>`;
  return page({ title: `${c.channel.name}: stock trades by members of Congress, from the filings`, description: c.channel.tagline, body, root: "", canonical: `${c.site.baseUrl}/` });
}

function receiptsPage(eps: Receipt[]) {
  const body = `<h1>Every receipt</h1>
${eps.length ? `<div class="list">${[...eps].reverse().map((e) => listItem(e, "../")).join("\n")}</div>` : "<p>The first receipt lands soon.</p>"}`;
  return page({ title: "Every receipt | Congress Receipts", description: "Every stock trade we have covered, newest first, each linked to its filing.", body, root: "../", canonical: `${config().site.baseUrl}/receipts/` });
}

function boardPage(eps: Receipt[]) {
  const c = config();
  const year = Number(today(c.cadence.timezone).slice(0, 4));
  const body = `<h1>Scoreboard ${year}</h1>${boardBlock(scoreboard(eps, year))}
<p>"Average vs S&amp;P 500" is the stock's price change minus the S&amp;P 500's price change over the same days, averaged over that party's receipts. It covers only the trades we showed, not every trade members made.</p>`;
  return page({ title: `Scoreboard ${year} | Congress Receipts`, description: "Democrats and Republicans side by side, from the receipts we posted this year.", body, root: "../", canonical: `${c.site.baseUrl}/scoreboard/` });
}

function howPage() {
  const body = `<h1>How we do it</h1>
<h2>Where trades come from</h2>
<p>Members of the House must report stock trades in a "periodic transaction report". The House Clerk posts these for free. We read the Clerk's yearly list, open each new report, and read its rows.</p>
<p>Scanned paper reports, and any row we can't read cleanly, are skipped. We never guess.</p>
<h2>How we pick one</h2>
<p>We look at purchases of listed stocks, at least two weeks old, so there is a result to show. Bigger filed amounts and newer filings come first. We don't look at party to pick a trade.</p>
<p>One rule uses party: over any 7 days, Democrat and Republican receipts stay within one of each other. If a pick would break that, we take the next trade instead.</p>
<h2>The numbers</h2>
<p>The amount is the range on the filing. The stock's change runs from its first close on or after the trade date to the latest close. The S&amp;P 500 is measured over the exact same days, using SPY. Every receipt page shows the math.</p>
<p>A report is due no later than 45 days after the trade (the STOCK Act). Days late = filed date − trade date − 45.</p>
<h2>Checks</h2>
<p>Code checks every number against the filing and the prices. Then two separate AI reviews check it again. If any check is unsure, we skip that trade.</p>
<h2>Senate</h2>
<p>For now we cover the House only. The Senate's site asks each visitor to accept terms before searching, so we don't collect from it automatically.</p>`;
  return page({ title: "How we do it | Congress Receipts", description: "Where the trades come from, how we pick one, and how the math works.", body, root: "../", canonical: `${config().site.baseUrl}/how/` });
}

export async function buildSite(opts: { dryRun?: boolean; dir?: string } = {}) {
  const dir = opts.dir ?? path("site/dist");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  const ledger = loadLedger();
  // Public site: published receipts only. Test renders never appear on it.
  const eps = opts.dryRun ? ledger.receipts : published(ledger);
  const c = config();
  const pages: string[] = [];
  const add = (rel: string, html: string) => {
    out(dir, rel, html);
    pages.push(rel);
  };
  out(dir, "assets/site.css", CSS);
  copyFileSync(path("node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"), join(dir, "assets/inter.woff2"));
  out(dir, "favicon.svg", FAVICON);
  add("index.html", homePage(eps));
  add("receipts/index.html", receiptsPage(eps));
  add("scoreboard/index.html", boardPage(eps));
  add("how/index.html", howPage());
  add("privacy/index.html", privacyPage(c, "../"));
  add("terms/index.html", termsPage(c, "../"));
  for (const r of eps) add(`receipt/${r.slug}/index.html`, receiptPage(r, "../../", r.youtubeId ? `https://www.youtube.com/shorts/${r.youtubeId}` : undefined));
  add("404.html", page({ title: "Not found | Congress Receipts", description: "Page not found.", body: `<h1>Not found</h1><p><a href="/">Go to today's receipt</a></p>`, root: "/" }));
  out(dir, "robots.txt", `User-agent: *\nAllow: /\nDisallow: /auth/\n`);
  out(dir, ".nojekyll", "");
  return { dir, pages };
}
