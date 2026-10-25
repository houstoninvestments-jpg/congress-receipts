# Setup: only what AARON has to do

Until these are done, the daily job runs a full dry run every day: it reads new
House filings, picks a trade, checks it, renders the video, and builds the
website. It uploads nothing.

Google Cloud and Cloudflare menu names below are from the Scam or Not setup
and their help pages. Screens change; follow the labels on screen.

## 1. Create the YouTube channel

1. On a computer, sign in to YouTube with your Google account.
2. Profile picture, then **Settings**, then **Add or manage channel(s)**.
3. **Create a channel**. Name: `Congress Receipts`. Handle: `@CongressReceipts`
   (or the closest free one).

## 2. Add three secrets to this repo

GitHub never shows a saved secret again, so values can't be copied over from
Scam or Not by code. You paste them once.

Where: this repo, **Settings**, **Secrets and variables**, **Actions**,
**New repository secret**. One per name:

```
CLOUDFLARE_API_TOKEN
ANTHROPIC_API_KEY
```

- `CLOUDFLARE_API_TOKEN`: the same Pages-only token Scam or Not uses. If you
  didn't keep a copy, make a new one the same way (Cloudflare, **Account API
  Tokens**, custom token, permission **Account / Cloudflare Pages / Edit**).
  The account ID is found by code; you don't need to add it.
- `ANTHROPIC_API_KEY`: from `https://console.anthropic.com`. The same key as
  Scam or Not works.

The next daily run puts the site on `https://congressreceipts.pages.dev`
(next free name if taken; the run notes say which).

## 3. New Google Cloud project and sign-in client

This channel gets its own project. Don't reuse Scam or Not's.

1. Open `https://console.cloud.google.com` with the Google account that owns
   the channel. Create a project named `congress-receipts`.
2. Enable two APIs: **YouTube Data API v3** and **YouTube Analytics API**.
3. Sign-in settings (Google Auth Platform / OAuth consent screen): audience
   **External**, app name `Congress Receipts`, your email for support and
   contact. Set publishing status to **In production** (in "Testing" the
   sign-in expires after 7 days).
4. Create an OAuth client, type **Web application**. Under "Authorized
   redirect URIs" add exactly:

```
https://congressreceipts.pages.dev/auth/youtube/callback
```

5. Save. Add the two values as repo secrets (same place as step 2):

```
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
```

Why these pastes can't be avoided: Google has no way for code to create a
sign-in client, so the ID, secret and return address have to be typed in once.

If the run notes say the site landed on a different name than
`congressreceipts`, use that name in the redirect address.

## 4. Connect the channel: one link

After the first daily run that follows step 3, open:

```
https://congressreceipts.pages.dev/auth/youtube
```

Pick your Google account, pick the **Congress Receipts** channel, click
**Allow** (Google warns the app is unverified; continue, it's your own app).
The page says "Connected". Nothing to copy. The token is sealed and stored by
the site; only your Google account can use this link.

## 5. Founder decision: the price source

No free price source allows a public channel's use: every free plan checked
says personal or non-commercial (Alpha Vantage, Twelve Data, Finnhub, Massive,
EODHD, Marketstack free). The engine is built for Marketstack, whose pricing
page lists "Commercial Use" from its Basic plan ($9.99 a month, $8.99 billed
yearly, as shown on 2026-10-25). Until a key from a commercial plan is added,
nothing is published.

If you buy it, add one more secret:

```
MARKETSTACK_API_KEY
```

Go-live is automatic: the first daily run with steps 2 to 5 done uploads
Receipt No. 001 as a private test, checks Google's upload lock, then posts
public from the next day on.

## Later, only when wanted

- **Weekly email "This week's receipts".** Built, hidden. Needs an email
  service and its signup form address in `config/channel.json`
  (`newsletter.formAction`, then `enabled: true`).
- **Brokerage paid link.** Built, hidden, labeled "Paid link". Fill
  `affiliate` in `config/channel.json` and set `enabled: true`.
