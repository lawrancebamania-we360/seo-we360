"use server";

// Competitors: on-demand "Refresh" of a domain's Top 10 pages via the Apify
// Ahrefs actor (searchType "traffic_overview"). Admin-only — it spends a little
// Apify credit per run. Wipes and re-inserts that domain's rows so the board
// always shows one coherent snapshot. competitorId null = the project's own
// domain (passed with its domain so we can scope the query).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user";
import { env, hasApify } from "@/lib/env";
import { runTrafficOverview } from "@/lib/apify/intelligence";
import { isMissingTable, isMissingColumn } from "@/lib/ai-citation/run-state";

const MIGRATION_HINT = "This needs the 20261112000003 migration applied in Supabase first.";

const Input = z.object({
  project_id: z.string().uuid(),
  competitor_id: z.string().uuid().nullable(),
  domain: z.string().trim().min(3).max(255),
});

export async function refreshCompetitorTopPages(
  input: z.infer<typeof Input>,
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a valid domain." };
  const { project_id, competitor_id, domain } = parsed.data;

  const ctx = await getUserContext();
  if (!ctx.canManageTeam) return { ok: false, error: "Only admins can refresh top pages." };
  if (!hasApify()) return { ok: false, error: "APIFY_TOKEN isn't configured." };

  // Normalise to a bare host (the actor wants a domain, not a full URL).
  const host = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "").trim();
  if (!host) return { ok: false, error: "Could not read that domain." };

  const { topPages, error } = await runTrafficOverview({ token: env().APIFY_TOKEN!, domain: host, maxResults: 10 });
  if (error && topPages.length === 0) return { ok: false, error: `Ahrefs fetch failed: ${error}` };
  if (topPages.length === 0) return { ok: false, error: "No top pages came back for this domain." };

  const supabase = await createClient();
  const now = new Date().toISOString();

  // Replace this domain's existing rows. Scope the delete by competitor_id
  // (null for the project's own domain) so refreshing one brand never touches
  // another's rows.
  let del = supabase.from("competitor_top_pages").delete().eq("project_id", project_id);
  del = competitor_id === null ? del.is("competitor_id", null) : del.eq("competitor_id", competitor_id);
  const { error: delErr } = await del;
  if (delErr) return { ok: false, error: isMissingTable(delErr.message) || isMissingColumn(delErr.message) ? MIGRATION_HINT : delErr.message };

  const rows = topPages.map((p, i) => ({
    project_id, competitor_id, domain: host,
    url: p.url, estimated_traffic: p.estimated_traffic, traffic_share: p.traffic_share,
    rank: i + 1, fetched_at: now,
  }));
  const { error: insErr } = await supabase.from("competitor_top_pages").insert(rows);
  if (insErr) return { ok: false, error: isMissingTable(insErr.message) || isMissingColumn(insErr.message) ? MIGRATION_HINT : insErr.message };

  revalidatePath("/dashboard/competitors");
  return { ok: true, count: rows.length };
}
