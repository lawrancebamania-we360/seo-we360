// Citation sources: every link any AI answer has cited for ONE category, across
// ALL checks (run batches) - not just the latest. Loaded lazily by the Citation
// sources tab (see lib/actions/ai-visibility-evidence.ts), then sorted/searched/
// paginated on the client over the slim rows returned here. No answer_text is
// shipped: the "Full answer" button fetches one transcript on demand.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCitationRows, type CitationRow, type RawCitation } from "@/lib/ai-citation/citation-aggregate";
import { isMissingColumn } from "@/lib/ai-citation/run-state";
import type { AiEngine } from "@/lib/ai-citation/types";

/** Hard ceiling. Data grows ~85 rows per category per weekly check, so this is years of headroom. */
export const CITATION_ROW_CAP = 5000;
const PAGE = 1000; // PostgREST's default max rows per request

export interface CitationSourcesData {
  rows: CitationRow[];
  /** Rows with no host / no openable link (Google AI Overview redirect stubs). */
  skipped: number;
  /** True when the cap was hit, so only the newest CITATION_ROW_CAP citations are included. */
  truncated: boolean;
}

type SourceJoin = {
  id: string;
  run_id: string;
  domain: string | null;
  url: string | null;
  title: string | null;
  is_project: boolean;
  competitor_id: string | null;
  // PostgREST returns a to-one embed as an object (an array only for to-many).
  ai_citation_runs: { engine: AiEngine; created_at: string; prompt_id: string } | null;
};

export async function getCitationSourceRows(
  supabase: SupabaseClient,
  projectId: string,
  category: string,
): Promise<CitationSourcesData> {
  // Rebuilt for every page: a Supabase query builder is single-use.
  const page = (from: number, scoped: boolean) => {
    let q = supabase
      .from("ai_citation_sources")
      .select(
        "id, run_id, domain, url, title, is_project, competitor_id, ai_citation_runs!inner(engine, created_at, prompt_id)",
        { count: "exact" },
      )
      .eq("project_id", projectId)
      .not("url", "is", null)
      .neq("url", "");
    // Scoped to THIS category via the joined run, so Employee Monitoring and
    // Workforce Analytics never mix. Skipped only if the column isn't migrated.
    if (scoped) q = q.eq("ai_citation_runs.category", category);
    return q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
  };

  let scoped = true;
  const joined: SourceJoin[] = [];
  let total = Infinity;
  let truncated = false;
  while (joined.length < total) {
    let res = await page(joined.length, scoped);
    if (res.error && scoped && isMissingColumn(res.error.message)) {
      scoped = false; // pre-category schema: single-category by necessity
      res = await page(joined.length, scoped);
    }
    if (res.error) throw new Error(res.error.message);
    const batch = (res.data ?? []) as unknown as SourceJoin[];
    if (res.count != null) total = res.count;
    if (!batch.length) break;
    joined.push(...batch);
    if (joined.length >= CITATION_ROW_CAP) { truncated = joined.length < total; break; }
  }

  const [promptsRes, compsRes] = await Promise.all([
    supabase.from("ai_citation_prompts").select("id, text").eq("project_id", projectId),
    supabase.from("competitors").select("id, name").eq("project_id", projectId),
  ]);
  const promptText = new Map(((promptsRes.data ?? []) as Array<{ id: string; text: string }>).map((p) => [p.id, p.text]));
  const compName = new Map(((compsRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));

  const raw: RawCitation[] = [];
  for (const s of joined.slice(0, CITATION_ROW_CAP)) {
    const run = s.ai_citation_runs;
    if (!run) continue;
    raw.push({
      id: s.id,
      runId: s.run_id,
      domain: s.domain,
      url: s.url,
      title: s.title,
      isProject: s.is_project,
      competitorName: s.competitor_id ? compName.get(s.competitor_id) ?? null : null,
      promptText: promptText.get(run.prompt_id) ?? "",
      engine: run.engine,
      createdAt: run.created_at,
    });
  }

  const { rows, skipped } = buildCitationRows(raw);
  return { rows, skipped, truncated };
}
