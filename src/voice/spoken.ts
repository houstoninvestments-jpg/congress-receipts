/**
 * What the voice says. Text on screen keeps its numbers ("$15,000", "+8.1 pts"); the voice gets
 * words ("fifteen thousand dollars", "plus eight point one points"), so it never guesses at symbols.
 */

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [number, string][] = [
  [1e12, "trillion"],
  [1e9, "billion"],
  [1e6, "million"],
  [1e3, "thousand"],
];

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ""));
  return parts.join(" ");
}

/** 15000 -> "fifteen thousand", 1001 -> "one thousand one". Whole numbers only. */
export function intWords(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n < 0) return `minus ${intWords(-n)}`;
  n = Math.round(n);
  if (n < 1000) return n === 0 ? "zero" : under1000(n);
  const parts: string[] = [];
  for (const [v, name] of SCALES) {
    if (n >= v) {
      parts.push(`${intWords(Math.floor(n / v))} ${name}`);
      n %= v;
    }
  }
  if (n) parts.push(under1000(n));
  return parts.join(" ");
}

/** "8.1" -> "eight point one", "12.25" -> "twelve point two five". */
export function numWords(s: string): string {
  const [i, d0] = s.replace(/,/g, "").split(".");
  const d = d0 && /^0+$/.test(d0) ? "" : d0; // "13.0" is said "thirteen"
  const whole = intWords(Number(i || "0"));
  return d ? `${whole} point ${[...d].map((c) => ONES[Number(c)]).join(" ")}` : whole;
}

/** 2026 -> "twenty twenty-six", 2000 -> "two thousand", 2008 -> "two thousand eight". */
export function yearWords(y: number): string {
  if (y >= 2000 && y < 2010) return intWords(y);
  const hi = Math.floor(y / 100);
  const lo = y % 100;
  return `${intWords(hi)} ${lo === 0 ? "hundred" : lo < 10 ? `oh ${ONES[lo]}` : intWords(lo)}`;
}

const ORD: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
/** 7 -> "seventh", 21 -> "twenty-first", 30 -> "thirtieth". */
export function ordinalWords(n: number): string {
  const w = intWords(n);
  const m = w.match(/^(.*?)([a-z]+)$/)!;
  const last = m[2];
  const o = ORD[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return m[1] + o;
}

/** "$15,000" -> 15000, "$50K" -> 50000, "$1.5M" -> 1500000. */
function moneyValue(num: string, suffix = ""): number {
  const v = Number(num.replace(/,/g, ""));
  const mult = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9 }[suffix] ?? 1;
  return v * mult;
}

/** Spoken money: whole dollar amounts in words; ".5M" style becomes "one point five million". */
function moneyWords(num: string, suffix = ""): string {
  if (suffix && num.includes(".")) {
    const name = { k: "thousand", K: "thousand", m: "million", M: "million", b: "billion", B: "billion" }[suffix]!;
    return `${numWords(num)} ${name} dollars`;
  }
  const v = moneyValue(num, suffix);
  return `${intWords(v)} ${v === 1 ? "dollar" : "dollars"}`;
}

/** A filed range's floor is printed as $1,001, $15,001...; said aloud it's the round number, as people say it. */
const roundFloor = (v: number) => (v > 1000 && v % 1000 === 1 ? v - 1 : v);

/** A number as written: 15,000 / 1,000,001 / 12.3 / 2026. Never swallows a comma that ends a clause. */
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;

const MONTH_FULL: Record<string, string> = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Sept: "September", Oct: "October", Nov: "November", Dec: "December" };

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

/** Words that are already spoken fine and must not be spelled out as letters. */
const KEEP_CAPS = new Set(["I", "A", "US", "U.S.", "OK", "TV", "AI"]);

export interface SpokenContext {
  ticker?: string;
  company?: string;
}

/**
 * Turn a line meant for the screen into the words the voice should say.
 * Order matters: ranges before single amounts, money before plain numbers, years before numbers.
 */
export function spokenText(text: string, ctx: SpokenContext = {}): string {
  let s = text;
  s = s.replace(/\bS&P 500\b/g, "S and P five hundred");
  s = s.replace(/\bRep\.\s/g, "Representative ").replace(/\bSen\.\s/g, "Senator ").replace(/,?\s+Jr\.(?=\W|$)/g, " Junior").replace(/,?\s+Sr\.(?=\W|$)/g, " Senior");
  // Ranges: "$1,001 - $15,000", "$1,001-$15,000", "$1,001 to $15,000".
  s = s.replace(new RegExp(String.raw`\$(${NUM})([KkMmBb])?\s*(?:-|–|—|to)\s*\$(${NUM})([KkMmBb])?`, "g"), (_m, a, as, b, bs) => {
    const lo = roundFloor(moneyValue(a, as));
    return `between ${intWords(lo)} and ${moneyWords(b, bs)}`;
  });
  s = s.replace(new RegExp(String.raw`\bover\s+\$(${NUM})([KkMmBb])?`, "gi"), (_m, a, as) => `over ${moneyWords(a, as)}`);
  s = s.replace(new RegExp(String.raw`\$(${NUM})([KkMmBb](?![a-z]))?`, "g"), (_m, a, as) => moneyWords(a, as));
  // Signed changes: "+8.1 pts", "−0.7 pts", "-4.7%", "+12.3%".
  s = s.replace(new RegExp(String.raw`(^|[\s(])([+\-−])(${NUM})\s*(pts?\b|points?\b|%)`, "g"), (_m, pre, sign, n, unit) => {
    const word = sign === "+" ? "plus" : "minus";
    const u = unit === "%" ? "percent" : "points";
    return `${pre}${word} ${numWords(n)} ${u}`;
  });
  s = s.replace(new RegExp(String.raw`(${NUM})\s*%`, "g"), (_m, n) => `${numWords(n)} percent`);
  s = s.replace(new RegExp(String.raw`(${NUM})\s*pts?\b`, "g"), (_m, n) => `${numWords(n)} points`);
  // Dates: "August 7, 2026" -> "August seventh, twenty twenty-six"; "Sep 9" -> "Sep ninth".
  s = s.replace(new RegExp(`\\b(${MONTHS})\\.?\\s+(\\d{1,2})\\b`, "g"), (_m, mo, d) => `${MONTH_FULL[mo] ?? mo} ${ordinalWords(Number(d))}`);
  s = s.replace(/\b(19\d{2}|20\d{2})\b/g, (_m, y) => yearWords(Number(y)));
  // "45-day" -> "forty-five-day"
  s = s.replace(/\b(\d+)-(day|year|week|month)\b/g, (_m, n, u) => `${intWords(Number(n))}-${u}`);
  // Tickers: the company name when we know it, otherwise letter by letter.
  if (ctx.ticker) {
    const t = ctx.ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`\\s*\\(${t}\\)`, "g"), "");
    if (ctx.company) s = s.replace(new RegExp(`\\b${t}\\b`, "g"), ctx.company);
  }
  s = s.replace(/\b([A-Z]{2,5})(\.[A-Z])?\b/g, (m, letters, cls) => (KEEP_CAPS.has(m) ? m : [...letters, ...(cls ? [cls.slice(1)] : [])].join(" ")));
  // Any number left: plain words.
  s = s.replace(new RegExp(NUM, "g"), (n) => numWords(n));
  s = s.replace(/&/g, " and ").replace(/\s{2,}/g, " ").trim();
  return s;
}
