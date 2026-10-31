import { describe, expect, it } from "vitest";
import { intWords, numWords, ordinalWords, spokenText, yearWords } from "../src/voice/spoken.js";
import { captionChunks } from "../src/render/timeline.js";
import { mechanicalCheck } from "../src/checker/index.js";
import { templateScript } from "../src/writer/index.js";
import { config } from "../src/lib/config.js";
import { facts } from "./helpers.js";

describe("numbers and money are read as words", () => {
  it.each([
    ["$15,000", "fifteen thousand dollars"],
    ["$1,001-$15,000", "between one thousand and fifteen thousand dollars"],
    ["$15,001 - $50,000", "between fifteen thousand and fifty thousand dollars"],
    ["$1,000,001 - $5,000,000", "between one million and five million dollars"],
    ["up to $50K", "up to fifty thousand dollars"],
    ["up to $1.5M", "up to one point five million dollars"],
    ["over $50,000,000", "over fifty million dollars"],
    ["+8.1 pts", "plus eight point one points"],
    ["−0.7 pts", "minus zero point seven points"],
    ["up 12.3%", "up twelve point three percent"],
    ["down 4.7%", "down four point seven percent"],
    ["by 8.1 points", "by eight point one points"],
    ["the 45-day deadline", "the forty-five-day deadline"],
    ["17 days", "seventeen days"],
    ["August 7, 2026", "August seventh, twenty twenty-six"],
    ["Filed Sep 9.", "Filed September ninth."],
    ["in 2008", "in two thousand eight"],
    ["The S&P 500 is up", "The S and P five hundred is up"],
    ["Rep. Gilbert Ray Cisneros, Jr. bought", "Representative Gilbert Ray Cisneros Junior bought"],
  ])("%s", (input, said) => expect(spokenText(input)).toBe(said));

  it("never swallows the comma after an amount", () => {
    expect(spokenText("$50,000, then")).toBe("fifty thousand dollars, then");
  });
  it("says a ticker as the company name when known, letter by letter otherwise", () => {
    expect(spokenText("bought Nvidia (NVDA)", { ticker: "NVDA", company: "Nvidia" })).toBe("bought Nvidia");
    expect(spokenText("NVDA rose", { ticker: "NVDA", company: "Nvidia" })).toBe("Nvidia rose");
    expect(spokenText("MSFT and BRK.B")).toBe("M S F T and B R K B");
    expect(spokenText("an AI voice")).toBe("an AI voice");
  });
  it("leaves no digit or symbol for the voice to guess at in a real script", () => {
    const f = facts();
    const s = templateScript(f, 1);
    for (const line of [s.hook, s.receiptSay, s.resultSay, s.stampSay, config().channel.closer]) {
      const said = spokenText(line, { ticker: f.ticker, company: f.company });
      expect(said, line).not.toMatch(/[\d$%+−]/);
    }
  });
  it("number helpers", () => {
    expect(intWords(1001)).toBe("one thousand one");
    expect(intWords(250000)).toBe("two hundred fifty thousand");
    expect(numWords("12.25")).toBe("twelve point two five");
    expect(numWords("13.0")).toBe("thirteen");
    expect(yearWords(2026)).toBe("twenty twenty-six");
    expect(ordinalWords(21)).toBe("twenty-first");
    expect(ordinalWords(30)).toBe("thirtieth");
    expect(ordinalWords(12)).toBe("twelfth");
  });
});

describe("captions and length at the faster voice", () => {
  it("captions keep the on-screen figures and give each the time it takes to say", () => {
    const seg = { id: "hook", text: "bought up to $50K of Merck.", file: "x", duration: 2.4 };
    const c = captionChunks(seg, 0);
    expect(c.map((x) => x.text).join(" ")).toBe("bought up to $50K of Merck.");
    expect(c.at(-1)!.to).toBeLessThanOrEqual(Math.round(2.4 * 30));
    for (let i = 1; i < c.length; i++) expect(c[i].from).toBeGreaterThanOrEqual(c[i - 1].from);
  });
  it("the word limit counts spoken words, and the fixed script fits it", () => {
    const f = facts();
    expect(mechanicalCheck(templateScript(f, 1), f, 1)).toEqual({ ok: true, problems: [] });
    const long = { ...templateScript(f, 1), resultSay: `${templateScript(f, 1).resultSay} ${"It moved. ".repeat(40)}` };
    expect(mechanicalCheck(long, f, 1).problems.join(" ")).toMatch(/spoken words/);
  });
  it("the time limit counts characters as read aloud, so numbers that read long count fully", () => {
    const f = facts();
    const s = templateScript(f, 1);
    // Few words, but every number reads long: 520 characters is about 37.5 seconds of video.
    const dense = { ...s, resultSay: `${s.resultSay} ${"$1,000,001 - $5,000,000. ".repeat(6)}` };
    expect(mechanicalCheck(dense, f, 1).problems.join(" ")).toMatch(/characters when read aloud/);
  });
});
