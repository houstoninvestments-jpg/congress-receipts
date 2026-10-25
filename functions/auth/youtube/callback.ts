import { seal } from "../../../src/auth/seal";
import { channelCheck, checkState, esc, page, projectVars, ready, redirectUri, saveVars, type Env } from "./_shared";

/**
 * GET /auth/youtube/callback: Google sends the owner back here after Allow.
 * Swaps the code for a refresh token, checks the channel picked is ours (by handle, then pinned ID), seals the token
 * and saves it on our Pages project. Only the first connection is accepted.
 */
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  if (!ready(env)) return page("Not ready yet", "<p>The sign-in client isn't set up yet.</p>", 503);
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return page("Not connected", `<p>Google said: ${esc(url.searchParams.get("error")!)}. Nothing was saved. You can open the link again.</p>`, 400);
  if (!(await checkState(env.GOOGLE_CLIENT_SECRET!, url.searchParams.get("state")))) return page("Link expired", "<p>This sign-in took too long or didn't start on our site. Open the link again.</p>", 400);
  const vars = await projectVars(env);
  if (vars.YT_TOKEN_SEALED?.value) return page("Already connected", "<p>A channel is already connected. Nothing was changed.</p>");

  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code") ?? "",
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  const t: any = await tok.json();
  if (!tok.ok || !t.refresh_token) return page("Not connected", "<p>Google didn't send a long-lived token. Open the link again and click Allow on every screen.</p>", 400);

  const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${t.access_token}` } });
  const c: any = await ch.json();
  const item = c.items?.[0];
  const channel = item ? { id: String(item.id), title: String(item.snippet?.title ?? ""), handle: String(item.snippet?.customUrl ?? "") } : null;
  const verdict = channelCheck(channel, env.ALLOWED_HANDLE!, vars.YT_PINNED_CHANNEL_ID?.value || undefined);
  if (!verdict.ok) return page("Wrong channel", `<p>Nothing was saved: ${esc(verdict.why)}.</p><p>Open the link again and pick the <b>${esc(env.ALLOWED_HANDLE!)}</b> channel.</p>`, 403);

  await saveVars(env, {
    YT_TOKEN_SEALED: await seal(t.refresh_token, env.GOOGLE_CLIENT_SECRET!),
    YT_CHANNEL_ID: channel!.id,
    YT_PINNED_CHANNEL_ID: channel!.id,
    YT_CHANNEL_TITLE: channel!.title,
    YT_AUTH_AT: new Date().toISOString(),
  });
  return page("Connected", `<p>Done. The daily job can now post to <b>${esc(channel!.title || "your channel")}</b> (${esc(channel!.handle)}).</p><p>You can close this page.</p>`);
};
