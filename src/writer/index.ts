import type { Facts, Script } from "../types.js";
import { Script as ScriptSchema } from "../types.js";
import type { LLM } from "../llm/client.js";
import { config } from "../lib/config.js";
import { amountWords, longDate, moveWords, ptsWords, shortDate } from "../receipt/facts.js";

export interface HookVariant {
  id: string;
  pattern: string; // example line the writer adapts
}

/** Who made the trade, in plain words, as the filing's owner column says. */
export function whoBought(f: Facts): string {
  const base = `This ${f.memberNoun}`;
  if (f.owner === "a spouse") return `${base}'s spouse`;
  if (f.owner === "a dependent child") return `${base}'s dependent child`;
  return base;
}

export function videoTitle(f: Facts, number: number): string {
  const who = f.owner === "a spouse" ? `${f.memberTitle} ${f.memberName}'s spouse` : f.owner === "a dependent child" ? `${f.memberTitle} ${f.memberName}'s child` : `${f.memberTitle} ${f.memberName}`;
  const t = `Receipt No. ${String(number).padStart(3, "0")}: ${who} bought ${f.company}`;
  return t.length <= 100 ? t : t.slice(0, 99) + "…";
}

export const PRICE_PENDING_LINE = "The price check waits on a licensed price source.";

export function stampLine(f: Facts): string {
  if (f.stamp === null) return "This is a test render.";
  if (f.stamp === "FILED LATE") return `It was filed ${f.daysLate} days past the 45-day deadline.`;
  if (f.stamp === "BEAT THE MARKET") return `That beat the market by ${ptsWords(f.excessPts!)}.`;
  return `That lost to the market by ${ptsWords(f.excessPts!)}.`;
}

/**
 * The fixed wording: used when no writer model is set up (dry runs), and as the example the
 * writer model is shown. Every number comes straight from Facts.
 */
export const HOOK_ENDINGS: Record<string, string> = {
  "what-next": "Here's what happened next.",
  "receipt-in": "The receipt is in.",
  "since-then": "Let's see how it did.",
};

export function templateScript(f: Facts, number: number, hookId = "what-next"): Script {
  const joint = f.owner === "jointly" ? " jointly" : "";
  return {
    hook: `${whoBought(f)} bought ${amountWords(f)} of ${f.company}${joint}. ${HOOK_ENDINGS[hookId] ?? HOOK_ENDINGS["what-next"]}`,
    receiptSay: `${f.memberTitle} ${f.memberName}, ${f.party} of ${f.stateName}. Trade date ${longDate(f.tradeDate)}. Filed ${shortDate(f.filedDate)}.`,
    resultSay: f.prices ? `Since then, ${f.company} is ${moveWords(f.prices.stock.changePct)}. The S&P 500 is ${moveWords(f.prices.market.changePct)}.` : PRICE_PENDING_LINE,
    stampSay: stampLine(f),
    title: videoTitle(f, number),
    description: `${f.memberTitle} ${f.memberName} (${f.partyLetter}-${f.state}) reported buying ${f.company} (${f.ticker}) worth ${f.amountText} on ${longDate(f.tradeDate)}. The report was filed ${longDate(f.filedDate)}.`,
  };
}

export const SYSTEM = `You write 35-second YouTube Shorts for "Congress Receipts". Each video shows one stock trade a member of Congress reported in an official House filing, then what the stock did since, next to the S&P 500.

This is neutral news. Facts and numbers only.

Hard rules:
- Use only the numbers in FACTS, written exactly as FACTS formats them. Add no other numbers, no estimates, no rounding of your own.
- Never say or hint why the member traded, what they knew, or what they might have known. No words like insider, dumped, corrupt, knew, tip, timing, suspicious, ahead of, before the vote.
- Never tell anyone to buy, sell, copy or follow a trade. No advice of any kind.
- The amount is a range from the filing. Say "up to" the top of the range, as in the example.
- If the owner is a spouse or a child, say so. Never say the member bought it when the filing says a spouse did.
- Say "the S&P 500" for the market.
- Plain words. Grade 8 reading level. Every sentence under 18 words.
- Calm and even. Same tone for every party.
- Keep each line about as long as the example line. The whole video must stay under 40 seconds.
- title: leave empty (set in code). description: two short sentences restating the facts. No hashtags.`;

export function userPrompt(f: Facts, number: number, hook: HookVariant, feedback: string[] = [], previous?: Script): string {
  const example = templateScript(f, number, hook.id);
  const fix = feedback.length
    ? `\n\nYour last draft failed these checks. Fix every one:\n- ${feedback.join("\n- ")}${previous ? `\n\nYour last draft:\n${JSON.stringify(previous, null, 2)}` : ""}`
    : "";
  return `FACTS (from the filing and the price source):
${JSON.stringify(factsForModel(f), null, 2)}

Hook style to adapt: "${hook.pattern}"

Example script that passes every rule (you may reword, never change a number):
${JSON.stringify({ ...example, title: "" }, null, 2)}${fix}`;
}

/** Facts with every number pre-formatted, so the model never does arithmetic. */
export function factsForModel(f: Facts) {
  return {
    who: whoBought(f),
    member: `${f.memberTitle} ${f.memberName}`,
    party: f.party,
    state: f.stateName,
    owner: f.owner,
    company: f.company,
    ticker: f.ticker,
    amountFiled: f.amountText,
    amountSpoken: amountWords(f),
    tradeDate: longDate(f.tradeDate),
    filedDate: longDate(f.filedDate),
    stockChange: f.prices ? moveWords(f.prices.stock.changePct) : null,
    sp500Change: f.prices ? moveWords(f.prices.market.changePct) : null,
    stamp: f.stamp,
    stampLine: stampLine(f),
    daysLate: f.daysLate,
  };
}

export async function write(llm: LLM, f: Facts, number: number, hook: HookVariant, feedback: string[] = [], previous?: Script): Promise<Script> {
  const s = await llm.json({
    role: feedback.length ? "writer-retry" : "writer",
    model: config().models.writer,
    system: SYSTEM,
    user: userPrompt(f, number, hook, feedback, previous),
    schema: ScriptSchema,
    effort: "high",
  });
  return { ...s, title: videoTitle(f, number) };
}
