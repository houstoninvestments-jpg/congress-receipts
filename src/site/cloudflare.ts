import { pagesBaseUrl } from "../lib/config.js";
import { path, readJson, writeJson } from "../lib/util.js";

/**
 * Cloudflare Pages (free plan) through its API, with the same Pages-only token Scam or Not uses.
 * The site goes to congressreceipts.pages.dev, or the next free name.
 */

export const CF_PROJECT_CANDIDATES = ["congressreceipts", "congress-receipts", "congressreceiptsdaily"];
export const WRANGLER = "wrangler@4.151.2";
const CF_API = "https://api.cloudflare.com/client/v4";
const SAVED = () => process.env.SITE_TARGET_FILE || path("data/site-target.json");

export type SiteTarget = { kind: "github-pages"; baseUrl: string } | { kind: "cloudflare"; baseUrl: string; project: string; account: string };

interface CfResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}
export interface CfEnvVar {
  type: "plain_text" | "secret_text";
  value: string;
}
export interface CfProject {
  name: string;
  subdomain: string;
  deployment_configs?: { production?: { env_vars?: Record<string, CfEnvVar | null> } };
}

export function cloudflareApi(token: string, fetchImpl: typeof fetch = fetch) {
  const call = async <T>(method: string, rel: string, body?: unknown): Promise<CfResponse<T> & { status: number }> => {
    const res = await fetchImpl(`${CF_API}${rel}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = (await res.json().catch(() => ({ success: false, errors: [{ code: res.status, message: res.statusText }], result: null }))) as CfResponse<T>;
    return { ...j, status: res.status };
  };
  return {
    accounts: () => call<{ id: string; name: string }[]>("GET", "/accounts"),
    get: (a: string, name: string) => call<CfProject>("GET", `/accounts/${a}/pages/projects/${name}`),
    create: (a: string, name: string) => call<CfProject>("POST", `/accounts/${a}/pages/projects`, { name, production_branch: "main" }),
    remove: (a: string, name: string) => call<unknown>("DELETE", `/accounts/${a}/pages/projects/${name}`),
    /** Change only the named variables (null removes one). Others are kept by Cloudflare. */
    setEnv: (a: string, name: string, vars: Record<string, CfEnvVar | null>) =>
      call<CfProject>("PATCH", `/accounts/${a}/pages/projects/${name}`, { deployment_configs: { production: { env_vars: vars } } }),
  };
}

export type CfApi = ReturnType<typeof cloudflareApi>;

/** The account ID if given; otherwise the token's only account, so one less value to paste. */
export async function resolveAccount(api: CfApi, given?: string): Promise<string> {
  if (given) return given;
  const r = await api.accounts();
  if (r.success && r.result?.length === 1) return r.result[0].id;
  throw new Error(`could not work out the Cloudflare account (${r.result?.length ?? 0} accounts visible); set CLOUDFLARE_ACCOUNT_ID`);
}

/** First candidate whose address is exactly <name>.pages.dev. Ours is reused; a taken name is cleaned up and skipped. */
export async function resolveProject(api: CfApi, account: string, candidates = CF_PROJECT_CANDIDATES) {
  const tried: string[] = [];
  const saved = readJson<{ project?: string }>(SAVED(), {});
  const order = saved.project && candidates.includes(saved.project) ? [saved.project, ...candidates.filter((c) => c !== saved.project)] : candidates;
  for (const name of order) {
    const want = `${name}.pages.dev`;
    const existing = await api.get(account, name);
    if (existing.success && existing.result) {
      if (existing.result.subdomain === want) return done(name, tried);
      tried.push(`${name}: in this account but at ${existing.result.subdomain}`);
      continue;
    }
    const made = await api.create(account, name);
    if (!made.success || !made.result) {
      tried.push(`${name}: ${made.errors?.[0]?.message ?? `HTTP ${made.status}`}`);
      continue;
    }
    if (made.result.subdomain === want) return done(name, tried);
    tried.push(`${name}: address taken, got ${made.result.subdomain}`);
    await api.remove(account, name);
  }
  throw new Error(`no Cloudflare Pages name worked: ${tried.join("; ")}`);
}

function done(project: string, tried: string[]) {
  writeJson(SAVED(), { project, address: `https://${project}.pages.dev` });
  return { project, baseUrl: `https://${project}.pages.dev`, tried };
}

export async function pickSiteTarget(env = process.env, fetchImpl: typeof fetch = fetch): Promise<SiteTarget> {
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  if (token) {
    const api = cloudflareApi(token, fetchImpl);
    const account = await resolveAccount(api, env.CLOUDFLARE_ACCOUNT_ID?.trim());
    const r = await resolveProject(api, account);
    return { kind: "cloudflare", baseUrl: r.baseUrl, project: r.project, account };
  }
  return { kind: "github-pages", baseUrl: pagesBaseUrl(env.GITHUB_REPOSITORY ?? "houstoninvestments-jpg/congress-receipts") };
}
