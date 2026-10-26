# Congress Receipts

An automated daily YouTube Short about one stock trade a member of Congress
reported. Strictly neutral: what was filed, when, and what the stock did next
to the S&P 500. Channel `@CongressReceipts`, site `congressreceipts.pages.dev`.

Not financial advice. Facts from public filings.

Founder steps: [docs/SETUP.md](docs/SETUP.md).

## How a day runs

One GitHub Actions job (`.github/workflows/daily.yml`), three slots a day (about 9:37am, 2:37pm and 7:37pm Pacific). Up to 3 videos a day is a ceiling, not a quota: a slot posts only if a trade passes every check. Model cost is logged per run in `data/costs.json` and in the run notes.

1. **Data** (`src/data`). The House Clerk's yearly disclosure index, then each
   new periodic transaction report PDF, read with `pdftotext`. Polite: clear
   user agent, one request at a time, a pause between PDFs, each report
   fetched once and cached in `data/house/ptrs.json`. Scanned paper reports
   and any row that doesn't read cleanly are skipped. Party, state and
   district come from the public-domain congress-legislators list.
   **House only**: the Senate site makes every visitor accept terms before
   searching, so we don't collect from it automatically.
2. **Pick** (`src/receipt/select.ts`). Purchases of listed stocks, at least 14
   days old. Ranked by filed amount, then newest filing. Party is never a
   ranking input; it only rules out a pick that would put Democrats and
   Republicans more than one apart over any 7 days. No member twice in 7 days.
3. **Prices** (`src/prices`). Split-adjusted closes from a licensed source;
   stock vs SPY over the same days. Live runs refuse to start without one.
4. **Writer** (`claude-fable-5-1`) words it from pre-formatted facts.
   **Checker**: code gates first (banned words, every number must match the
   filing or the prices, party, state, dates, owner, under 40 seconds, grade 8
   reading), then two independent `claude-opus-5-5` reviews. Unsure means skip.
5. **Voice**: Kokoro `am_michael`, en-us, speed 0.95, in dry and live runs.
6. **Render** (`remotion/`). Hook, the filing card ("From official filing"),
   result bars, stamp (BEAT THE MARKET, LOST TO THE MARKET, FILED LATE),
   3-second scoreboard, "Congress trading stocks: ban it, or keep it?". Pixel checks: nothing changes
   on the filing card once it's up, and the stamp never covers the result.
7. **Publish** (`src/publish`). Resumable upload, `containsSyntheticMedia`,
   first upload private plus lock test, thumbnail from frame 0.
8. **Site** (`src/site`): today's receipt, every receipt, scoreboard, one page
   per receipt with the filing link and the math, how-we-do-it, privacy and
   terms. Cloudflare Pages once the token is set, GitHub Pages until then.
9. **Learn** and **health**, as in Scam or Not.

## Commands

```
npm run dry-run            # whole pipeline, uploads nothing
npx tsx src/cli.ts fetch   # refresh filings and members only
npx tsx src/cli.ts site    # build the site into site/dist
npm test                   # includes the legal-gate tests
scripts/secret-scan.sh     # run before every push
```
