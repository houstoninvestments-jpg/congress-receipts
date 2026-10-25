// Cloudflare Pages Function helpers for the one-link YouTube authorization.
export const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

export interface Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_PROJECT?: string;
  ALLOWED_HANDLE?: string; // "@CongressReceipts"
}

export const ready = (e: Env) => Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.CF_API_TOKEN && e.CF_ACCOUNT_ID && e.CF_PROJECT && e.ALLOWED_HANDLE);

export const redirectUri = (req: Request) => `${new URL(req.url).origin}/auth/youtube/callback`;

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hmac(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

/** A state value that only we can make, good for 15 minutes. */
export async function makeState(secret: string, now = Date.now()) {
  const ts = String(now);
  return `${ts}.${await hmac(secret, `state:${ts}`)}`;
}

export async function checkState(secret: string, state: string | null, now = Date.now()) {
  if (!state) return false;
  const [ts, sig] = state.split(".");
  if (!ts || !sig || now - Number(ts) > 15 * 60_000 || Number(ts) > now + 60_000) return false;
  return sig === (await hmac(secret, `state:${ts}`));
}

export interface Channel {
  id: string;
  title: string;
  handle: string; // snippet.customUrl, e.g. "@congressreceipts"
}

/**
 * Is this the channel we post to? Checked on the channel the sign-in picked, never on an email:
 * brand-account channels sign in with an identity that isn't the owner's Gmail.
 * Once a channel has connected, its ID is pinned and only that channel is accepted again.
 */
export function channelCheck(ch: Channel | null, allowedHandle: string, pinnedId?: string): { ok: true } | { ok: false; why: string } {
  if (!ch?.id) return { ok: false, why: "no channel came back with this sign-in" };
  if (pinnedId) return ch.id === pinnedId ? { ok: true } : { ok: false, why: `this site is tied to a different channel (${pinnedId})` };
  const norm = (h: string) => h.trim().toLowerCase().replace(/^@?/, "@");
  if (!ch.handle || norm(ch.handle) !== norm(allowedHandle)) return { ok: false, why: `the channel picked has the handle ${ch.handle || "(none)"}, not ${allowedHandle}` };
  return { ok: true };
}

export async function projectVars(e: Env): Promise<Record<string, { value?: string } | null>> {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${e.CF_ACCOUNT_ID}/pages/projects/${e.CF_PROJECT}`, {
    headers: { authorization: `Bearer ${e.CF_API_TOKEN}` },
  });
  const j: any = await r.json();
  if (!j.success) throw new Error("could not read the site settings");
  return j.result?.deployment_configs?.production?.env_vars ?? {};
}

export async function saveVars(e: Env, vars: Record<string, string>) {
  const env_vars = Object.fromEntries(Object.entries(vars).map(([k, value]) => [k, { type: "plain_text", value }]));
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${e.CF_ACCOUNT_ID}/pages/projects/${e.CF_PROJECT}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${e.CF_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ deployment_configs: { production: { env_vars } } }),
  });
  const j: any = await r.json();
  if (!j.success) throw new Error("could not save the connection");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;background:#0B0B0C;color:#fff;font:20px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{max-width:560px;margin:0 auto;padding:48px 16px}h1{font-size:1.6em;line-height:1.15}b{color:#FFC531}</style></head>
<body><main><h1>${esc(title)}</h1>${body}</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
export { esc };
