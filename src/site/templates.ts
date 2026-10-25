import type { Receipt } from "../types.js";
import { config } from "../lib/config.js";
import { path, readJson } from "../lib/util.js";
import { longDate } from "../receipt/facts.js";
import type { Side } from "../receipt/scoreboard.js";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad3 = (n: number) => String(n).padStart(3, "0");
const signed = (x: number, unit = "%") => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}${unit}`;

/** The channel link, from data/youtube-channel.json (written by the daily job). Plain text, no logo. */
export function youtubeChannelUrl(): string | null {
  const c = readJson<{ id?: string; handle?: string }>(process.env.YOUTUBE_CHANNEL_FILE || path("data/youtube-channel.json"), {});
  if (c.handle) return `https://www.youtube.com/${c.handle.startsWith("@") ? c.handle : "@" + c.handle}`;
  if (c.id) return `https://www.youtube.com/channel/${c.id}`;
  return null;
}

/** Same look as the Shorts: near-black, paper-white receipt, one gold accent. No party colors. */
export const CSS = `
@font-face{font-family:Inter;src:url(inter.woff2) format("woff2");font-weight:100 900;font-display:swap}
:root{--bg:#0B0B0C;--ink:#FFFFFF;--dim:#B4B8BF;--faint:#7A7F87;--paper:#F7F4EC;--paperInk:#111;--paperDim:#55524B;--gold:#FFC531;--card:#151619;--line:#2A2C30;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:19px/1.6 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-x:hidden}
main{max-width:680px;margin:0 auto;padding:0 16px 64px}
a{color:inherit;text-underline-offset:3px}
p{margin:.6em 0}
h1{font-size:2em;line-height:1.1;font-weight:900;letter-spacing:-.02em;margin:.5em 0 .3em}
h2{font-size:1.3em;font-weight:900;margin:1.8em 0 .6em}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 0 6px}
.brand{font-weight:900;letter-spacing:.14em;font-size:.82em;text-decoration:none;text-transform:uppercase;white-space:nowrap}
.brand b{color:var(--gold)}
.tag{font-weight:800;letter-spacing:.06em;font-size:.8em;color:var(--dim);text-transform:uppercase;white-space:nowrap}
.lede{font-size:1.12em;font-weight:600}
.small{font-size:.86em;color:var(--dim)}
.notadvice{font-weight:800;border:2px solid var(--line);border-radius:14px;padding:12px 14px;text-align:center}
.receipt{background:var(--paper);color:var(--paperInk);border-radius:16px;padding:18px 20px;margin:16px 0;box-shadow:0 18px 50px rgba(0,0,0,.5)}
.receipt .head{display:flex;justify-content:space-between;gap:10px;align-items:center;border-bottom:3px solid var(--paperInk);padding-bottom:8px;font-weight:900;font-size:.78em;letter-spacing:.08em;flex-wrap:wrap}
.receipt .from{background:var(--gold);color:#111;border-radius:6px;padding:2px 8px;font-weight:800;letter-spacing:0;white-space:nowrap}
.receipt dl{margin:0}
.receipt .row{display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:2px dashed #CFCABD}
.receipt dt{color:var(--paperDim);font-weight:600;white-space:nowrap}
.receipt dd{margin:0;font-weight:800;text-align:right}
.receipt .foot{font-size:.8em;color:var(--paperDim);padding-top:8px}
.stamp{display:inline-block;color:var(--gold);border:4px solid var(--gold);border-radius:12px;padding:2px 14px;font-weight:900;letter-spacing:.06em;transform:rotate(-3deg);margin:6px 0}
.math{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin:12px 0;overflow-wrap:anywhere}
.math table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.math td{padding:6px 0;border-bottom:1px solid var(--line);vertical-align:top}
.math td:last-child{text-align:right;font-weight:800}
.board{display:flex;gap:12px}
.board>div{flex:1;border:2px solid var(--ink);border-radius:16px;padding:14px;text-align:center}
.board .n{font-size:2.6em;font-weight:900;line-height:1.1}
.board .v{font-size:1.4em;font-weight:900;color:var(--gold)}
.list a{display:block;padding:12px 0;border-bottom:1px solid var(--line);text-decoration:none}
.list small{color:var(--dim);display:block}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin:16px 0}
.paid{font-size:.78em;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--dim);border-radius:6px;padding:1px 6px;color:var(--dim)}
.btn{display:block;text-align:center;border:2px solid var(--ink);border-radius:14px;padding:14px 16px;font-weight:800;text-decoration:none;margin:12px 0}
input[type=email]{width:100%;font:inherit;padding:12px;border-radius:12px;border:2px solid var(--line);background:var(--card);color:var(--ink)}
footer{margin-top:56px;padding-top:18px;border-top:1px solid var(--line);font-size:.86em;color:var(--dim)}
footer a{color:var(--ink)}
@media (min-width:760px){body{font-size:20px}h1{font-size:2.4em}}
`;

