import { SCOPES, makeState, page, projectVars, ready, redirectUri, type Env } from "./_shared";

/** GET /auth/youtube: the one link. Sends the channel owner to Google to pick the channel and click Allow. */
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  if (!ready(env)) return page("Not ready yet", "<p>The Google sign-in client isn't set up for this site yet. See step 2 in docs/SETUP.md.</p>", 503);
  const vars = await projectVars(env);
  if (vars.YT_TOKEN_SEALED?.value)
    return page("Already connected", `<p>This site is already connected to <b>${(vars.YT_CHANNEL_TITLE?.value ?? "a channel").replace(/[<>&"]/g, "")}</b>. Nothing to do.</p><p>To connect a different channel, run the daily job once with "reset YouTube" ticked, then open this link again.</p>`);
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state: await makeState(env.GOOGLE_CLIENT_SECRET!),
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, 302);
};
