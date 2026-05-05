import { createClient } from "@/lib/supabase/server";
import type { Integration, IntegrationProvider, IntegrationStatus } from "@/lib/types/database";

export interface IntegrationField {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "password" | "textarea";
  envVar?: string;
}

export interface IntegrationScopeItem {
  title: string;
  description: string;
  cadence: "on-kickoff" | "weekly" | "monthly" | "quarterly" | "per-request" | "on-demand";
  costEstimate?: string;
}

export interface IntegrationInfo {
  provider: IntegrationProvider;
  name: string;
  description: string;
  icon: string;
  iconBg: string;
  envVars: string[];
  fields: IntegrationField[];       // form fields to capture credentials via UI
  howToConnect: string[];
  scope: IntegrationScopeItem[];    // "Know Scope" button content — capabilities unlocked
  status: IntegrationStatus;
  envPresent: boolean;
  config: Record<string, string>;    // currently-saved values from DB
  lastChecked: string | null;
  lastError: string | null;
  docsUrl: string;
  byok?: boolean;                    // bring-your-own-key (claude, openai) — no server storage
}

const CATALOG: Record<Exclude<IntegrationProvider, "supabase">, Omit<IntegrationInfo, "status" | "envPresent" | "lastChecked" | "lastError" | "config">> = {
  apify: {
    provider: "apify",
    name: "Apify",
    description: "Powers blog discovery + full intelligence layer: SERP tracking, AI Overview citations, backlinks, Domain Authority, content gap. ~$1.30/project/month.",
    icon: "🕷️",
    iconBg: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    envVars: ["APIFY_TOKEN", "APIFY_ACTOR_ID"],
    fields: [
      { key: "api_token", label: "API Token", placeholder: "apify_api_...", type: "password", envVar: "APIFY_TOKEN" },
      { key: "actor_id", label: "Actor ID", placeholder: "trovevault/keyword-opportunity-finder", envVar: "APIFY_ACTOR_ID" },
    ],
    howToConnect: [
      "Sign up at apify.com (free tier includes $5/mo credit)",
      "Go to Settings → Integrations → API → copy your Personal API token",
      "Paste the token above and click Save",
      "Actor ID defaults to trovevault/keyword-opportunity-finder — change only if using a different actor",
    ],
    scope: [
      { title: "Blog topic discovery (PAA mining)", description: "trovevault/keyword-opportunity-finder — scrapes Google PAA + scores by competition, auto-creates blog tasks.", cadence: "weekly", costEstimate: "$0.10/run" },
      { title: "SERP rank + features tracker", description: "apify/google-search-scraper — position + PAA ownership + featured snippets + related searches.", cadence: "monthly", costEstimate: "$0.04/project" },
      { title: "AI Overview citation tracker", description: "clearpath/google-ai-overview — checks if your site is cited in Google AI Overview for target keywords.", cadence: "monthly", costEstimate: "$0.39/project" },
      { title: "Backlink profile", description: "pro100chok/ahrefs-seo-tools — referring domains, top anchors, dofollow/nofollow split.", cadence: "monthly", costEstimate: "$1.00/project" },
      { title: "Domain Authority (you + competitors)", description: "zhorex/domain-authority-checker — DA score for your domain and all tracked competitors.", cadence: "monthly", costEstimate: "$0.02/project" },
      { title: "Content gap vs competitors", description: "apilab/ai-content-gap-agent — missing subtopics, keyword ideas, outline suggestions.", cadence: "monthly", costEstimate: "$0.16/project" },
    ],
    docsUrl: "https://apify.com/store",
  },
  ga4: {
    provider: "ga4",
    name: "Google Analytics 4",
    description: "Pulls session duration, pages/session, scroll depth, conversions — feeds the SXO pillar score.",
    icon: "📊",
    iconBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    envVars: ["GOOGLE_SERVICE_ACCOUNT_JSON"],
    fields: [
      { key: "property_id", label: "GA4 Property ID", placeholder: "123456789" },
      { key: "service_account_json", label: "Service Account JSON", placeholder: `{"type": "service_account", "project_id": "...", "private_key": "..."}`, type: "textarea", envVar: "GOOGLE_SERVICE_ACCOUNT_JSON" },
    ],
    howToConnect: [
      "In Google Cloud Console: pick the we360 project",
      "APIs & Services → Enable 'Google Analytics Data API'",
      "IAM & Admin → Service Accounts → Create service account (e.g. we360-ga4) → Create JSON key → download",
      "In GA4: Admin → Property access → Add your service account email as Viewer",
      "Paste the entire JSON into the Service Account JSON field above",
      "Paste your GA4 Property ID (found in GA4 → Admin → Property Settings)",
    ],
    scope: [
      { title: "Weekly page-level traffic delta", description: "Top pages by sessions — compared week over week. Drives Overview insights.", cadence: "weekly" },
      { title: "Session duration + engagement signals", description: "Feeds the SXO pillar score.", cadence: "weekly" },
      { title: "Top-dropping pages (coming)", description: "Flags pages losing traffic over 90 days — auto-creates refresh tasks.", cadence: "weekly" },
      { title: "Conversion & goal tracking", description: "Reads GA4 conversion events into dashboard cards.", cadence: "weekly" },
    ],
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1",
  },
  gsc: {
    provider: "gsc",
    name: "Google Search Console",
    description: "Authoritative source of indexed pages, broken pages, keyword rankings, and SERP impressions.",
    icon: "🔍",
    iconBg: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    envVars: ["GOOGLE_SERVICE_ACCOUNT_JSON"],
    fields: [
      { key: "property_url", label: "GSC Property URL", placeholder: "sc-domain:skyhighindia.com or https://skyhighindia.com/" },
      { key: "service_account_json", label: "Service Account JSON (same as GA4)", placeholder: `{"type": "service_account", ...}`, type: "textarea", envVar: "GOOGLE_SERVICE_ACCOUNT_JSON" },
    ],
    howToConnect: [
      "Use the SAME Google Cloud service account as GA4 (one key serves both)",
      "APIs & Services → Enable 'Search Console API' + 'Indexing API'",
      "In Search Console: Property → Settings → Users and permissions → Add the service-account email with Restricted role",
      "Paste the GSC property URL above (sc-domain:... for Domain property, full https URL for URL-prefix property)",
    ],
    scope: [
      { title: "Query-level impression / click / CTR", description: "Which keywords drive traffic — fed into Keywords section.", cadence: "weekly" },
      { title: "Broken page detection", description: "Authoritative list of indexed vs. broken pages — auto-creates fix tasks.", cadence: "weekly" },
      { title: "Keyword cannibalization detector (coming)", description: "Finds URLs competing for the same query — very common, rarely caught.", cadence: "weekly" },
      { title: "Ranking position deltas", description: "Tracks keyword rank movement week-over-week.", cadence: "weekly" },
    ],
    docsUrl: "https://developers.google.com/webmaster-tools",
  },
  pagespeed: {
    provider: "pagespeed",
    name: "PageSpeed Insights",
    description: "Real Lighthouse scores for mobile + desktop. Drives the SXO pillar and CWV page.",
    icon: "⚡",
    iconBg: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
    envVars: ["PAGESPEED_API_KEY"],
    fields: [
      { key: "api_key", label: "API Key", placeholder: "AIza...", type: "password", envVar: "PAGESPEED_API_KEY" },
    ],
    howToConnect: [
      "Google Cloud Console → APIs & Services → Credentials → Create credentials → API key",
      "Restrict the key to 'PageSpeed Insights API'",
      "Paste into the field above and click Save",
      "Free quota: 25,000 requests/day",
    ],
    scope: [
      { title: "Mobile + desktop Lighthouse scores", description: "Real field-data scores for each tracked URL.", cadence: "weekly" },
      { title: "Core Web Vitals (LCP / CLS / INP)", description: "Drives the SXO pillar and dedicated CWV page.", cadence: "weekly" },
      { title: "Performance opportunity tasks", description: "Auto-creates tasks for images, JS, or render-blocking issues over thresholds.", cadence: "weekly" },
    ],
    docsUrl: "https://developers.google.com/speed/docs/insights/v5/get-started",
  },
  claude: {
    provider: "claude",
    name: "Anthropic Claude",
    description: "AI article generation. Bring your own key — pasted per request, never stored server-side.",
    icon: "🤖",
    iconBg: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    envVars: [],
    fields: [],
    byok: true,
    howToConnect: [
      "Sign up at console.anthropic.com",
      "Create an API key in Settings → API Keys",
      "When you click 'Generate article', paste the key into the BYOK modal",
      "Optionally check 'Remember for this session' — key stays in browser sessionStorage, wiped on tab close",
      "We never write your key to disk or send it elsewhere",
    ],
    scope: [
      { title: "AI article generation", description: "Full blog draft from attached brief — keyword, outline, supporting links, reference images.", cadence: "per-request" },
      { title: "AI keyword suggestion (project setup)", description: "Generate seed keywords from domain + industry on project creation.", cadence: "per-request" },
      { title: "E-E-A-T signal analyzer (coming)", description: "Judges author credibility, review schema, about-page completeness.", cadence: "on-demand" },
    ],
    docsUrl: "https://docs.anthropic.com/claude/docs",
  },
  openai: {
    provider: "openai",
    name: "OpenAI",
    description: "Alternative BYOK provider for article generation. GPT-4o recommended.",
    icon: "✨",
    iconBg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    envVars: [],
    fields: [],
    byok: true,
    howToConnect: [
      "Sign up at platform.openai.com",
      "Create an API key in Settings → API Keys",
      "Same BYOK flow as Claude — paste per-request, optionally remember for session",
    ],
    scope: [
      { title: "AI article generation (GPT-4o)", description: "Alternative to Claude for article drafts.", cadence: "per-request" },
      { title: "AI keyword suggestion (project setup)", description: "GPT-4o seeds keywords from domain + industry.", cadence: "per-request" },
      { title: "E-E-A-T signal analyzer (coming)", description: "Judges author credibility on published pages.", cadence: "on-demand" },
    ],
    docsUrl: "https://platform.openai.com/docs",
  },
};

