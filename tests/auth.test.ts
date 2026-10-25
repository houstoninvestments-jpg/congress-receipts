import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { channelCheck, SCOPES } from "../functions/auth/youtube/_shared.js";
import { path } from "../src/lib/util.js";

describe("one-link YouTube authorize: which channel is accepted", () => {
  it("accepts a brand-account channel by its handle, whatever identity signed in", () => {
    // A brand account signs in with its own Google identity, not the owner's Gmail.
    // Only the channel the sign-in picked matters.
    const brand = { id: "UCbrand123", title: "Congress Receipts", handle: "@congressreceipts" };
    expect(channelCheck(brand, "@CongressReceipts")).toEqual({ ok: true });
  });
  it("refuses any other channel and says which handle came back", () => {
    const r = channelCheck({ id: "UCother", title: "Someone Else", handle: "@someoneelse" }, "@CongressReceipts");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toMatch(/@someoneelse/);
    expect(channelCheck({ id: "UCx", title: "No handle", handle: "" }, "@CongressReceipts").ok).toBe(false);
    expect(channelCheck(null, "@CongressReceipts").ok).toBe(false);
  });
  it("after the first connection, only the pinned channel ID is accepted", () => {
    const pinned = "UCbrand123";
    expect(channelCheck({ id: "UCbrand123", title: "Renamed", handle: "@renamedlater" }, "@CongressReceipts", pinned)).toEqual({ ok: true });
    expect(channelCheck({ id: "UCimposter", title: "Congress Receipts", handle: "@congressreceipts" }, "@CongressReceipts", pinned).ok).toBe(false);
  });
  it("asks Google only for the three YouTube permissions, no email or identity", () => {
    expect(SCOPES.split(" ")).toEqual([
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.force-ssl",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ]);
  });
  it("the callback no longer checks an email", () => {
    const src = readFileSync(path("functions/auth/youtube/callback.ts"), "utf8");
    expect(src).not.toMatch(/email/i);
    expect(src).toMatch(/channelCheck\(/);
  });
});

describe("no email addresses in this public repo", () => {
  it("config, code and docs hold none", () => {
    for (const f of ["config/channel.json", "src/auth/store.ts", "src/site/legal.ts", "functions/auth/youtube/_shared.ts", "docs/SETUP.md", "README.md"]) {
      const hits = (readFileSync(path(f), "utf8").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}/g) ?? []).filter((m) => !/@example\.com$/.test(m));
      expect(hits, f).toEqual([]);
    }
  });
});
