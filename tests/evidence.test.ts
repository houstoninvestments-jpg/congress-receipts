import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { API_CALLS, architectureHtml, formAnswers, scanEvidence, userFlowHtml } from "../src/evidence/index.js";
import { SCOPES } from "../functions/auth/youtube/_shared.js";
import { path } from "../src/lib/util.js";

const code = ["src/publish/youtube.ts", "src/learn/index.ts", "functions/auth/youtube/callback.ts"].map((f) => readFileSync(path(f), "utf8")).join("\n");

describe("audit form answers match the code", () => {
  it("lists exactly the YouTube endpoints the code calls", () => {
    const endpoint: Record<string, RegExp> = {
      "youtube.videos.insert": /upload\/youtube\/v3\/videos\?uploadType=resumable/,
      "youtube.videos.list": /"GET", `\$\{API\}\/videos\?part=status/,
      "youtube.videos.update": /"PUT", `\$\{API\}\/videos\?part=status/,
      "youtube.thumbnails.set": /upload\/youtube\/v3\/thumbnails\/set/,
      "youtube.channels.list": /youtube\/v3\/channels\?part=snippet&mine=true/,
      "youtubeAnalytics.reports.query": /youtubeanalytics\.googleapis\.com\/v2\/reports/,
    };
    const listed = [...API_CALLS.data, ...API_CALLS.analytics].map((x) => x.method).sort();
    expect(listed).toEqual(Object.keys(endpoint).sort());
    for (const [m, re] of Object.entries(endpoint)) expect(re.test(code), m).toBe(true);
    // No YouTube endpoint in the code that the list misses.
    const used = new Set([...code.matchAll(/youtube\/v3\/(\w+)|\$\{API\}\/(\w+)/g)].map((x) => x[1] ?? x[2]));
    expect([...used].sort()).toEqual(["channels", "thumbnails", "videos"]);
  });
  it("lists the same three scopes the authorize link asks for", () => {
    expect(API_CALLS.scopes).toEqual(SCOPES.split(" "));
  });
  it("form answers, diagrams hold no keys, tokens or emails", () => {
    for (const [n, t] of [["form", formAnswers()], ["arch", architectureHtml()], ["flow", userFlowHtml()]]) expect(() => scanEvidence(n, t)).not.toThrow();
    expect(() => scanEvidence("x", `token ${["ya29", "a0" + "x".repeat(24)].join(".")}`)).toThrow();
    expect(() => scanEvidence("x", "mail someone@gmail.com")).toThrow();
  });
});