function envPresent(vars: string[]): boolean {
  if (vars.length === 0) return true;
  return vars.every((v) => !!process.env[v] && process.env[v]!.length > 3);
}

function configComplete(fields: IntegrationField[], config: Record<string, string>): boolean {
  if (fields.length === 0) return true;
  return fields.every((f) => (config[f.key] && config[f.key].length > 0) || (f.envVar && process.env[f.envVar]));
}

export async function getIntegrations(): Promise<IntegrationInfo[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("integrations").select("*").is("project_id", null);
  const rows = (data ?? []) as Integration[];
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return (Object.keys(CATALOG) as Array<keyof typeof CATALOG>).map((p) => {
    const base = CATALOG[p];
    const row = byProvider.get(p);
    const config = (row?.config as Record<string, string>) ?? {};
    const hasEnv = envPresent(base.envVars);
    const complete = configComplete(base.fields, config);

    let status: IntegrationStatus;
    if (base.byok) {
      status = "connected";  // BYOK is always "available"
    } else if (hasEnv || complete) {
      status = "connected";
    } else {
      status = "setup_required";
    }

    return {
      ...base,
      status,
      envPresent: hasEnv,
      config,
      lastChecked: row?.last_checked_at ?? null,
      lastError: row?.last_error ?? null,
    };
  });
}