export function topBar(root: string, right = "") {
  return `<header class="top"><a class="brand" href="${root}">Congress <b>Receipts</b></a>${right ? `<span class="tag">${esc(right)}</span>` : ""}</header>`;
}

export function page(o: { title: string; description: string; body: string; root: string; canonical?: string; top?: string }) {
  const c = config();
  const yt = youtubeChannelUrl();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
${o.canonical ? `<link rel="canonical" href="${esc(o.canonical)}">` : ""}
<meta property="og:site_name" content="Congress Receipts">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<link rel="icon" href="${o.root}favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#0B0B0C">
<link rel="stylesheet" href="${o.root}assets/site.css">
</head>
<body>
<main>
${o.top ?? topBar(o.root)}
${o.body}
<p class="notadvice">${esc(c.channel.notAdvice)}</p>
<footer>
<p><a href="${o.root}">Today</a> · <a href="${o.root}receipts/">All receipts</a> · <a href="${o.root}scoreboard/">Scoreboard</a> · <a href="${o.root}how/">How we do it</a> · <a href="${o.root}privacy/">Privacy</a> · <a href="${o.root}terms/">Terms</a>${yt ? ` · <a href="${esc(yt)}" rel="noopener">Watch on YouTube</a>` : ""}</p>
<p>${esc(c.channel.notAdvice)} We never sell data or alerts.</p>
</footer>
</main>
</body>
</html>
`;
}

export function receiptCard(r: Receipt) {
  const f = r.facts;
  const owner: Record<string, string> = { "the member": "Member", "a spouse": "Spouse", jointly: "Joint", "a dependent child": "Dependent child" };
  const rows: [string, string][] = [
    ["Member", `${f.memberTitle} ${f.memberName}`],
    ["Party, state", `${f.party} · ${f.stateName}`],
    ["Stock", `${f.companyFull} (${f.ticker})`],
    ["Owner", owner[f.owner] ?? "Member"],
    ["Amount (range)", f.amountText],
    ["Trade date", longDate(f.tradeDate)],
    ["Filed", longDate(f.filedDate)],
  ];
  return `<div class="receipt"><div class="head"><span>PERIODIC TRANSACTION REPORT</span><span class="from">From official filing</span></div>
<dl>${rows.map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
<div class="foot">U.S. House Clerk · Filing ID ${esc(r.docId)} · <a href="${esc(f.pdfUrl)}" rel="noopener">Open the filing (PDF)</a></div></div>`;
}

/** Every number on the page, with where it came from and how it was worked out. */
export function mathBlock(r: Receipt) {
  const f = r.facts;
  const p = f.prices;
  const rows: [string, string][] = [];
  rows.push(["Amount on the filing", `${f.amountText} (a range, not an exact figure)`]);
  if (f.amountMid !== null) rows.push(["Midpoint of the range", `$${f.amountMid.toLocaleString("en-US")}`]);
  rows.push(["Days from trade to filing", `${f.filedDate} − ${f.tradeDate} = ${f.daysToFile} days`]);
  rows.push(["STOCK Act deadline", "45 days after the trade"]);
  rows.push(["Days late", f.daysLate > 0 ? `${f.daysToFile} − 45 = ${f.daysLate} days` : "0 (on time)"]);
  if (p) {
    rows.push([`${p.stock.symbol} close ${p.stock.start.date}`, `$${p.stock.start.close.toFixed(2)}`]);
    rows.push([`${p.stock.symbol} close ${p.stock.end.date}`, `$${p.stock.end.close.toFixed(2)}`]);
    rows.push([`${p.stock.symbol} change`, `${p.stock.end.close.toFixed(2)} ÷ ${p.stock.start.close.toFixed(2)} − 1 = ${signed(p.stock.changePct)}`]);
    rows.push([`SPY close ${p.market.start.date}`, `$${p.market.start.close.toFixed(2)}`]);
    rows.push([`SPY close ${p.market.end.date}`, `$${p.market.end.close.toFixed(2)}`]);
    rows.push(["S&P 500 (SPY) change", `${p.market.end.close.toFixed(2)} ÷ ${p.market.start.close.toFixed(2)} − 1 = ${signed(p.market.changePct)}`]);
    rows.push(["Stock vs S&P 500", `${signed(p.stock.changePct)} − ${signed(p.market.changePct)} = ${signed(f.excessPts!, " pts")}`]);
  }
  return `<div class="math"><table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
${p ? `<p class="small">Closing prices, split-adjusted, price change only (no dividends). Start is the first close on or after the trade date. Source: <a href="${esc(p.source.url)}" rel="noopener">${esc(p.source.name)}</a>.</p>` : `<p class="small">Price check pending.</p>`}</div>`;
}

export function boardBlock(b: { year: number; dem: Side; rep: Side }) {
  const v = (s: Side) => (s.avgVsMarket === null ? "—" : signed(s.avgVsMarket, " pts"));
  return `<div class="board"><div><b>Democrats</b><div class="n">${b.dem.receipts}</div><div class="small">receipts</div><div class="v">${v(b.dem)}</div><div class="small">average vs S&amp;P 500</div></div>
<div><b>Republicans</b><div class="n">${b.rep.receipts}</div><div class="small">receipts</div><div class="v">${v(b.rep)}</div><div class="small">average vs S&amp;P 500</div></div></div>
<p class="small">Receipts we posted in ${b.year}. Each one is measured on its own video's date. We keep the two parties within one receipt of each other over any 7 days.</p>`;
}

export function receiptPage(r: Receipt, root: string, youtubeUrl?: string) {
  const c = config();
  const f = r.facts;
  const body = `
<p class="small" style="margin:.8em 0 0">${esc(longDate(r.date))}</p>
<h1 style="margin-top:.15em">${esc(r.script.title)}</h1>
${f.stamp ? `<span class="stamp">${esc(f.stamp)}</span>` : ""}
${receiptCard(r)}
<h2>What happened next</h2>
<p class="lede">${esc(r.script.resultSay)}</p>
<h2>The math</h2>
${mathBlock(r)}
${youtubeUrl ? `<a class="btn" href="${esc(youtubeUrl)}" rel="noopener">Watch the video on YouTube</a>` : ""}
<h2>Sources</h2>
<ul><li><a href="${esc(f.pdfUrl)}" rel="noopener">The filing, from the U.S. House Clerk</a></li>${f.prices ? `<li><a href="${esc(f.prices.source.url)}" rel="noopener">${esc(f.prices.source.name)}</a></li>` : ""}<li><a href="https://github.com/unitedstates/congress-legislators" rel="noopener">Party and state: congress-legislators (public domain)</a></li></ul>
<p class="small">The words in our video were written by ${r.writer === "template" ? "our fixed template" : "an AI model"} and checked by ${esc(r.review)}. The narration is an AI voice.</p>`;
  return page({
    top: topBar(root, `Receipt No. ${pad3(r.number)}`),
    title: `${r.script.title} | Congress Receipts`,
    description: r.script.description,
    body,
    root,
    canonical: `${c.site.baseUrl}/receipt/${r.slug}/`,
  });
}
