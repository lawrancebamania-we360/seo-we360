"use client";

// To Publish queue: every planned blog/guide across all clusters whose artifact
// is attached but isn't live yet - the list whoever uploads to the site works
// from. Each row carries the page spec (title, slug, meta) and the artifact so
// the page can be created and the images grabbed in one place, then marked
// published with its live URL.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, ExternalLink, Image as ImageIcon, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { liveUrlFromSlug, toExternalUrl } from "@/lib/url";
import { KindBadge, PublishControl } from "@/components/sections/content-pipeline/item-controls";
import { CONTENT_KIND_LABEL, type ContentKind } from "@/lib/content-pipeline/content-type";
import type { PublishQueueRow } from "@/lib/data/blog-clusters";

const KIND_ORDER: ContentKind[] = ["blog", "guide", "listicle", "pillar", "other"];
type SortKey = "title" | "kind" | "cluster" | "assignee";

function cmp(a: string | null, b: string | null, dir: number): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b) * dir;
}

async function copySpec(r: PublishQueueRow) {
  const lines = [r.title, r.urlSlug ? `Slug: ${r.urlSlug}` : null, r.metaDescription ? `Meta: ${r.metaDescription}` : null].filter(Boolean);
  try { await navigator.clipboard.writeText(lines.join("\n")); toast.success("Page spec copied."); }
  catch { toast.error("Couldn't copy."); }
}

export function PublishQueue({ rows, siteDomain }: { rows: PublishQueueRow[]; siteDomain: string | null }) {
  const [kindFilter, setKindFilter] = useState<ContentKind | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("cluster");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const presentKinds = useMemo(() => {
    const set = new Set(rows.map((r) => r.kind));
    return KIND_ORDER.filter((k) => set.has(k));
  }, [rows]);

  const shown = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const base = kindFilter === "all" ? rows : rows.filter((r) => r.kind === kindFilter);
    return [...base].sort((a, b) => {
      let p = 0;
      if (sortKey === "title") p = cmp(a.title, b.title, dir);
      else if (sortKey === "kind") p = cmp(a.kind, b.kind, dir);
      else if (sortKey === "cluster") p = cmp(a.clusterName, b.clusterName, dir);
      else p = cmp(a.assigneeName, b.assigneeName, dir);
      return p !== 0 ? p : a.title.localeCompare(b.title);
    });
  }, [rows, kindFilter, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  if (!rows.length) {
    return (
      <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
        Nothing waiting to be published. Items show up here once a writer attaches an artifact in Blog Clusters.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {presentKinds.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={kindFilter === "all"} onClick={() => setKindFilter("all")}>All ({rows.length})</Chip>
          {presentKinds.map((k) => (
            <Chip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)}>
              {CONTENT_KIND_LABEL[k]} ({rows.filter((r) => r.kind === k).length})
            </Chip>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <SortHead k="title" label="Page" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead k="kind" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead k="cluster" label="Cluster" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead k="assignee" label="Writer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-3 py-2.5 font-semibold">Artifact</th>
              <th className="px-3 py-2.5 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const draft = toExternalUrl(r.artifactUrl);
              const drive = toExternalUrl(r.artifactDriveUrl);
              const slugHref = r.urlSlug ? liveUrlFromSlug(r.urlSlug, siteDomain ?? "") : undefined;
              return (
                <tr key={r.id} className="border-b border-border/60 align-top last:border-0 transition-colors hover:bg-muted/20">
                  <td className="max-w-[360px] px-3 py-2.5">
                    <div className="flex items-start gap-1.5">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{r.title}</div>
                        {r.urlSlug && (
                          <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                            <span className="truncate font-mono">{r.urlSlug}</span>
                            {slugHref && <a href={slugHref} target="_blank" rel="noopener noreferrer" className="hover:text-foreground"><ExternalLink className="size-2.5" /></a>}
                          </div>
                        )}
                        {r.metaDescription && <div className="mt-0.5 max-w-[340px] truncate text-[11.5px] text-muted-foreground" title={r.metaDescription}>{r.metaDescription}</div>}
                      </div>
                      <button type="button" onClick={() => copySpec(r)} title="Copy title + slug + meta" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Copy className="size-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><KindBadge kind={r.kind} /></td>
                  <td className="max-w-[160px] px-3 py-2.5">
                    <Link href={`/dashboard/blog-clusters/${r.clusterId}`} className="block truncate text-[12.5px] text-muted-foreground hover:text-foreground hover:underline" title={r.clusterName}>{r.clusterName}</Link>
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-muted-foreground">{r.assigneeName ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1 text-[12.5px]">
                      {draft && <a href={draft} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-foreground hover:underline"><Paperclip className="size-3 text-muted-foreground" /> Draft</a>}
                      {drive && <a href={drive} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-foreground hover:underline"><ImageIcon className="size-3 text-muted-foreground" /> Drive</a>}
                      {!draft && !drive && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end">
                      <PublishControl itemId={r.id} state="ready" liveUrl={null} publishedUrl={null} compact />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHead({ k, label, sortKey, sortDir, onSort, className }: {
  k: SortKey; label: string; sortKey: SortKey; sortDir: "asc" | "desc"; onSort: (k: SortKey) => void; className?: string;
}) {
  return (
    <th className={cn("px-3 py-2.5 font-semibold", className)}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sortKey === k ? (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
      </button>
    </th>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={cn(
        "cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-[#5B45E0]/40 bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF]" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
