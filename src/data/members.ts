import type { Filing, Member, Party } from "../types.js";
import { path, readJson, writeJson } from "../lib/util.js";
import { USER_AGENT } from "./house.js";

/**
 * Party, state and district come from the public-domain congress-legislators project
 * (https://github.com/unitedstates/congress-legislators), not from us. A filer we can't match
 * to exactly one sitting member is skipped.
 */

export const LEGISLATORS_URL = "https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-current.json";
const FILE = () => process.env.MEMBERS_FILE || path("data/members.json");

export const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "the District of Columbia", PR: "Puerto Rico", GU: "Guam",
  VI: "the U.S. Virgin Islands", AS: "American Samoa", MP: "the Northern Mariana Islands",
};

interface Legislator {
  id: { bioguide: string };
  name: { first: string; last: string; official_full?: string; nickname?: string };
  bio: { gender?: string };
  terms: { type: string; state: string; district?: number; party: string; start: string; end: string }[];
}

export async function refreshMembers(fetchImpl: typeof fetch = fetch): Promise<Member[]> {
  const res = await fetchImpl(LEGISLATORS_URL, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`legislators list -> ${res.status}`);
  const list = (await res.json()) as Legislator[];
  const members = list
    .map((l) => ({ l, t: l.terms.at(-1)! }))
    .filter(({ t }) => t.type === "rep")
    .map(({ l, t }): Member => ({
      bioguide: l.id.bioguide,
      name: l.name.official_full ?? `${l.name.first} ${l.name.last}`,
      official: `Rep. ${l.name.official_full ?? `${l.name.first} ${l.name.last}`}`,
      party: (["Democrat", "Republican"].includes(t.party) ? t.party : "Independent") as Party,
      state: t.state,
      district: t.district ?? null,
      gender: l.bio.gender === "M" || l.bio.gender === "F" ? l.bio.gender : null,
    }));
  writeJson(FILE(), { source: LEGISLATORS_URL, fetchedAt: new Date().toISOString(), members });
  return members;
}

export const loadMembers = (): Member[] => readJson<{ members: Member[] }>(FILE(), { members: [] }).members;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The one sitting House member for this seat whose name contains the filer's last name. */
export function matchMember(f: Filing, members: Member[]): Member | null {
  const m = f.stateDst.match(/^([A-Z]{2})(\d{2})$/);
  if (!m) return null;
  const [, state, d] = m;
  const district = Number(d);
  const last = norm(f.last).split(" ").filter((w) => w.length > 1);
  const hits = members.filter((x) => x.state === state && (x.district ?? 0) === district && last.every((w) => norm(x.name).includes(w)));
  return hits.length === 1 ? hits[0] : null;
}
