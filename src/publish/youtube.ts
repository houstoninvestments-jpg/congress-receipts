import { readFileSync, statSync } from "node:fs";
import type { Ledger, Receipt } from "../types.js";
import { config } from "../lib/config.js";
import { log, path, requireEnv } from "../lib/util.js";
import { refreshToken } from "../auth/store.js";
import { writeAuditRequest } from "./audit.js";
import { longDate } from "../receipt/facts.js";
import { DESCRIPTION_DISCLOSURE, chartLink } from "../site/affiliate.js";

export interface Uploader {
  token(): Promise<string>;
  fetch: typeof fetch;
}

/** OAuth refresh-token client. The token comes from the one-link authorization (or a hand-set secret). */
export function oauthUploader(fetchImpl: typeof fetch = fetch): Uploader {
  let cached: { token: string; until: number } | undefined;
  return {
    fetch: fetchImpl,
    async token() {
      if (cached && Date.now() < cached.until) return cached.token;
      const rt = await refreshToken();
      if (!rt) throw new Error("YouTube is not connected yet; open the authorize link in docs/SETUP.md");
      const res = await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: requireEnv("YOUTUBE_CLIENT_ID"), client_secret: requireEnv("YOUTUBE_CLIENT_SECRET") }),
      });
      if (!res.ok) throw new Error(`YouTube sign-in failed (${res.status}); the one-link authorization needs redoing`);
      const j = (await res.json()) as { access_token: string; expires_in: number };
      cached = { token: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000 };
      return j.access_token;
    },
  };
}

export const HASHTAGS = ["#CongressReceipts", "#STOCKAct", "#Congress", "#Shorts"];

export function receiptUrl(r: Receipt) {
  return `${config().site.baseUrl}/receipt/${r.slug}/`;
}

