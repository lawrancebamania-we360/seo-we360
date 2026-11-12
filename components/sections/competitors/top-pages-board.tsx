"use client";

// Competitors → "Top 10 pages". One card per real brand (the project + each
// tracked competitor) showing that domain's top pages by organic traffic,
// fetched from Ahrefs via Apify. Admins get a per-card "Refresh" that spends a
// little Apify credit. Replaces the old "what they rank for" keyword board.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, ExternalLink, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { CompanyLogo } from "@/components/dashboard/company-logo";
import { refreshCompetitorTopPages } from "@/lib/actions/competitor-top-pages";
import { PROJECT_KEY, type CompetitorTopPagesGroup } from "@/lib/types/competitor-top-pages";

export interface TopPagesBrand {
  name: string;
  domain: string;
  competitorId: string | null; // null = the project's own domain
  you: boolean;
}

const fmtTraffic = (n: number | null): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
};
const prettyPath = (url: string): string => {
  try { const u = new URL(url.startsWith("http") ? url : `https://${url}`); return (u.pathname + u.search) || "/"; }
  catch { return url; }
};

export function TopPagesBoard({
  brands, groups, projectId, canManage,
}: {
  brands: TopPagesBrand[];
  groups: Map<string, CompetitorTopPagesGroup>;
  projectId: string;
  canManage: boolean;
}) {
  if (brands.length === 0) return null;
  return (
    <section>
      <div className="mb-3">
        <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">Top 10 pages</h2>
        <p className="mt-1 text-[13px] text-slate-400">
          Each domain&rsquo;s highest-traffic pages (organic), from Ahrefs.{canManage ? " Use Refresh to pull the latest." : ""}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {brands.map((b) => (
          <TopPagesCard
            key={b.competitorId ?? PROJECT_KEY}
            brand={b}
            group={groups.get(b.you ? PROJECT_KEY : (b.competitorId ?? "")) ?? null}
            projectId={projectId}
            canManage={canManage}
          />
        ))}
      </div>
    </section>
  );
}

function TopPagesCard({
  brand, group, projectId, canManage,
}: {
  brand: TopPagesBrand;
  group: CompetitorTopPagesGroup | null;
  projectId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const pages = group?.pages ?? [];

  const refresh = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const r = await refreshCompetitorTopPages({ project_id: projectId, competitor_id: brand.competitorId, domain: brand.domain });
      if (!r.ok) { toast.error(r.error ?? "Could not refresh."); return; }
      toast.success(`${brand.name}: ${r.count} pages updated.`);
      router.refresh();
    } catch { toast.error("Something went wrong."); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5">
        <CompanyLogo name={brand.name} domain={brand.domain} size={28} rounded="rounded-full" className="shrink-0 ring-1 ring-border" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-foreground">{brand.name}</span>
            {brand.you && <span className="shrink-0 rounded-full bg-ember-100 px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-[0.04em] text-ember-600">YOU</span>}
          </div>
          <div className="truncate text-[11.5px] text-slate-400">{brand.domain}</div>
        </div>
        {canManage && (
          <button type="button" onClick={refresh} disabled={loading}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11.5px] font-medium text-slate-600 transition hover:bg-muted disabled:opacity-50"
            title="Pull the latest top pages from Ahrefs">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh
          </button>
        )}
      </div>

      {pages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border px-4 py-8 text-center text-[12.5px] text-muted-foreground">
          {canManage ? "No pages yet — click Refresh to pull from Ahrefs." : "No top-page data yet."}
        </div>
      ) : (
        <ol className="space-y-1.5">
          {pages.map((p) => (
            <li key={p.rank} className="flex items-center gap-2 text-[12.5px]">
              <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-400">{p.rank}</span>
              <a href={p.url.startsWith("http") ? p.url : `https://${p.url}`} target="_blank" rel="noopener noreferrer"
                className="group inline-flex min-w-0 flex-1 items-center gap-1 text-slate-700 hover:text-primary dark:text-foreground/80" title={p.url}>
                <span className="truncate">{prettyPath(p.url)}</span>
                <ExternalLink className="size-3 shrink-0 opacity-0 transition group-hover:opacity-60" />
              </a>
              <span className="inline-flex shrink-0 items-center gap-1 font-mono tabular-nums text-slate-500" title="Estimated monthly organic traffic">
                <TrendingUp className="size-3 text-emerald-500" />{fmtTraffic(p.estimatedTraffic)}
              </span>
              {p.trafficShare != null && <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-400">{p.trafficShare.toFixed(1)}%</span>}
            </li>
          ))}
        </ol>
      )}

      {group?.fetchedAt && (
        <div className="mt-3 text-[10.5px] text-slate-400">Updated {formatDistanceToNow(new Date(group.fetchedAt), { addSuffix: true })}</div>
      )}
    </div>
  );
}
