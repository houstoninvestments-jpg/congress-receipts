import type { Facts, Script, Verdict } from "../types.js";
import { Verdict as VerdictSchema } from "../types.js";
import type { LLM } from "../llm/client.js";
import { config } from "../lib/config.js";
import { checkReadability, fkGrade } from "../lib/readability.js";
import { allowedNumbers, longDate, moveWords, shortDate } from "../receipt/facts.js";
import { PRICE_PENDING_LINE, factsForModel } from "../writer/index.js";

export const MIN_CONFIDENCE = 0.8;
/** About 2.6 spoken words a second; the video must stay under 40 seconds with its silent beats. */
export const MAX_SPOKEN_WORDS = 72;

/**
 * Words that may never appear in a script, title, description or web page.
 * 5 U.S.C. 13107(c) and our own rule: report what was filed and what the stock did. Nothing about motive.
 */
export const BANNED: RegExp[] = [
  /\binsider/i,
  /\bdump(ed|ing|s)?\b/i,
  /before the vote/i,
  /\bcorrupt/i,
  /\bknew\b|\bknows?\b|\bknowing(ly)?\b|\bknowledge\b/i,
  /\btip(ped|-off| off)\b/i,
  /\bsuspicious|\bshady\b|\bscandal|\bscheme\b|\brigged\b|\bcrook|\bgrift|\bgreed/i,
  /\bconvenient(ly)?\b|\btiming\b|\bjust before\b|\bright before\b|\bahead of\b|\bin advance\b/i,
  /\bcash(ed)? in\b|\bprofit(ed|ing)? (from|off)\b/i,
  /\bnon-?public\b|\binside information\b|\bsecret(ly)?\b/i,
  /\billegal|\bcrime\b|\bcriminal\b|\bself-dealing\b|\bconflict of interest\b/i,
  /\bcopy (this|the|their|his|her) trades?\b|\bfollow (this|the|their|his|her) trades?\b|\bcopy[- ]?trad/i,
];

/** Extra rules for what the voice and the video say: no advice, no calls to trade. */
export const SCRIPT_BANNED: RegExp[] = [/\bbuy\b|\bbuying\b|\bsell\b|\bselling\b/i, /\bsignals?\b|\balerts?\b/i, /\byou should\b|\bshould you\b|\binvest in\b/i];

export function bannedHits(text: string, rules: RegExp[] = BANNED): string[] {
  return rules.flatMap((r) => (r.test(text) ? [text.match(r)![0]] : []));
}

export const spokenLines = (s: Script, closer = config().channel.closer) => [s.hook, s.receiptSay, s.resultSay, s.stampSay, closer];

/** Every number written in the text, normalized the way allowedNumbers() writes them. */
export function numbersIn(text: string): string[] {
  return (text.replace(/S&P 500/g, "S&P").match(/\$?\d[\d,]*(\.\d+)?\s*[KM]?%?/g) ?? []).map((n) => n.replace(/[$,%\sKM]/g, "").replace(/\.0$/, ""));
}

export interface MechanicalResult {
  ok: boolean;
  problems: string[];
}