export function videoDescription(r: Receipt, voiceLabel: string) {
  const c = config();
  const f = r.facts;
  return [
    r.script.description.replace(/#/g, ""),
    "",
    `Amount is the range on the filing (${f.amountText}), not an exact figure.`,
    f.prices ? `Prices: closing prices ${longDate(f.prices.stock.start.date)} to ${longDate(f.prices.stock.end.date)}, from ${f.prices.source.name}. S&P 500 shown as SPY, price change only.` : "",
    "",
    `Source filing (U.S. House Clerk): ${f.pdfUrl}`,
    `The receipt and the math: ${receiptUrl(r)}`,
    ...(c.affiliate.enabled ? ["", `Full ${f.ticker} chart on TradingView (paid link): ${chartLink(f.ticker, r.number, "youtube")}`, DESCRIPTION_DISCLOSURE] : []),
    "",
    c.channel.notAdvice,
    `Disclosure: the narration is an ${voiceLabel}. The filing card is a clean recreation of the official report.`,
    "",
    HASHTAGS.join(" "),
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

/** The exact metadata sent to YouTube. Saved on every run, so dry runs show what would be uploaded. */
export function uploadRequest(r: Receipt, voiceLabel: string, privacy?: "public" | "private" | "unlisted") {
  const cfg = config();
  return {
    snippet: {
      title: r.script.title,
      description: videoDescription(r, voiceLabel),
      tags: ["congress stock trades", "STOCK Act", "periodic transaction report", "congress receipts", r.facts.ticker, r.facts.company].filter((t) => t.length < 60),
      categoryId: cfg.youtube.categoryId,
      defaultLanguage: cfg.youtube.defaultLanguage,
      defaultAudioLanguage: cfg.youtube.defaultLanguage,
    },
    status: {
      privacyStatus: privacy ?? cfg.youtube.privacyStatus,
      selfDeclaredMadeForKids: false,
      // YouTube's altered-or-synthetic content flag. Set on every upload for the AI voice.
      containsSyntheticMedia: true,
    },
  };
}

const API = "https://www.googleapis.com/youtube/v3";

async function api(u: Uploader, method: string, url: string, body?: unknown) {
  const res = await u.fetch(url, { method, headers: { authorization: `Bearer ${await u.token()}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube ${method} ${url.split("?")[0]} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

export async function uploadVideo(u: Uploader, file: string, meta: ReturnType<typeof uploadRequest>): Promise<string> {
  const size = statSync(file).size;
  const init = await u.fetch(`https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: { authorization: `Bearer ${await u.token()}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(size), "x-upload-content-type": "video/mp4" },
    body: JSON.stringify(meta),
  });
  if (!init.ok) throw new Error(`upload start failed ${init.status}: ${(await init.text()).slice(0, 300)}`);
  const session = init.headers.get("location");
  if (!session) throw new Error("upload start returned no session URL");
  const put = await u.fetch(session, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(size) }, body: readFileSync(file) });
  const text = await put.text();
  if (!put.ok) throw new Error(`upload failed ${put.status}: ${text.slice(0, 300)}`);
  return (JSON.parse(text) as { id: string }).id;
}

export async function videoStatus(u: Uploader, id: string) {
  const j = await api(u, "GET", `${API}/videos?part=status&id=${id}`);
  return j.items?.[0]?.status as { privacyStatus: string; uploadStatus: string } | undefined;
}

export async function setPrivacy(u: Uploader, id: string, privacyStatus: string) {
  return api(u, "PUT", `${API}/videos?part=status`, { id, status: { privacyStatus, selfDeclaredMadeForKids: false, containsSyntheticMedia: true } });
}

/** Is this API project locked to private uploads? Test it: try the private test video as unlisted (never public). */
export async function lockTest(u: Uploader, id: string): Promise<{ locked: boolean; detail: string }> {
  try {
    await setPrivacy(u, id, "unlisted");
  } catch (e) {
    return { locked: true, detail: `changing privacy was refused: ${String(e).slice(0, 200)}` };
  }
  const st = await videoStatus(u, id);
  if (st?.privacyStatus === "unlisted") return { locked: false, detail: "private test video could be made unlisted; uploads are not locked" };
  return { locked: true, detail: `status stayed ${st?.privacyStatus ?? "unknown"} after asking for unlisted` };
}

export async function channelInfo(u: Uploader): Promise<{ id: string; title: string; handle: string }> {
  const j = await api(u, "GET", `${API}/channels?part=snippet&mine=true`);
  const c = j.items?.[0];
  if (!c) throw new Error("no channel found for this sign-in");
  return { id: c.id, title: c.snippet?.title ?? "", handle: c.snippet?.customUrl ?? "" };
}

export async function setThumbnail(u: Uploader, videoId: string, jpeg: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const body = readFileSync(jpeg);
    const res = await u.fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
      method: "POST",
      headers: { authorization: `Bearer ${await u.token()}`, "content-type": "image/jpeg", "content-length": String(body.length) },
      body,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, detail: `thumbnail not set (${res.status}): ${text.replace(/\s+/g, " ").slice(0, 200)}` };
    return { ok: true, detail: "thumbnail set from the cover frame" };
  } catch (e) {
    return { ok: false, detail: `thumbnail not set: ${String(e).slice(0, 200)}` };
  }
}

/** While uploads are locked: re-test once a day. If the lock lifted, put the test video back to private and carry on. */
export async function recheckLock(u: Uploader, ledger: Ledger): Promise<{ locked: boolean; detail: string }> {
  const check = ledger.firstUploadCheck;
  if (!check?.locked) return { locked: false, detail: "not locked" };
  const res = await lockTest(u, check.videoId);
  if (!res.locked) {
    await setPrivacy(u, check.videoId, config().youtube.firstUploadPrivacy);
    ledger.firstUploadCheck = { ...check, locked: false, checkedAt: new Date().toISOString(), detail: `lock lifted: ${res.detail}` };
  } else ledger.firstUploadCheck = { ...check, checkedAt: new Date().toISOString(), detail: res.detail };
  return res;
}

export interface PublishResult {
  videoId: string;
  lockedPrivate: boolean;
  privacy: "public" | "unlisted" | "private";
  detail: string;
  thumbnail?: { ok: boolean; detail: string };
}

export async function publishShort(u: Uploader, r: Receipt, file: string, voiceLabel: string, ledger: Ledger, coverJpg?: string): Promise<PublishResult> {
  if (ledger.firstUploadCheck?.locked) throw new Error("uploads are locked private until the YouTube API audit passes; see docs/youtube-audit-request.md");
  let res: PublishResult;
  if (!ledger.firstUploadCheck) {
    // The very first upload goes up private and tests the lock before anything is public.
    const id = await uploadVideo(u, file, uploadRequest(r, voiceLabel, "private"));
    const lock = await lockTest(u, id);
    ledger.firstUploadCheck = { videoId: id, checkedAt: new Date().toISOString(), ...lock };
    log(`first upload lock test: ${lock.detail}`);
    if (lock.locked) {
      writeAuditRequest(path("docs/youtube-audit-request.md"), lock.detail);
      return { videoId: id, lockedPrivate: true, privacy: "private", detail: lock.detail };
    }
    const keep = config().youtube.firstUploadPrivacy;
    await setPrivacy(u, id, keep);
    res = { videoId: id, lockedPrivate: false, privacy: keep, detail: `${lock.detail}; test video kept ${keep}` };
  } else {
    const privacy = config().youtube.privacyStatus;
    const id = await uploadVideo(u, file, uploadRequest(r, voiceLabel));
    res = { videoId: id, lockedPrivate: false, privacy, detail: `uploaded ${id} as ${privacy}` };
  }
  if (coverJpg) res.thumbnail = await setThumbnail(u, res.videoId, coverJpg);
  return res;
}
