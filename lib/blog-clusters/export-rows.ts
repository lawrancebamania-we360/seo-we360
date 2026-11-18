// Blog Clusters export: turning a planned post into spreadsheet rows. The
// detailed columns mirror the paste-import schema (lib/actions/blog-clusters.ts
// HEADER_MAP) exactly, so a cluster tab round-trips back through the importer.
// Pure functions only, so the routes stay thin and this is unit-testable.

export interface ExportItem {
  title: string;
  category: string | null;
  funnelStage: string | null;
  contentType: string | null;
  targetKeyword: string | null;
  volMo: number | null;
  serpVerdict: string | null;
  supportingKeywords: { keyword: string; volume: number | null }[];
  outline: string[];        // H2 candidates
  faqCandidates: string[];
  interlinksTo: string[];
  interlinksFrom: string[];
  metaDescription: string | null;
  urlSlug: string | null;
  primaryCta: string | null;
}

export const MAX_SUPPORTING = 15;

type Cell = string | number | null;

const join = (xs: string[]): string | null => (xs.length ? xs.join("; ") : null);

// Detailed header, in the importer's exact order (so re-paste works).
export const DETAIL_COLUMNS: string[] = [
  "Content Title", "Category", "Blog Category", "Funnel Stage", "Content Type",
  "Primary Keyword", "Vol/mo", "SERP Verdict",
  ...Array.from({ length: MAX_SUPPORTING }, (_, i) => [`Supporting Keyword ${i + 1}`, `Volume ${i + 1}`]).flat(),
  "H2 Candidates", "FAQ Candidates",
  "Interlinks To (slugs)", "Interlinks To Count",
  "Interlinks From (slugs)", "Interlinks From Count",
  "Meta Description", "URL Slug", "Primary CTA",
];

export function detailRow(clusterName: string, it: ExportItem): Cell[] {
  const supporting: Cell[] = [];
  for (let i = 0; i < MAX_SUPPORTING; i++) {
    const sk = it.supportingKeywords[i];
    supporting.push(sk?.keyword ?? null, sk ? (sk.volume ?? null) : null);
  }
  return [
    it.title, it.category, clusterName, it.funnelStage, it.contentType,
    it.targetKeyword, it.volMo, it.serpVerdict,
    ...supporting,
    join(it.outline), join(it.faqCandidates),
    join(it.interlinksTo), it.interlinksTo.length,
    join(it.interlinksFrom), it.interlinksFrom.length,
    it.metaDescription, it.urlSlug, it.primaryCta,
  ];
}

// Overview ("All") header - one row per post, the light summary.
export const OVERVIEW_COLUMNS: string[] = [
  "Cluster", "Content Title", "Content Type", "Funnel Stage", "Primary Keyword", "Vol/mo", "# Supporting KWs", "URL Slug",
];

export function overviewRow(clusterName: string, it: ExportItem): Cell[] {
  return [
    clusterName, it.title, it.contentType, it.funnelStage,
    it.targetKeyword, it.volMo, it.supportingKeywords.length, it.urlSlug,
  ];
}
