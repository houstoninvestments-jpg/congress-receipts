import { path, readJson } from "./util.js";

export interface ChannelConfig {
  channel: { name: string; handle: string; tagline: string; notAdvice: string; closer: string; policyDate: string; contactEmail?: string };
  cadence: { shortsPerDay: number; timezone: string };
  models: { writer: string; checker: string };
  voice: { provider: "kokoro"; kokoroVoice: string; lang: string; speed: number };
  ctaStates: ("none" | "soft" | "direct")[];
  selection: { minDaysSinceTrade: number; maxDaysSinceFiling: number; partyWindowDays: number; memberCooldownDays: number };
  site: { baseUrl: string };
  affiliate: { enabled: boolean; label: string; name: string; url: string; blurb: string };
  newsletter: { enabled: boolean; name: string; blurb: string; formAction: string };
  youtube: {
    categoryId: string;
    defaultLanguage: string;
    privacyStatus: "public" | "unlisted" | "private";
    firstUploadPrivacy: "private";
    dailyQuotaBudget: number;
  };
}

let cached: ChannelConfig | undefined;

/** The free GitHub Pages address for a repo, used until Cloudflare Pages is set up. */
export function pagesBaseUrl(repository: string): string {
  const [owner, name] = repository.split("/");
  if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) return `https://${name.toLowerCase()}`;
  return `https://${owner.toLowerCase()}.github.io/${name}`;
}

/** Public settings live in config/channel.json. Host env vars may override the ones that differ per deploy. */
export function config(): ChannelConfig {
  if (cached) return cached;
  const c = readJson<ChannelConfig>(path("config/channel.json"));
  const e = process.env;
  if (e.SITE_BASE_URL) c.site.baseUrl = e.SITE_BASE_URL.replace(/\/+$/, "");
  // Never committed to this public repo: set as a GitHub Actions variable or secret and read at build time.
  if (e.CONTACT_EMAIL?.trim()) c.channel.contactEmail = e.CONTACT_EMAIL.trim();
  cached = c;
  return c;
}

export function resetConfigCache() {
  cached = undefined;
}
