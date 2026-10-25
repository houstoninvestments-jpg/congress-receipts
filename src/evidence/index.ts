import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { config } from "../lib/config.js";
import { loadLedger } from "../lib/ledger.js";
import { path } from "../lib/util.js";
import { uploadRequest } from "../publish/youtube.js";

/**
 * Evidence for Google's YouTube API Services audit form, modeled on Scam or Not's docs/evidence:
 * live-site screenshots and terms PDF, plus diagrams, the upload record, and the API calls we make.
 * Nothing here may carry a key, token or email address; scanEvidence() checks every text it writes.
 */

/** Every Google API call in this codebase, by the names Google's docs use. Kept in one place so tests can check it against the code. */
export const API_CALLS = {
  data: [
    { method: "youtube.videos.insert", where: "src/publish/youtube.ts uploadVideo()", why: "Upload our own Short (resumable upload). Sets privacyStatus and containsSyntheticMedia." },
    { method: "youtube.videos.list", where: "src/publish/youtube.ts videoStatus()", why: "Read back the privacy status of a video we uploaded (part=status)." },
    { method: "youtube.videos.update", where: "src/publish/youtube.ts setPrivacy()", why: "Set the privacy status of a video we uploaded (part=status). Used once for the private-upload lock test." },
    { method: "youtube.thumbnails.set", where: "src/publish/youtube.ts setThumbnail()", why: "Set the first frame of our own video as its thumbnail." },
    { method: "youtube.channels.list", where: "src/publish/youtube.ts channelInfo(); functions/auth/youtube/callback.ts", why: "Read our own channel's ID, title and handle (mine=true, part=snippet): to verify the authorized channel is @CongressReceipts and to show a Watch on YouTube link." },
  ],
  analytics: [
    { method: "youtubeAnalytics.reports.query", where: "src/learn/index.ts report()", why: "Our own videos only (ids=channel==MINE, filters=video==ID): views, averageViewPercentage, and audienceWatchRatio by elapsedVideoTimeRatio." },
  ],
  scopes: [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
  ],
};

const SECRETISH = /sk-ant-[A-Za-z0-9_-]{10,}|ya29\.[0-9A-Za-z_-]{10,}|1\/\/0[0-9A-Za-z_-]{20,}|GOCSPX-[0-9A-Za-z_-]{10,}|AIza[0-9A-Za-z_-]{30,}|ghp_[0-9A-Za-z]{20,}|github_pat_|v1\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{20,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}/g;

