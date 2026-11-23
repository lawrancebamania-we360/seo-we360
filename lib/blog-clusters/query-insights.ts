// Blog Clusters - GSC queries: plain-English insights per search term (GC-8,
// GC-9, GC-11). Pure and client-safe: used by the refresh job, the data read
// and the UI.

import {
  META_MAX, TITLE_MAX,
  type ClickGain, type QueryAction, type QueryDiagnosis, type QueryDrafts, type QueryUsage, type QueryUseOption,
} from "@/lib/types/cluster-gsc";
import { isQuestion } from "@/lib/blog-clusters/query-match";

/**
 * Typical organic click rate by Google rank (desktop+mobile blend from public
 * CTR studies, rounded). Used only for estimates - labelled as such in the UI.
 */
export function expectedCtr(position: number): number {
  if (!position || position <= 0) return 0;
  const p = Math.round(position);
  const curve = [0, 0.28, 0.15, 0.11, 0.08, 0.06, 0.05, 0.04, 0.03, 0.025, 0.02];
  if (p <= 10) return curve[p];
  if (p <= 20) return 0.01;
  return 0.005;
}

export function diagnose(q: { position: number; impressions: number; clicks: number }): QueryDiagnosis {
  const ctr = q.impressions ? q.clicks / q.impressions : 0;
  if (q.position > 0 && q.position <= 10.5) {
    return ctr < expectedCtr(q.position) * 0.5 ? "snippet" : "performing";
  }
  if (q.position <= 20) return "striking";
  return "weak";
}

/**
 * Extra clicks over the 90-day window. Page-1 terms: closing the gap to the
 * typical click rate at the current rank. Others: if the page reached #5.
 */
export function estimateGain(q: { position: number; impressions: number; clicks: number }): ClickGain | null {
  if (!q.impressions) return null;
  const ctr = q.clicks / q.impressions;
  const onPageOne = q.position > 0 && q.position <= 10.5;
  const target = onPageOne ? expectedCtr(q.position) : expectedCtr(5);
  const gain = Math.round(q.impressions * (target - ctr));
  if (gain < 1) return null;
  return { clicks: gain, basis: onPageOne ? "now" : "rank5" };
}

const TEMPLATE_INTENT = /\b(template|templates|example|examples|sample|samples|checklist|calculator|generator|format|spreadsheet|excel|sheet|pdf|download|tool|tools)\b/i;

/** Rule-based options for a search term - Claude refines these; also the fallback. */
export function suggestedUseOptions(
  q: { query: string; position: number; impressions: number; clicks: number },
  action: QueryAction,
): QueryUseOption[] {
  if (action === "ignore" || action === "new_post" || action === "unassigned") return [];
  const out: QueryUseOption[] = [];
  const d = diagnose(q);
  if (d === "snippet") out.push("title_meta");
  if (TEMPLATE_INTENT.test(q.query)) out.push("template");
  if (isQuestion(q.query)) out.push("faq");
  else if (d !== "performing" && q.impressions >= 100 && !out.includes("template")) out.push("h2");
  if (!out.length || (d === "weak" && !out.includes("h2") && !out.includes("faq"))) out.push("paragraph");
  if (action === "assign" || action === "hub") out.push("link_text");
  return [...new Set(out)];
}

/** Map the legacy single usage onto the new options (for rows created before GC-8). */
export function usagesFromLegacy(usage: QueryUsage | null): QueryUseOption[] {
  if (usage === "h2") return ["h2"];
  if (usage === "faq") return ["faq"];
  if (usage === "body") return ["paragraph"];
  return [];
}

/** Over-limit snippet drafts (mobile-first limits). */
export function snippetProblems(d: QueryDrafts | null | undefined): { title: boolean; meta: boolean } {
  return {
    title: !!d?.title && d.title.length > TITLE_MAX,
    meta: !!d?.meta && d.meta.length > META_MAX,
  };
}
