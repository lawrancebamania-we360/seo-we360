"use client";

// Analytics Ticket 10: the "Blog Clusters" category box - a real, dynamic
// list of the project's clusters (not hardcoded). Click a cluster and it
// lazy-loads (Ticket 8-9's resolve-then-join work) via a server action:
// only posts confirmed live against the sitemap are shown, each with overall
// GSC position/clicks/CTR and an expandable per-keyword table sourced from
// url_metrics.gsc_top_queries. Planned-but-not-yet-published items are noted
// as a count, not silently dropped.

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Layers, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { pathFromUrl } from "@/lib/url";
import { fetchBlogClusterAnalytics } from "@/lib/actions/analytics";
import type { BlogClusterSummary, BlogClusterAnalytics } from "@/lib/data/blog-clusters";

export function BlogClustersAnalyticsBox({ projectId, clusters }: { projectId: string; clusters: BlogClusterSummary[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BlogClusterAnalytics | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const pick = async (clusterId: string) => {
    if (activeId === clusterId) { setActiveId(null); setData(null); return; }
    setActiveId(clusterId);
    setData(null);
    setLoading(true);
    const r = await fetchBlogClusterAnalytics(projectId, clusterId);
    setLoading(false);
    setData(r);
  };

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (!clusters.length) {
    return (
      <section className="space-y-4">
        <BoxHeader />
        <div className="rounded-2xl border border-dashed border-border px-6 py-11 text-center">
          <div className="text-sm font-semibold text-slate-700 dark:text-foreground">No Blog Clusters yet</div>
          <div className="mt-1 text-[13px] text-slate-400">Clusters you add on the Blog Clusters page show up here once they have live posts.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <BoxHeader />
      <div className="flex flex-wrap gap-2">
        {clusters.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => pick(c.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              activeId === c.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-slate-600 hover:bg-muted dark:text-foreground/80",
            )}
          >
            {c.clusterName} <span className="font-mono text-[11px] font-normal text-slate-400">· {c.itemCount}</span>
          </button>
        ))}
      </div>

      {activeId && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-11 text-[13px] text-slate-400">
              <Loader2 className="size-4 animate-spin" /> Checking the sitemap and pulling rankings…
            </div>
          ) : !data ? (
            <div className="px-6 py-11 text-center text-[13px] text-slate-400">Could not load this cluster.</div>
          ) : data.items.length === 0 ? (
            <div className="px-6 py-11 text-center">
              <div className="text-sm font-semibold text-slate-700 dark:text-foreground">Nothing published yet</div>
              <div className="mt-1 text-[13px] text-slate-400">
                {data.totalCount} planned post{data.totalCount === 1 ? "" : "s"} in this cluster, none matched to a live URL on the sitemap yet.
              </div>
            </div>
          ) : (
            <div>
              {data.unpublishedCount > 0 && (
                <div className="border-b border-slate-150 bg-muted/30 px-[22px] py-2 text-[12px] text-slate-400 dark:border-border">
                  {data.unpublishedCount} more planned post{data.unpublishedCount === 1 ? "" : "s"} in this cluster {data.unpublishedCount === 1 ? "isn't" : "aren't"} live on the sitemap yet, so {data.unpublishedCount === 1 ? "it's" : "they're"} not ranked below.
                </div>
              )}
              {data.items.map((it) => {
                const isOpen = expanded.has(it.id);
                return (
                  <div key={it.id} className="border-b border-slate-150 last:border-0 dark:border-border">
                    <div className="flex items-center gap-4 px-[22px] py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold text-slate-800 dark:text-foreground">{it.title}</div>
                        <a href={it.liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 truncate font-mono text-[11.5px] text-slate-400 hover:text-primary hover:underline">
                          {pathFromUrl(it.liveUrl, it.liveUrl)} <ExternalLink className="size-2.5 shrink-0" />
                        </a>
                      </div>
                      <span className="shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums text-slate-700 dark:text-foreground/90">
                        {it.gscPosition > 0 ? `#${it.gscPosition.toFixed(1)}` : "—"}
                      </span>
                      <span className="w-16 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-slate-500">{it.gscClicks.toLocaleString()} clicks</span>
                      <span className="w-16 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-slate-500">{Math.round(it.gscCtr * 1000) / 10}% CTR</span>
                      <button
                        type="button"
                        onClick={() => toggle(it.id)}
                        aria-label={isOpen ? "Collapse" : "See keywords"}
                        className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-border bg-card text-slate-500"
                      >
                        <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} strokeWidth={2.2} />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="bg-muted/40 px-[22px] pb-4 pl-[30px] pt-1">
                        <div className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">Top keywords</div>
                        {it.topQueries.length === 0 ? (
                          <p className="text-[12.5px] text-slate-400">No keyword-level data for this page yet.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {it.topQueries.map((q) => (
                              <div key={q.query} className="flex items-center justify-between gap-3 text-[12.5px]">
                                <span className="min-w-0 truncate text-slate-600 dark:text-foreground/80">{q.query}</span>
                                <span className="shrink-0 font-mono tabular-nums text-slate-400">
                                  #{q.position.toFixed(1)} · {q.impressions.toLocaleString()} impr · {q.clicks.toLocaleString()} clicks
                                  {q.impressions > 0 && ` · ${Math.round((q.clicks / q.impressions) * 1000) / 10}% CTR`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BoxHeader() {
  return (
    <div className="flex items-center gap-2">
      <Layers className="size-4 text-slate-400" />
      <div>
        <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Blog Clusters</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Only posts confirmed live on the sitemap, with ranking · <Link href="/dashboard/blog-clusters" className="text-primary hover:underline">manage clusters</Link>
        </p>
      </div>
    </div>
  );
}
