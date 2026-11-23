"use client";

// Blog Clusters - GSC queries section on the cluster page (GC-2..GC-6): the hub
// page, Refresh / Apply all / Download, the queries table (where each query
// goes, how to use it, anchor variants) and the new-post suggestions table.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Check, CheckCheck, Download, ExternalLink, Loader2, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toExternalUrl } from "@/lib/url";
import {
  applyAllClusterSuggestions, createPostFromGscQuery, refreshClusterGsc, setClusterHub, updateClusterGscQuery,
} from "@/lib/actions/cluster-gsc";
import {
  NEW_POST_MIN_IMPRESSIONS, QUERY_ACTION_LABEL, QUERY_USAGE_LABEL,
  type ClusterGscData, type ClusterGscQuery, type QueryAction, type QueryUsage,
} from "@/lib/types/cluster-gsc";

type Filter = "all" | "review" | "accepted" | "update_existing" | "ignored";

const SELECT = "h-7 rounded-md border border-border bg-background px-1.5 text-[12px] text-foreground disabled:opacity-60";

function pathOf(url: string | null): string {
  if (!url) return "—";
  try { return new URL(url).pathname; } catch { return url; }
}

export function ClusterGscPanel({ projectId, clusterId, data, posts, canManage }: {
  projectId: string;
  clusterId: string;
  data: ClusterGscData;
  posts: { id: string; title: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "refresh" | "apply">(null);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const queries = useMemo(() => data.queries.filter((x) => x.action !== "new_post"), [data.queries]);
  const newPosts = useMemo(() => data.queries.filter((x) => x.action === "new_post" && x.status !== "rejected"), [data.queries]);
  const toApply = queries.filter((x) => x.status === "suggested" && ["assign", "hub", "update_existing"].includes(x.action)).length;
  const shown = queries.filter((x) => {
    if (q.trim() && !x.query.includes(q.trim().toLowerCase())) return false;
    if (filter === "review") return x.status === "suggested";
    if (filter === "accepted") return x.status === "accepted";
    if (filter === "update_existing") return x.action === "update_existing";
    if (filter === "ignored") return x.action === "ignore" || x.status === "rejected";
    return true;
  });

  const save = (id: string, patch: Omit<Parameters<typeof updateClusterGscQuery>[0], "project_id" | "id">) => {
    startTransition(async () => {
      const r = await updateClusterGscQuery({ project_id: projectId, id, ...patch });
      if (!r.ok) toast.error(r.error ?? "Could not save.");
      router.refresh();
    });
  };

  const refresh = async () => {
    setBusy("refresh");
    try {
      const r = await refreshClusterGsc({ project_id: projectId, cluster_id: clusterId });
      if (!r.ok) { toast.error(r.error ?? "Refresh failed."); return; }
      toast.success(`${r.fetched} queries with 50+ impressions (${r.added} new) · ${r.assigned} assigned · from ${r.rawRows ?? 0} Search Console rows`);
      if (r.ai === "fallback") toast.warning(`Claude wasn't available, so keyword matching was used: ${r.aiError ?? "unknown error"}`);
      router.refresh();
    } catch { toast.error("Refresh failed - try again."); }
    finally { setBusy(null); }
  };

  const applyAll = async () => {
    setBusy("apply");
    try {
      const r = await applyAllClusterSuggestions({ project_id: projectId, cluster_id: clusterId });
      if (!r.ok) { toast.error(r.error ?? "Could not apply."); return; }
      toast.success(`Applied ${r.accepted} suggestions to ${r.posts} posts.`);
      router.refresh();
    } catch { toast.error("Could not apply - try again."); }
    finally { setBusy(null); }
  };

  if (!data.ready) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-[13px] text-muted-foreground">
        <div className="font-semibold text-foreground">Search Console queries</div>
        Apply migration <span className="font-mono">20261123000001_cluster_gsc_queries</span> in Supabase to pull GSC queries for this cluster.
      </section>
    );
  }

  const counts = {
    all: queries.length,
    review: queries.filter((x) => x.status === "suggested").length,
    accepted: queries.filter((x) => x.status === "accepted").length,
    update_existing: queries.filter((x) => x.action === "update_existing").length,
    ignored: queries.filter((x) => x.action === "ignore" || x.status === "rejected").length,
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-heading text-[17px] font-bold text-foreground">Search Console queries</h2>
          <p className="max-w-2xl text-[12.5px] text-muted-foreground">
            Queries we360.ai already gets impressions for (last 90 days, 50+ impressions) that match this cluster&apos;s keywords - and where each should go.
          </p>
          <HubEditor projectId={projectId} clusterId={clusterId} hub={data.hub} canManage={canManage} />
          <p className="text-[11.5px] text-muted-foreground">
            {data.refresh
              ? <>Last refreshed {formatDistanceToNow(new Date(data.refresh.at), { addSuffix: true })} · {data.refresh.fetched} queries
                  {data.refresh.keywords != null && ` (searched ${data.refresh.keywords} keywords, ${data.refresh.rawRows ?? 0} Search Console rows)`}
                  {data.refresh.ai === "ok" && " · assigned by Claude"}
                  {data.refresh.ai === "fallback" && <span className="text-warning-strong"> · keyword matching (Claude unavailable: {data.refresh.aiError ?? "unknown"})</span>}</>
              : "Not refreshed yet - click Refresh to pull queries from Search Console."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { window.location.href = `/api/blog-clusters/${clusterId}/gsc-queries/export`; }} disabled={!data.queries.length}>
            <Download className="size-3.5" /> Download queries
          </Button>
          {canManage && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={refresh} disabled={!!busy}>
                {busy === "refresh" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                {busy === "refresh" ? "Refreshing (can take a minute)..." : "Refresh GSC queries"}
              </Button>
              <Button size="sm" variant="brand" className="gap-1.5" onClick={applyAll} disabled={!!busy || toApply === 0}>
                {busy === "apply" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
                Apply all suggestions{toApply ? ` (${toApply})` : ""}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {([["all", "All"], ["review", "To review"], ["accepted", "Accepted"], ["update_existing", "Update existing page"], ["ignored", "Ignored"]] as [Filter, string][]).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                filter === k ? "border-[#5B45E0]/40 bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF]" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {label} ({counts[k]})
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search queries..." className="h-8 pl-8 text-[12.5px]" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[1100px] text-[12.5px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Query</th>
              <th className="px-2 py-2 text-right font-semibold">Impr.</th>
              <th className="px-2 py-2 text-right font-semibold">Clicks</th>
              <th className="px-2 py-2 text-right font-semibold">Pos.</th>
              <th className="px-2 py-2 font-semibold">Ranks on</th>
              <th className="px-2 py-2 font-semibold">Action</th>
              <th className="px-2 py-2 font-semibold">Post</th>
              <th className="px-2 py-2 font-semibold">Use as</th>
              <th className="px-2 py-2 font-semibold">Anchor variants</th>
              <th className="px-2 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                {queries.length ? "No queries match this filter." : "No queries yet - Refresh to pull them from Search Console."}
              </td></tr>
            )}
            {shown.map((row) => (
              <QueryRow key={row.id} row={row} posts={posts} canManage={canManage} disabled={pending} onSave={save} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h3 className="text-[14px] font-semibold text-foreground">New page suggestions</h3>
        <p className="text-[12px] text-muted-foreground">
          Queries with {NEW_POST_MIN_IMPRESSIONS}+ impressions that no post in this cluster covers well. Add one to the cluster in a click, then fill its details with Add details on the post.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Query</th>
                <th className="px-2 py-2 text-right font-semibold">Impr.</th>
                <th className="px-2 py-2 text-right font-semibold">Pos.</th>
                <th className="px-2 py-2 font-semibold">Ranks on</th>
                <th className="px-2 py-2 font-semibold">Why</th>
                <th className="px-3 py-2 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {newPosts.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No new-page suggestions right now.</td></tr>
              )}
              {newPosts.map((row) => (
                <NewPostRow key={row.id} row={row} projectId={projectId} canManage={canManage} onDismiss={() => save(row.id, { status: "rejected" })} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function QueryRow({ row, posts, canManage, disabled, onSave }: {
  row: ClusterGscQuery;
  posts: { id: string; title: string }[];
  canManage: boolean;
  disabled: boolean;
  onSave: (id: string, patch: Omit<Parameters<typeof updateClusterGscQuery>[0], "project_id" | "id">) => void;
}) {
  const [anchors, setAnchors] = useState(row.anchors.join("; "));
  const usesPost = row.action === "assign";
  const usesUsage = row.action === "assign" || row.action === "hub";
  const lock = !canManage || disabled;

  return (
    <tr className={cn("border-b border-border/60 align-top last:border-0", row.status === "rejected" && "opacity-50")}>
      <td className="max-w-[240px] px-3 py-2">
        <div className="font-medium text-foreground">{row.query}</div>
        {row.reason && <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground" title={row.reason}>{row.reason}</div>}
      </td>
      <td className="px-2 py-2 text-right font-mono tabular-nums">{row.impressions.toLocaleString()}</td>
      <td className="px-2 py-2 text-right font-mono tabular-nums">{row.clicks.toLocaleString()}</td>
      <td className="px-2 py-2 text-right font-mono tabular-nums">{row.position.toFixed(1)}</td>
      <td className="max-w-[180px] px-2 py-2">
        {row.rankingPage ? (
          <a href={toExternalUrl(row.rankingPage) ?? row.rankingPage} target="_blank" rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 text-muted-foreground hover:text-foreground hover:underline" title={row.rankingPage}>
            <span className="truncate">{pathOf(row.rankingPage)}</span><ExternalLink className="size-3 shrink-0" />
          </a>
        ) : "—"}
        {row.rankingPagePosition != null && <div className="text-[10.5px] text-muted-foreground">#{row.rankingPagePosition}</div>}
      </td>
      <td className="px-2 py-2">
        <select className={SELECT} value={row.action} disabled={lock}
          onChange={(e) => onSave(row.id, { action: e.target.value as QueryAction })}>
          {(Object.keys(QUERY_ACTION_LABEL) as QueryAction[]).map((a) => <option key={a} value={a}>{QUERY_ACTION_LABEL[a]}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        {usesPost ? (
          <select className={cn(SELECT, "max-w-[200px]")} value={row.itemId ?? ""} disabled={lock}
            onChange={(e) => onSave(row.id, { item_id: e.target.value || null })}>
            <option value="">Pick a post...</option>
            {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        ) : row.action === "hub" ? <span className="text-muted-foreground">Hub page</span> : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-2 py-2">
        {usesUsage ? (
          <select className={SELECT} value={row.usage ?? "body"} disabled={lock}
            onChange={(e) => onSave(row.id, { usage: e.target.value as QueryUsage })}>
            {(Object.keys(QUERY_USAGE_LABEL) as QueryUsage[]).map((u) => <option key={u} value={u}>{QUERY_USAGE_LABEL[u]}</option>)}
          </select>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-2 py-2">
        {usesUsage ? (
          <Input value={anchors} disabled={lock} onChange={(e) => setAnchors(e.target.value)}
            onBlur={() => {
              const next = anchors.split(/[;,]/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
              if (next.join("; ") !== row.anchors.join("; ")) onSave(row.id, { anchors: next });
            }}
            placeholder="variant 1; variant 2" className="h-7 min-w-[180px] text-[12px]" />
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          <Badge variant="outline" className={cn("text-[10px]",
            row.status === "accepted" && "border-success-300 text-success-700",
            row.status === "rejected" && "text-muted-foreground")}>
            {row.status === "suggested" ? "Suggested" : row.status === "accepted" ? "Accepted" : "Rejected"}
          </Badge>
          {canManage && row.status !== "accepted" && (
            <button type="button" title="Accept" disabled={disabled} onClick={() => onSave(row.id, { status: "accepted" })}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-success-700"><Check className="size-3.5" /></button>
          )}
          {canManage && row.status !== "rejected" && (
            <button type="button" title="Reject" disabled={disabled} onClick={() => onSave(row.id, { status: "rejected" })}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-error-strong"><X className="size-3.5" /></button>
          )}
        </div>
        {row.assignedBy && <div className="mt-0.5 text-[10px] text-muted-foreground">by {row.assignedBy === "ai" ? "Claude" : row.assignedBy}</div>}
      </td>
    </tr>
  );
}

function NewPostRow({ row, projectId, canManage, onDismiss }: { row: ClusterGscQuery; projectId: string; canManage: boolean; onDismiss: () => void }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const add = async () => {
    setAdding(true);
    try {
      const r = await createPostFromGscQuery({ project_id: projectId, query_id: row.id });
      if (!r.ok) { toast.error(r.error ?? "Could not add the post."); return; }
      toast.success(`Added "${row.query}" to the cluster - fill its details with Add details.`);
      router.refresh();
    } catch { toast.error("Could not add the post."); }
    finally { setAdding(false); }
  };
  return (
    <tr className="border-b border-border/60 align-top last:border-0">
      <td className="px-3 py-2 font-medium text-foreground">{row.query}</td>
      <td className="px-2 py-2 text-right font-mono tabular-nums">{row.impressions.toLocaleString()}</td>
      <td className="px-2 py-2 text-right font-mono tabular-nums">{row.position.toFixed(1)}</td>
      <td className="max-w-[200px] truncate px-2 py-2 text-muted-foreground" title={row.rankingPage ?? undefined}>{pathOf(row.rankingPage)}</td>
      <td className="max-w-[280px] px-2 py-2 text-[11.5px] text-muted-foreground">{row.reason ?? "—"}</td>
      <td className="px-3 py-2 text-right">
        {canManage && (
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={onDismiss}>Dismiss</Button>
            <Button size="sm" variant="brand" className="h-7 gap-1 text-[12px]" onClick={add} disabled={adding}>
              {adding ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} Add to cluster
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function HubEditor({ projectId, clusterId, hub, canManage }: {
  projectId: string; clusterId: string; hub: ClusterGscData["hub"]; canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState(hub.slug ?? "");
  const [keyword, setKeyword] = useState(hub.keyword ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await setClusterHub({ project_id: projectId, cluster_id: clusterId, hub_slug: slug.trim() || null, hub_keyword: keyword.trim() || null });
      if (!r.ok) { toast.error(r.error ?? "Could not save the hub page."); return; }
      toast.success("Hub page saved.");
      setEditing(false);
      router.refresh();
    } catch { toast.error("Could not save the hub page."); }
    finally { setSaving(false); }
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[12px] font-medium text-foreground">Hub page</span>
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="URL or slug, e.g. we360.ai/employee-monitoring-software" className="h-7 w-72 text-[12px]" />
        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hub keyword" className="h-7 w-48 text-[12px]" />
        <Button size="sm" variant="brand" className="h-7 text-[12px]" onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-3 animate-spin" />} Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[12px]">
      <span className="font-medium text-foreground">Hub page:</span>
      <span className="text-muted-foreground">{hub.slug || hub.title || "not set"}</span>
      <span className="text-muted-foreground">· keyword:</span>
      <span className="text-foreground">{hub.keyword || "not set"}</span>
      {canManage && (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded px-1 text-[#5B45E0] hover:underline dark:text-[#7B62FF]">
          <Pencil className="size-3" /> Edit
        </button>
      )}
    </div>
  );
}
