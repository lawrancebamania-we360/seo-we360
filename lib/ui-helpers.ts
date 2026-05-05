// UI helpers — kept separate from lib/utils.ts so shadcn updates don't overwrite them.

// Strip the trailing `[KEY]` bracketed identifier from a task title before
// display. The DB title keeps `[B1.4d]` etc. as a stable dedupe handle for
// the import script, but users shouldn't see it. Match: optional whitespace,
// `[`, anything until next `]`, end of string.
export function stripTaskKey(title: string | null | undefined): string {
  if (!title) return "";
  return title.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
}

// Strip the LEADING `[Type · Vol]` prefix that we put on tasks via the import
// script. Used by UI components that render type + volume as separate badges
// — they don't want the prefix duplicated in the title text.
export function stripTaskPrefix(title: string | null | undefined): string {
  if (!title) return "";
  return title.replace(/^\[[^\]]+\]\s*/, "").trim();
}

// Format a monthly search volume as "1.5K/mo" / "600/mo" — used in UI badges.
export function formatVolume(v: number | null | undefined): string | null {
  if (v == null || v <= 0) return null;
  if (v >= 1000) {
    const k = v / 1000;
    return `${k.toFixed(k >= 10 ? 0 : 1).replace(/\.0$/, "")}K/mo`;
  }
  return `${v}/mo`;
}

// Derive a glanceable "what kind of task is this" label from the title +
// URL, with a stable color in the we360 palette. The same label is used on
// every kanban card and in the task-detail dialog header so writers can tell
// at a glance whether they're picking up a new blog vs a page refresh vs an
// SEO ops chore.
export interface TaskKindInfo {
  action: "New" | "Update" | "Ops";
  surface: "Blog" | "Page" | "Ops";
  label: string;       // "New Blog" / "Update Page" / "SEO Ops" / etc.
  classes: string;     // tailwind classes for a Badge
}