/** Checks that need no model. Any failure means the script is rewritten once, then skipped. */
export function mechanicalCheck(s: Script, f: Facts, number: number): MechanicalResult {
  const problems: string[] = [];
  const allowed = allowedNumbers(f, number);
  for (const n of numbersIn(`${f.company} ${f.ticker} ${f.memberName}`)) allowed.add(n); // "3M", "Toll Brothers 2"
  const fields: [string, string][] = [
    ["hook", s.hook],
    ["receipt line", s.receiptSay],
    ["result line", s.resultSay],
    ["stamp line", s.stampSay],
    ["title", s.title],
    ["description", s.description],
  ];
  for (const [name, text] of fields) {
    for (const hit of bannedHits(text)) problems.push(`${name}: banned wording "${hit}"`);
    if (name !== "title" && name !== "description") for (const hit of bannedHits(text, SCRIPT_BANNED)) problems.push(`${name}: advice wording "${hit}"`);
    for (const n of numbersIn(text)) if (!allowed.has(n)) problems.push(`${name}: the number ${n} is not in the filing or the price data`);
    if (text.includes("#")) problems.push(`${name}: contains a # sign; hashtags are added in code`);
  }
  // What must be said, said the way the facts say it.
  const has = (t: string, needle: string) => t.toLowerCase().includes(needle.toLowerCase());
  if (!has(s.hook, f.company) && !has(s.hook, f.ticker)) problems.push("hook: does not name the stock");
  if (!/\bbought\b/i.test(s.hook)) problems.push('hook: must say "bought"');
  if (f.owner === "a spouse" && !/spouse/i.test(s.hook + s.receiptSay)) problems.push("the filing says a spouse owns this; the script must say so");
  if (f.owner === "a dependent child" && !/child/i.test(s.hook + s.receiptSay)) problems.push("the filing says a dependent child owns this; the script must say so");
  if (!has(s.receiptSay, f.party)) problems.push(`receipt line: must say the party (${f.party})`);
  const otherParties = ["Democrat", "Republican", "Independent"].filter((p) => p !== f.party);
  for (const p of otherParties) if ([s.hook, s.receiptSay, s.resultSay, s.stampSay].some((l) => has(l, p))) problems.push(`script names the wrong party (${p})`);
  if (!has(s.receiptSay, f.stateName)) problems.push(`receipt line: must say the state (${f.stateName})`);
  for (const [label, d] of [["trade", f.tradeDate], ["filed", f.filedDate]] as const)
    if (!has(s.receiptSay, longDate(d).replace(/, \d{4}$/, "")) && !has(s.receiptSay, shortDate(d))) problems.push(`receipt line: missing the ${label} date (${longDate(d)})`);
  if (f.prices) {
    if (!has(s.resultSay, moveWords(f.prices.stock.changePct))) problems.push(`result line: must say the stock is ${moveWords(f.prices.stock.changePct)}`);
    if (!has(s.resultSay, moveWords(f.prices.market.changePct))) problems.push(`result line: must say the S&P 500 is ${moveWords(f.prices.market.changePct)}`);
    if (!/S&P 500/.test(s.resultSay)) problems.push('result line: must say "S&P 500"');
  } else if (s.resultSay !== PRICE_PENDING_LINE) problems.push("result line: no licensed prices, so it must say the price check is pending");
  if (f.stamp === "FILED LATE" && !(has(s.stampSay, `${f.daysLate} days`) && /late|past|after/i.test(s.stampSay))) problems.push(`stamp line: must say ${f.daysLate} days late`);
  if (f.stamp === "BEAT THE MARKET" && !/\bbeat\b/i.test(s.stampSay)) problems.push('stamp line: must say it beat the market');
  if (f.stamp === "LOST TO THE MARKET" && !/\blost\b|\btrailed\b/i.test(s.stampSay)) problems.push("stamp line: must say it lost to the market");

  const lines = spokenLines(s);
  const words = lines.join(" ").split(/\s+/).length;
  if (words > MAX_SPOKEN_WORDS) problems.push(`script has ${words} spoken words; limit is ${MAX_SPOKEN_WORDS} to stay under 40 seconds`);
  // Numbers and names lift the reading grade without making a line hard; grade the words only.
  const plain = (l: string) => l.replace(/\$?\d[\d,.]*%?/g, "ten").replace(new RegExp(f.company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "it").replace(new RegExp(f.memberName, "g"), "Sam");
  const r = checkReadability(lines.map((l) => plain(/[.!?]$/.test(l) ? l : `${l}.`)).join(" "));
  problems.push(...r.problems.map((p) => `readability: ${p}`));
  for (const line of lines) if (fkGrade(plain(line)) > 12) problems.push(`readability: hard line "${line}"`);
  if (s.title.length > 100) problems.push("title over 100 characters");
  return { ok: problems.length === 0, problems };
}

const CHECK_A = `You are the fact checker for "Congress Receipts", a neutral news channel about stock trades members of Congress report in official filings.
You get FACTS (from the filing and a cited price source) and a finished SCRIPT. Check the script against FACTS only.
Say "skip" if any number differs from FACTS, any claim is not in FACTS, the owner is wrong (a spouse's trade said to be the member's), or anything hints at why the member traded or what they knew.
Say "skip" for any advice to buy, sell, copy or follow a trade.
List every problem that matters. An empty list means you would publish it as is. Do not list style preferences.
The closer "${config().channel.closer}" asks viewers about the policy of members of Congress trading stocks. It is fixed and not a claim.`;

const CHECK_B = `You are an independent second reviewer for a neutral news channel. Assume the script may be wrong. You have not seen anyone else's review.
1. Compare every number, date, name, party and state in SCRIPT with FACTS. Any mismatch means "skip".
2. Read it as a viewer from either party. Would anything feel slanted, suggest wrongdoing, or hint at motive or hidden knowledge? Then "skip".
3. Any trading advice, or anything a viewer could take as a signal to trade? Then "skip".
Be strict. If in doubt, "skip". List only problems that matter. The closer "${config().channel.closer}" is fixed.`;

function checkPrompt(s: Script, f: Facts) {
  return `FACTS\n${JSON.stringify(factsForModel(f), null, 2)}\n\nSCRIPT\n${JSON.stringify({ ...s, closer: config().channel.closer }, null, 2)}`;
}

export interface CheckResult {
  pass: boolean;
  mechanical: MechanicalResult;
  a?: Verdict;
  b?: Verdict;
  reason: string;
  reviewed: string; // what reviewed it, for the record
}

/** Publish only when the code checks pass and both independent reviews say publish with no problems. */
export async function check(llm: LLM | null, s: Script, f: Facts, number: number): Promise<CheckResult> {
  const mechanical = mechanicalCheck(s, f, number);
  if (!mechanical.ok) return { pass: false, mechanical, reason: `code check: ${mechanical.problems[0]}`, reviewed: "code checks" };
  if (!llm) return { pass: true, mechanical, reason: "code checks passed; model reviews skipped (no model key, dry run only)", reviewed: "code checks only (dry run)" };
  const model = config().models.checker;
  const [a, b] = await Promise.all([
    llm.json({ role: "checker-a", model, system: CHECK_A, user: checkPrompt(s, f), schema: VerdictSchema, effort: "high" }),
    llm.json({ role: "checker-b", model, system: CHECK_B, user: checkPrompt(s, f), schema: VerdictSchema, effort: "high" }),
  ]);
  const agree = a.verdict === "publish" && b.verdict === "publish";
  const sure = a.confidence >= MIN_CONFIDENCE && b.confidence >= MIN_CONFIDENCE;
  const clean = a.problems.length === 0 && b.problems.length === 0;
  const pass = agree && sure && clean;
  const reason = pass
    ? "code checks and both reviews passed"
    : !agree
      ? `a review said skip (${a.verdict} / ${b.verdict})${[...a.problems, ...b.problems][0] ? `: ${[...a.problems, ...b.problems][0]}` : ""}`
      : !sure
        ? `low confidence (${a.confidence} / ${b.confidence})`
        : `problems: ${[...a.problems, ...b.problems][0]}`;
  return { pass, mechanical, a, b, reason, reviewed: `code checks + 2 reviews (${model})` };
}