/** Throws if any text that goes into an evidence file looks like a key, a token or an email address. */
export function scanEvidence(name: string, text: string) {
  const hits = (text.match(SECRETISH) ?? []).filter((h) => !/@example\.com$|@anthropic\.com$|users\.noreply\.github\.com$/.test(h));
  if (hits.length) throw new Error(`${name}: refusing to write, looks like a secret or email: ${hits.map((h) => h.slice(0, 12) + "…").join(", ")}`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function formAnswers(): string {
  const c = config();
  const lines = [
    `${c.channel.name}: YouTube API Services audit, API calls this project makes`,
    `Channel: ${c.channel.name} (${c.channel.handle}). Site: ${c.site.baseUrl}`,
    "",
    "YouTube Data API v3 (tick these):",
    ...API_CALLS.data.map((x) => `  - ${x.method}\n      ${x.why}\n      Code: ${x.where}`),
    "",
    "YouTube Analytics API v2 (tick this):",
    ...API_CALLS.analytics.map((x) => `  - ${x.method}\n      ${x.why}\n      Code: ${x.where}`),
    "",
    "YouTube Reporting API: not used.",
    "No other YouTube Data API methods are called: no search, comments, playlists, captions, subscriptions, or anything about other channels or viewers.",
    "",
    "OAuth scopes requested (nothing else, no email or profile):",
    ...API_CALLS.scopes.map((s) => `  - ${s}`),
    "",
    "Who signs in: only the owner of our own channel, once, through one link on our site. The channel is checked by handle and then pinned by ID.",
    "How often: up to 3 uploads a day (a ceiling, not a target), plus status, thumbnail and analytics calls for our own videos.",
    "Every upload sets status.containsSyntheticMedia = true and says in the description that the narration is an AI voice.",
  ];
  return lines.join("\n") + "\n";
}

async function launch(): Promise<Browser> {
  const exe = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome",
  ].find((p) => p && existsSync(p));
  if (!exe) throw new Error("no Chrome found for the evidence files");
  return chromium.launch({ executablePath: exe });
}

const FRAME = (title: string, body: string, w = 1600, h = 900) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:${w}px;height:${h}px;background:#0B0B0C;color:#fff;font:22px/1.35 Inter,"Helvetica Neue",Arial,sans-serif;padding:36px 44px;overflow:hidden}
h1{margin:0 0 6px;font-size:40px;font-weight:900;letter-spacing:-.5px}h1 b{color:#FFC531}.sub{color:#B4B8BF;font-size:20px;margin-bottom:22px}
.box{background:#F7F4EC;color:#111;border-radius:14px;padding:14px 16px}.box h3{margin:0 0 6px;font-size:22px}.box p{margin:0;font-size:17px;color:#333}
.api{display:block;margin-top:6px;font:700 16px/1.3 "DejaVu Sans Mono",monospace;color:#111;background:#FFC531;border-radius:6px;padding:3px 7px;width:max-content}
.ext{background:#1c1e22;color:#fff;border:2px solid #FFC531}.ext p{color:#d6d8dc}.yt{border:3px solid #FFC531}
.arrow{color:#FFC531;font-size:30px;font-weight:900;text-align:center}.note{color:#B4B8BF;font-size:17px}
</style></head><body><h1>${title}</h1>${body}</body></html>`;

export function architectureHtml() {
  const c = config();
  const b = (t: string, p: string, apis: string[] = [], cls = "box") => `<div class="${cls}"><h3>${t}</h3><p>${p}</p>${apis.map((a) => `<span class="api">${a}</span>`).join("")}</div>`;
  return FRAME(
    `Congress <b>Receipts</b>: system architecture`,
    `<div class="sub">Every part, and every YouTube API call each part makes. Only our own channel (${c.channel.handle}). No viewer data.</div>
<div style="display:grid;grid-template-columns:1fr 1.25fr 1fr;gap:18px;align-items:start">
  <div style="display:flex;flex-direction:column;gap:12px">
    ${b("U.S. House Clerk", "Public stock-trade filings (PDFs). Read once each.", [], "box ext")}
    ${b("congress-legislators", "Public-domain list: party, state, district.", [], "box ext")}
    ${b("Marketstack", "Licensed end-of-day prices for the stock and SPY.", [], "box ext")}
    ${b("Anthropic API", "Writer and two independent checkers. No YouTube data is sent.", [], "box ext")}
  </div>
  <div style="display:flex;flex-direction:column;gap:12px">
    <div class="box" style="background:#FFC531"><h3>GitHub Actions: daily job</h3><p>Up to 3 slots a day. Picks a trade, checks it, voices it (Kokoro, offline), renders it (Remotion).</p></div>
    ${b("Publish step", "src/publish/youtube.ts. Signs in with the stored refresh token.", ["youtube.videos.insert", "youtube.videos.list", "youtube.videos.update", "youtube.thumbnails.set"], "box yt")}
    ${b("Channel link step", "Reads our own channel's name and handle for the site.", ["youtube.channels.list (mine=true)"], "box yt")}
    ${b("Learn step", "Our own videos' retention, 3+ days after posting. Kept 30 days at most.", ["youtubeAnalytics.reports.query"], "box yt")}
  </div>
  <div style="display:flex;flex-direction:column;gap:12px">
    ${b("YouTube (Google)", "Data API v3 and Analytics API v2. OAuth 2.0 with 3 scopes: youtube.upload, youtube.force-ssl, yt-analytics.readonly.", [], "box ext")}
    ${b("Cloudflare Pages: website", `${c.site.baseUrl}. Receipts, privacy, terms. No tracking.`, [], "box")}
    ${b("Cloudflare Pages Function: /auth/youtube", "One-time owner authorization. Checks the channel by handle, pins its ID, seals the token (AES-256-GCM).", ["youtube.channels.list (mine=true)"], "box yt")}
    ${b("Health check", "Opens a GitHub issue only when something breaks.", [], "box")}
  </div>
</div>
<p class="note" style="margin-top:16px">Gold labels = YouTube API calls. Gold-bordered boxes = parts that call YouTube. Nothing calls YouTube for any other channel or for viewers.</p>`,
  );
}

export function userFlowHtml() {
  const c = config();
  const step = (n: string, t: string, p: string, apis: string[] = []) =>
    `<div class="box" style="flex:1"><h3>${n}. ${t}</h3><p>${p}</p>${apis.map((a) => `<span class="api">${a}</span>`).join("")}</div>`;
  const arrow = `<div class="arrow" style="align-self:center">→</div>`;
  return FRAME(
    `Congress <b>Receipts</b>: authorize, upload, revoke`,
    `<div class="sub">Only one person ever signs in: the owner of ${c.channel.handle}, once.</div>
<div style="font-weight:900;color:#FFC531;margin:0 0 8px">ONE TIME: CONNECT THE CHANNEL</div>
<div style="display:flex;gap:10px">
${step("1", "Open one link", `The owner opens ${c.site.baseUrl}/auth/youtube. It sends them to Google's sign-in.`)}${arrow}
${step("2", "Pick the channel, Allow", "Google sign-in. The owner picks the Congress Receipts channel (brand accounts work) and allows 3 YouTube permissions.")}${arrow}
${step("3", "Channel verified", `Our callback asks YouTube which channel was picked. Handle must be ${c.channel.handle}; its ID is then pinned.`, ["youtube.channels.list (mine=true)"])}${arrow}
${step("4", "Token sealed", "The refresh token is encrypted and stored on our Cloudflare project. The page says Connected.")}
</div>
<div style="font-weight:900;color:#FFC531;margin:18px 0 8px">EVERY DAY: UP TO 3 UPLOADS, ONLY WHAT PASSES EVERY CHECK</div>
<div style="display:flex;gap:10px">
${step("5", "Sign in as the job", "The job unseals the token and gets a short-lived access token from Google.")}${arrow}
${step("6", "Upload", "Our own Short, with AI-voice disclosure and containsSyntheticMedia = true. The first-ever upload goes up private.", ["youtube.videos.insert"])}${arrow}
${step("7", "Check and finish", "Read back the status; first upload only: lock test. Set the thumbnail.", ["youtube.videos.list", "youtube.videos.update", "youtube.thumbnails.set"])}${arrow}
${step("8", "Learn", "After 3 days: views and retention of our own videos. Deleted after 30 days.", ["youtubeAnalytics.reports.query"])}
</div>
<div style="font-weight:900;color:#FFC531;margin:18px 0 8px">ANY TIME: REVOKE ACCESS</div>
<div style="display:flex;gap:10px">
${step("A", "Owner removes access", "At Google's security settings page (security.google.com/settings/security/permissions). Our next sign-in fails, nothing is posted, and our health check reports it.")}
${step("B", "Or we disconnect", "Running the daily job with reset YouTube ticked deletes the stored token. Reconnecting must be the same pinned channel.")}
${step("C", "Data deleted", "On request we delete stored YouTube data within 30 days. Stats are deleted after 30 days anyway.")}
</div>`,
  );
}

/** What Receipt No. 001's upload run recorded, rebuilt from the saved ledger and run notes. No keys, tokens or emails. */
export function runRecord() {
  const l = loadLedger();
  const r = l.receipts.find((x) => x.number === 1);
  const check = l.firstUploadCheck;
  if (!r || !check) throw new Error("no record of Receipt No. 001's upload yet");
  const notes = readFileSync(path("docs/evidence/receipt-001-run-log.txt"), "utf8");
  const meta = uploadRequest(r, r.voice ?? "AI voice (Kokoro open model)", "private");
  return { r, check, notes, meta };
}

export function uploadEvidenceHtml(): string {
  const c = config();
  const { r, check, notes, meta } = runRecord();
  const youtubeTs = readFileSync(path("src/publish/youtube.ts"), "utf8");
  const workflow = readFileSync(path(".github/workflows/daily.yml"), "utf8");
  const step = (t: string, p: string, api = "") => `<div class="s"><b>${t}</b><br>${p}${api ? `<br><code>${api}</code>` : ""}</div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:Letter;margin:0.45in}body{font:11pt/1.4 "Helvetica Neue",Arial,sans-serif;color:#111}
h1{font-size:19pt;margin:0 0 4px}h2{font-size:14pt;margin:18px 0 6px;border-bottom:2px solid #111;padding-bottom:3px}
.flow{display:flex;flex-wrap:wrap;gap:6px;align-items:stretch}.s{flex:1 1 30%;border:2px solid #111;border-radius:8px;padding:6px 8px;font-size:9.5pt}
code{font:8.5pt/1.3 "DejaVu Sans Mono",monospace;background:#FFC531;padding:0 3px;border-radius:3px}
table{border-collapse:collapse;width:100%;font-size:9.5pt}td{border:1px solid #bbb;padding:3px 6px;vertical-align:top}td:first-child{width:28%;font-weight:700}
pre{font:7.6pt/1.28 "DejaVu Sans Mono",monospace;white-space:pre-wrap;word-break:break-all;border:1px solid #bbb;padding:6px;margin:0}
.pb{page-break-before:always}.small{font-size:9pt;color:#444}
</style></head><body>
<h1>Congress Receipts: how one video gets uploaded</h1>
<p class="small">YouTube API Services audit evidence. Channel ${esc(c.channel.handle)} (${esc(c.channel.name)}). Site ${esc(c.site.baseUrl)}. Code: github.com/houstoninvestments-jpg/congress-receipts</p>
<div class="flow">
${step("1. Scheduled job starts", "GitHub Actions, up to 3 slots a day. Unsure about a trade means skip.")}
${step("2. Pick and check one trade", "From a public House filing. Code checks plus two independent reviews.")}
${step("3. Make the video", "Kokoro AI voice, Remotion render, under 40 seconds, 1080x1920.")}
${step("4. Sign in", "Refresh token from the one-time owner authorization; short-lived access token.")}
${step("5. Upload", "Resumable upload of our own video. First-ever upload is private. containsSyntheticMedia = true.", "youtube.videos.insert")}
${step("6. Lock test (first upload only)", "Ask for unlisted, read status back; private means locked. Then thumbnail.", "youtube.videos.update · youtube.videos.list · youtube.thumbnails.set")}
</div>
<h2>Run record: Receipt No. 001 (the first upload)</h2>
<table>
<tr><td>Run</td><td>GitHub Actions, Daily Receipt workflow, scheduled run 40225070983, ${esc(check.checkedAt)}</td></tr>
<tr><td>Video</td><td>${esc(r.youtubeId ?? "")} (uploaded as private: the first upload is always private)</td></tr>
<tr><td>Title</td><td>${esc(meta.snippet.title)}</td></tr>
<tr><td>Status sent</td><td>privacyStatus=${esc(meta.status.privacyStatus)}, selfDeclaredMadeForKids=${meta.status.selfDeclaredMadeForKids}, containsSyntheticMedia=${meta.status.containsSyntheticMedia}</td></tr>
<tr><td>Lock test result</td><td>${esc(check.detail)} → locked: ${check.locked ? "yes" : "no"}. The video stays private; nothing was made public.</td></tr>
<tr><td>Source filing</td><td>${esc(r.facts.pdfUrl)}</td></tr>
</table>
<p class="small">Run notes from the job log (secrets are never printed; GitHub masks them):</p>
<pre>${esc(notes)}</pre>
<p class="small">Description sent with the upload:</p>
<pre>${esc(meta.snippet.description)}</pre>
<h2 class="pb">Upload script, unchanged: src/publish/youtube.ts</h2>
<pre>${esc(youtubeTs)}</pre>
<h2 class="pb">Daily workflow, unchanged: .github/workflows/daily.yml</h2>
<pre>${esc(workflow)}</pre>
</body></html>`;
  scanEvidence("upload-evidence.pdf", html.replace(/\$\{\{ secrets\.[A-Z_]+ \}\}/g, ""));
  return html;
}

/** Make all seven files. `base` is the live site; live pages are captured from it, not from local files. */
export async function makeEvidence(base: string, out = path("docs/evidence")) {
  mkdirSync(out, { recursive: true });
  const browser = await launch();
  const files: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const live = async (rel: string, file: string, must: RegExp[]) => {
      const res = await page.goto(`${base}/${rel}`, { waitUntil: "networkidle" });
      if (!res || res.status() !== 200) throw new Error(`${base}/${rel} answered ${res?.status()}`);
      const text = await page.innerText("body");
      for (const m of must) if (!m.test(text) && !m.test(await page.content())) throw new Error(`${rel || "home"}: missing ${m}`);
      scanEvidence(file, await page.content());
      await page.screenshot({ path: join(out, file), fullPage: true });
      files.push(file);
    };
    await live("privacy/", "privacy-policy.png", [/YouTube API Services/, /youtube\.com\/t\/terms/, /google\.com\/policies\/privacy/, /What YouTube data we use/, /What we keep/, /security\.google\.com\/settings\/security\/permissions/, /delete stored YouTube data within 30 days/]);
    await live("", "homepage.png", [/Privacy/, /Watch on YouTube/]);
    const res = await page.goto(`${base}/terms/`, { waitUntil: "networkidle" });
    if (!res || res.status() !== 200) throw new Error(`terms answered ${res?.status()}`);
    scanEvidence("terms.pdf", await page.content());
    await page.emulateMedia({ media: "screen" });
    await page.pdf({ path: join(out, "terms.pdf"), format: "Letter", printBackground: true, margin: { top: "0.4in", bottom: "0.4in", left: "0.4in", right: "0.4in" } });
    files.push("terms.pdf");
    files.push(...(await makeLocal(browser, out)));
  } finally {
    await browser.close();
  }
  return files;
}

/** The files that need no live site: diagrams, upload PDF, form answers. */
export async function makeLocal(browser: Browser, out: string): Promise<string[]> {
  const files: string[] = [];
  const diagram = async (html: string, file: string) => {
    scanEvidence(file, html);
    const p = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await p.setContent(html, { waitUntil: "load" });
    await p.screenshot({ path: join(out, file) });
    await p.close();
    files.push(file);
  };
  await diagram(architectureHtml(), "architecture-diagram.png");
  await diagram(userFlowHtml(), "user-flow-diagram.png");
  const p = await browser.newPage();
  await p.setContent(uploadEvidenceHtml(), { waitUntil: "load" });
  await p.pdf({ path: join(out, "upload-evidence.pdf"), format: "Letter", printBackground: true });
  await p.close();
  files.push("upload-evidence.pdf");
  const answers = formAnswers();
  scanEvidence("form-answers.txt", answers);
  writeFileSync(join(out, "form-answers.txt"), answers);
  files.push("form-answers.txt");
  return files;
}

export async function makeLocalOnly(out = path("docs/evidence")) {
  mkdirSync(out, { recursive: true });
  const b = await launch();
  try {
    return await makeLocal(b, out);
  } finally {
    await b.close();
  }
}