export function taskKindLabel(task: {
  title: string;
  url?: string | null;
}): TaskKindInfo {
  const title = (task.title ?? "").toLowerCase();
  const url = (task.url ?? "").toLowerCase();

  // ---- Action: detect from title prefix ----
  let action: "New" | "Update" | "Ops" = "New";
  if (/^update\b/.test(title)) {
    action = "Update";
  } else if (
    /^(disavow|set up|clean up|internal linking|mid-plan|build monthly|8-month|data study #\d.*(kickoff|pr launch))/.test(title)
  ) {
    action = "Ops";
  }

  // ---- Surface: blog vs page vs ops ----
  let surface: "Blog" | "Page" | "Ops" = "Blog";
  if (action === "Ops") {
    surface = "Ops";
  } else if (/^\/(?:vs|alternative|integrations|solutions|in|industries)\//.test(url)) {
    surface = "Page";
  } else if (url.startsWith("/blog/")) {
    surface = "Blog";
  } else if (
    /\b(comparison page|alternative page|alternative-to page|integration page|industry page|india page|landing page|vs-competitor page)\b/.test(title) ||
    /\[b-vs\.|\[b-alt\.|\[b-int\.|\[b3\.2[a-z]?\]|\[b3\.1i\d\]|\[b4\.2\.\d\]|\[b2\.2[a-z]?\]/.test(title) ||
    /^we360 vs /.test(title) ||
    /\balternative\s*\[mcb-/.test(title) ||
    /\bintegration\s*\[mcb-/.test(title) ||
    /^workforce (management|planning) software/.test(title)
  ) {
    surface = "Page";
  } else if (
    /\b(update existing blog|write new article|write new blog|pillar #|data study|striking-distance)\b/.test(title) ||
    /\[b1\.\d|\[b6\.[34]|\[b3\.[34]|\[b5\.2[a-z]?\]|\[b8\.[1-3]|\[b7\.3\]/.test(title)
  ) {
    surface = "Blog";
  }
  // Anything left (cluster blogs, calendar-only entries) defaults to Blog.

  // ---- Label + we360-palette classes ----
  let label = action === "Ops" ? "SEO Ops" : `${action} ${surface}`;
  let classes: string;
  if (action === "Ops") {
    classes = "bg-[#7E8492]/10 text-[#7E8492] dark:text-[#9AA0B0] border-[#7E8492]/30";
  } else if (action === "New" && surface === "Page") {
    // Deepest emphasis — primary purple
    classes = "bg-[#5B45E0]/12 text-[#5B45E0] dark:text-[#7B62FF] border-[#5B45E0]/25";
  } else if (action === "New" && surface === "Blog") {
    // Lighter — secondary purple
    classes = "bg-[#7B62FF]/12 text-[#5B45E0] dark:text-[#7B62FF] border-[#7B62FF]/25";
  } else if (action === "Update" && surface === "Page") {
    // Strong yellow — clearly different from "new" work
    classes = "bg-[#FEB800]/15 text-[#8a6500] dark:text-[#FEB800] border-[#FEB800]/35";
  } else {
    // Update Blog — softer yellow
    classes = "bg-[#FEB800]/10 text-[#8a6500] dark:text-[#FEB800] border-[#FEB800]/25";
    label = "Update Blog";
  }
  return { action, surface, label, classes };
}

// Tailwind class set for the task_type badge — color-coded by action.
export function taskTypeBadgeClass(taskType: string | null | undefined): string {
  if (!taskType) return "";
  const verb = taskType.split(" ")[0]; // "New", "Update", "Delete", "Modify"
  switch (verb) {
    case "New":    return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
    case "Update": return "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900";
    case "Delete": return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900";
    case "Modify": return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
    default:       return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatPct(n: number | null | undefined, digits = 0) {
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}

export function competitionColor(c: string | null | undefined) {
  if (c === "Low Competition")
    return "text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900";
  if (c === "Medium Competition")
    return "text-amber-700 bg-amber-50 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900";
  if (c === "High Competition")
    return "text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900";
  return "text-zinc-600 bg-zinc-100 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800";
}

export function priorityColor(p: string | null | undefined) {
  if (p === "critical")
    return "text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900";
  if (p === "high")
    return "text-orange-700 bg-orange-50 ring-1 ring-inset ring-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:ring-orange-900";
  if (p === "medium")
    return "text-amber-700 bg-amber-50 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900";
  if (p === "low")
    return "text-zinc-600 bg-zinc-100 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800";
  return "text-zinc-600 bg-zinc-100 ring-1 ring-inset ring-zinc-200";
}

export function pillarTone(score: number) {
  if (score >= 75) return "emerald";
  if (score >= 50) return "amber";
  return "rose";
}

export function pillarColor(score: number) {
  const t = pillarTone(score);
  if (t === "emerald") return "text-emerald-600 dark:text-emerald-400";
  if (t === "amber") return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export function pillarRing(score: number) {
  const t = pillarTone(score);
  if (t === "emerald") return "ring-emerald-500/20 dark:ring-emerald-400/30";
  if (t === "amber") return "ring-amber-500/20 dark:ring-amber-400/30";
  return "ring-rose-500/20 dark:ring-rose-400/30";
}

export function pillarGradient(score: number) {
  const t = pillarTone(score);
  if (t === "emerald") return "from-emerald-500/10 via-emerald-500/5 to-transparent";
  if (t === "amber") return "from-amber-500/10 via-amber-500/5 to-transparent";
  return "from-rose-500/10 via-rose-500/5 to-transparent";
}

export function statusColor(s: string | null | undefined) {
  if (s === "ok") return "text-emerald-600 dark:text-emerald-400";
  if (s === "warn") return "text-amber-600 dark:text-amber-400";
  if (s === "fail" || s === "missing") return "text-rose-600 dark:text-rose-400";
  return "text-zinc-400 dark:text-zinc-500";
}

export function statusIcon(s: string | null | undefined) {
  if (s === "ok") return "✓";
  if (s === "warn") return "!";
  if (s === "fail" || s === "missing") return "×";
  return "·";
}

export function trendIcon(t: string | null | undefined) {
  if (t === "up") return "↑";
  if (t === "down") return "↓";
  if (t === "stable") return "→";
  return "•";
}

export function trendColor(t: string | null | undefined) {
  if (t === "up") return "text-emerald-600 dark:text-emerald-400";
  if (t === "down") return "text-rose-600 dark:text-rose-400";
  if (t === "stable") return "text-zinc-500 dark:text-zinc-400";
  return "text-blue-600 dark:text-blue-400";
}

// Human-readable explanations for pillar breakdown tags — shown on hover
export const BREAKDOWN_EXPLANATIONS: Record<string, string> = {
  // SEO
  cwv: "Core Web Vitals — Google's performance score (LCP, CLS, INP) averaged across mobile and desktop. Drives rankings.",
  rankings: "Percentage of your tracked keywords ranking in Google's top 10 positions.",
  meta_health: "Share of pages with correct <title>, meta description, H1, and canonical tags.",
  task_completion: "Share of open SEO tasks that have been resolved this week.",

  // AEO
  faq_schema: "Share of content pages with FAQPage JSON-LD — enables rich snippets and PAA eligibility.",
  paa_coverage: "People Also Ask coverage — how often your pages appear in Google's PAA boxes.",
  answer_format: "Answer-first content structure: TL;DR blocks, direct answers in the first paragraph, scannable Q&A.",
  snippet_eligibility: "Featured-snippet readiness: list structures, concise definitions, proper heading hierarchy.",

  // GEO
  eeat: "E-E-A-T signals: author bylines, credentials, publish/update dates, expertise markers, external citations.",
  entity_coverage: "Breadth of named entities mentioned (places, people, brands, products) — tells AI what topics you actually cover.",
  structured_data: "Schema.org JSON-LD coverage across pages — Article, Organization, BreadcrumbList, LocalBusiness, etc.",

  // SXO
  engagement: "GA4-derived engagement score: scroll depth, session duration, pages per session, bounce rate.",
  page_speed: "Average page speed score (mobile + desktop) from PageSpeed Insights API.",
  mobile_vs_desktop: "Performance gap between mobile and desktop — large gaps hurt mobile conversions.",

  // AIO
  schema: "Structured data density — JSON-LD blocks present per page. AI engines use this to cite you.",
  llms_txt: "Whether you have a /llms.txt file at the root — the emerging standard for telling AI what's canonical on your site.",
  crawler_access: "Share of AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) not blocked by your robots.txt.",
  brand_consistency: "How consistently your brand name appears across pages, titles, and schema — helps AI build a knowledge graph.",
};

export function explainBreakdownKey(key: string): string {
  return BREAKDOWN_EXPLANATIONS[key] ?? key.replace(/_/g, " ");
}

export const PILLAR_META = {
  SEO: {
    name: "SEO",
    label: "Search Engine Optimization",
    description: "Technical, content, and ranking health",
  },
  AEO: {
    name: "AEO",
    label: "Answer Engine Optimization",
    description: "FAQ schema, PAA coverage, snippet eligibility",
  },
  GEO: {
    name: "GEO",
    label: "Generative Engine Optimization",
    description: "AI citability, entities, E-E-A-T signals",
  },
  SXO: {
    name: "SXO",
    label: "Search Experience Optimization",
    description: "UX, conversion, engagement metrics",
  },
  AIO: {
    name: "AIO",
    label: "AI & LLM Optimization",
    description: "Brand mentions, llms.txt, AI crawler access",
  },
} as const;

export type PillarKey = keyof typeof PILLAR_META;
