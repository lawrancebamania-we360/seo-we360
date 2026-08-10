// AI-Visibility "trust" vocabulary, shared by server reads (report/evidence/
// sentiment) and the client report UI. Pure constants + tiny pure helpers only -
// this file must stay importable from client components (no server-only imports).

// ---- Funnel stages (feature 3: persona x funnel-stage gap matrix) ----------
//
// Derived from the ACTUAL prompt vocabulary in prompts.ts, not invented:
// ai_citation_prompts.tags = [intent, "branded"|"unbranded"] where intent is
// PromptIntent = informational | commercial | comparison | transactional, and
// the reputation bucket is the ONLY branded one (a current/prospective customer
// checking the brand = the Trust stage).
export type FunnelStage = "awareness" | "consideration" | "decision" | "trust";

export const FUNNEL_STAGES: FunnelStage[] = ["awareness", "consideration", "decision", "trust"];

export const FUNNEL_STAGE_LABEL: Record<FunnelStage, string> = {
  awareness: "Awareness",
  consideration: "Consideration",
  decision: "Decision",
  trust: "Trust",
};

export const FUNNEL_STAGE_HINT: Record<FunnelStage, string> = {
  awareness: "Buyers learning the space (informational questions)",
  consideration: "Buyers weighing options (commercial + comparison questions)",
  decision: "Buyers ready to pick (transactional questions)",
  trust: "Buyers checking you out by name (reputation questions)",
};

/** Map a prompt's tags[] to its funnel stage. Untagged (manual) prompts read as
 *  informational -> awareness, matching the generator's default intent. */
export function stageForTags(tags: string[] | null | undefined): FunnelStage {
  const t = tags ?? [];
  if (t.includes("branded")) return "trust";
  if (t.includes("transactional")) return "decision";
  if (t.includes("comparison") || t.includes("commercial")) return "consideration";
  return "awareness";
}

// ---- Brand-mention sentiment tiers (feature 2) ------------------------------
//
// Plain-English tiers (Otterly's framing), classified post-hoc into the
// previously-unused ai_citation_runs.sentiment column. Only answers where the
// brand is actually mentioned get a tier; NULL = not yet classified.
export type BrandSentiment = "recommended" | "with_caveats" | "dismissed";

export const BRAND_SENTIMENTS: BrandSentiment[] = ["recommended", "with_caveats", "dismissed"];

export const SENTIMENT_LABEL: Record<BrandSentiment, string> = {
  recommended: "Recommended",
  with_caveats: "With caveats",
  dismissed: "Dismissed",
};

/** Narrow an untyped DB value to a known tier (legacy/unknown values -> null). */
export function asBrandSentiment(v: unknown): BrandSentiment | null {
  return v === "recommended" || v === "with_caveats" || v === "dismissed" ? v : null;
}

// ---- Evidence click-through filter (feature 1) -------------------------------
//
// The one filter shape every clickable metric shares: a headline stat, a
// persona/topic/engine bar, a competitor leaderboard row, a matrix cell and a
// sentiment rollup segment all reduce to this. Applied over the LATEST run batch
// (the same scope the report renders).
export interface EvidenceFilter {
  engine?: string;
  persona?: string;
  topic?: string;
  stage?: FunnelStage;
  /** Competitor name as stored on ai_citation_competitor_hits rows. */
  competitor?: string;
  /** true = only answers that named the brand. */
  mentioned?: boolean;
  /** true = only answers that cited the site as a source. */
  cited?: boolean;
  sentiment?: BrandSentiment;
}
