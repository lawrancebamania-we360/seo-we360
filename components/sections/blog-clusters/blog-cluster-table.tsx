"use client";

// Blog Clusters (Ticket 4): compact table of a cluster's planned posts.
// Clicking a row opens the full spreadsheet-shaped detail (supporting
// keywords, SERP verdict, interlinks, meta, slug, CTA) in a drawer rather
// than cramming ~15 columns into the table itself.
//
// Ticket 11: both the table (all rows) and the drawer (one row) can copy
// their full detail as a clean, LLM-ready text block - so a writer can hand
// the whole cluster (or just one brief) to their AI tool of choice without
// clicking into every row to piece the fields together by hand.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchBox, matchesQuery } from "@/components/ui/search-box";
import { ClusterItemAssignee } from "@/components/sections/blog-clusters/cluster-item-assignee";
import { KindSelect, BulkKindBar, PublishStateBadge, PageSpec, ArtifactEditor, PublishControl } from "@/components/sections/content-pipeline/item-controls";
import { ToolEditor } from "@/components/sections/content-pipeline/tool-editor";
import { CONTENT_KIND_LABEL, type ContentKind } from "@/lib/content-pipeline/content-type";
import type { BlogClusterItemRow } from "@/lib/data/blog-clusters";
import type { Member } from "@/components/sections/assignee-picker";
import { ClusterItemDetailsButton } from "@/components/sections/blog-clusters/cluster-item-details-button";
import { BulkPasteDetailsButton } from "@/components/sections/blog-clusters/bulk-paste-details-button";
import { reservedAnchors } from "@/lib/blog-clusters/query-match";
import { QUERY_USAGE_LABEL, USE_OPTION_LABEL, type PostGscQuery, type QueryUseOption } from "@/lib/types/cluster-gsc";
import { usagesFromLegacy } from "@/lib/blog-clusters/query-insights";

/** The options chosen for a query (new multi-select), falling back to the legacy single usage. */
function queryOptions(q: PostGscQuery): QueryUseOption[] {
  return q.usages?.length ? q.usages : usagesFromLegacy(q.usage);
}

/** Copy-ready wording for each chosen option. */
function draftLines(q: PostGscQuery): string[] {
  const d = q.drafts;
  if (!d) return [];
  const out: string[] = [];
  const opts = queryOptions(q);
  if (opts.includes("title_meta") && d.title) out.push(`    SEO title (${d.title.length}/60): ${d.title}`);
  if (opts.includes("title_meta") && d.meta) out.push(`    Meta description (${d.meta.length}/120): ${d.meta}`);
  if (opts.includes("h2") && d.h2) out.push(`    H2: ${d.h2}`);
  if (opts.includes("faq") && d.faqQuestion) out.push(`    FAQ Q: ${d.faqQuestion}`);
  if (opts.includes("faq") && d.faqAnswer) out.push(`    FAQ A: ${d.faqAnswer}`);
  if (opts.includes("paragraph") && d.paragraph) out.push(`    Paragraph: ${d.paragraph}`);
  if (opts.includes("template") && d.template) out.push(`    Template / tool: ${d.template}`);
  return out;
}

/** The cluster's hub page, for anchor instructions in Copy details. */
export interface CopyHub { slug: string | null; keyword: string | null; title: string }

function anchorLines(it: BlogClusterItemRow, all: BlogClusterItemRow[], hub: CopyHub | null): string[] {
  const lines: string[] = [];
  if (it.gscQueries.length) {
    lines.push("Search Console queries to cover (people already search these):");
    for (const q of it.gscQueries) {
      const opts = queryOptions(q).map((o) => USE_OPTION_LABEL[o]).join(", ") || QUERY_USAGE_LABEL[q.usage];
      lines.push(`- ${q.query} - ${opts}${q.impressions ? ` (${q.impressions.toLocaleString()} impressions, pos ${q.position.toFixed(1)})` : ""}`);
      lines.push(...draftLines(q));
    }
    lines.push("Work each one in naturally; never repeat a query just to increase keyword density.", "");
  }
  const plan = it.anchorPlan;
  if (plan.toHub || plan.fromHub || plan.variants?.length) {
    lines.push("Internal linking plan:");
    if (plan.toHub && hub) lines.push(`- Link from this post to the hub page (${hub.slug || hub.title}) using the anchor: "${plan.toHub.text}"`);
    if (plan.fromHub) lines.push(`- The hub page links to this post with: "${plan.fromHub.text}"`);
    if (plan.variants?.length) lines.push(`- Anchor variants other posts may use to link here: ${plan.variants.map((v) => `"${v}"`).join(", ")}`);
    const reserved = reservedAnchors(it.id, all.map((p) => ({ id: p.id, primary: p.targetKeyword, variants: p.anchorPlan.variants ?? [] })));
    if (reserved.length) lines.push(`- Do NOT use these as anchor text for links to this post (they're reserved for other posts): ${reserved.slice(0, 20).join(", ")}`);
    lines.push("- Keep links natural - don't force every anchor in.", "");
  }
  return lines;
}

const KIND_ORDER: ContentKind[] = ["blog", "guide", "listicle", "pillar", "other"];

const FUNNEL_TONE: Record<string, string> = {
  tofu: "border-info-300 text-info-700",
  mofu: "border-warning-300 text-warning-700",
  bofu: "border-success-300 text-success-700",
};

function formatItemForCopy(it: BlogClusterItemRow, all: BlogClusterItemRow[] = [], hub: CopyHub | null = null): string {
  const lines: string[] = [`## ${it.title}`, ""];
  const meta = [
    it.category && `Category: ${it.category}`,
    it.funnelStage && `Funnel stage: ${it.funnelStage}`,
    it.contentType && `Content type: ${it.contentType}`,
  ].filter(Boolean);
  if (meta.length) lines.push(meta.join(" | "), "");

  if (it.targetKeyword) {
    lines.push(`Primary keyword: ${it.targetKeyword}${it.volMo != null ? ` (${it.volMo.toLocaleString()}/mo)` : ""}`);
  }
  if (it.supportingKeywords.length) {
    lines.push(`Supporting keywords: ${it.supportingKeywords.map((k) => k.volume != null ? `${k.keyword} (${k.volume.toLocaleString()}/mo)` : k.keyword).join(", ")}`);
  }
  if (it.serpVerdict) lines.push(`SERP verdict: ${it.serpVerdict}`);
  lines.push("");

  if (it.outline.length) {
    lines.push("H2 candidates:", ...it.outline.map((h) => `- ${h}`), "");
  }
  if (it.faqCandidates.length) {
    lines.push("FAQ candidates:", ...it.faqCandidates.map((q) => `- ${q}`), "");
  }
  lines.push(...anchorLines(it, all, hub));
  if (it.interlinksTo.length) lines.push(`Interlinks to: ${it.interlinksTo.join(", ")}`);
  if (it.interlinksFrom.length) lines.push(`Interlinks from: ${it.interlinksFrom.join(", ")}`);
  if (it.metaDescription) lines.push(`Meta description: ${it.metaDescription}`);
  if (it.urlSlug) lines.push(`URL slug: ${it.urlSlug}`);
  if (it.primaryCta) lines.push(`Primary CTA: ${it.primaryCta}`);

  return lines.join("\n").trim();
}

function formatClusterForCopy(clusterName: string, items: BlogClusterItemRow[], all: BlogClusterItemRow[], hub: CopyHub | null): string {
  return [`# ${clusterName} — ${items.length} planned post${items.length === 1 ? "" : "s"}`, "", ...items.map((it) => formatItemForCopy(it, all, hub))].join("\n\n---\n\n");
}

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("Couldn't copy - select the text and copy manually.");
  }
}

export function BlogClusterTable({ clusterName, clusterId, hub = null, items, projectId, members, canManage, siteDomain }: {
  clusterName: string;
  clusterId: string;
  hub?: CopyHub | null;
  items: BlogClusterItemRow[];
  projectId: string;
  members: Member[];
  canManage: boolean;
  siteDomain: string;
}) {
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<ContentKind | "all">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Derive the open row from the live `items` prop (not a stored copy) so it
  // reflects an artifact/publish change after router.refresh() without reopening.
  const openItem = items.find((i) => i.id === openItemId) ?? null;

  // Which content kinds actually appear in this cluster, for the filter chips.
  const presentKinds = useMemo(() => {
    const set = new Set(items.map((i) => i.kind));
    return KIND_ORDER.filter((k) => set.has(k));
  }, [items]);
  const shown = items.filter((i) => (kindFilter === "all" || i.kind === kindFilter) && matchesQuery(q, i.title, i.targetKeyword, i.urlSlug, i.contentType, i.assigneeName));

  const toggleOne = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShownSelected = shown.length > 0 && shown.every((i) => selected.has(i.id));
  const toggleAll = () => setSelected((prev) => {
    const n = new Set(prev);
    if (shown.every((i) => n.has(i.id))) shown.forEach((i) => n.delete(i.id));
    else shown.forEach((i) => n.add(i.id));
    return n;
  });
  const selectedIds = [...selected];

  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No rows in this cluster yet.</p>;
  }

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        {presentKinds.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={kindFilter === "all"} onClick={() => setKindFilter("all")}>All ({items.length})</FilterChip>
            {presentKinds.map((k) => (
              <FilterChip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)}>
                {CONTENT_KIND_LABEL[k]} ({items.filter((i) => i.kind === k).length})
              </FilterChip>
            ))}
          </div>
        ) : <div />}
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Search posts..." className="w-full sm:w-64" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => copyText(formatClusterForCopy(clusterName, shown, items, hub), `Copied ${shown.length} brief${shown.length === 1 ? "" : "s"} - paste into any LLM to draft them.`)}
          >
            <Copy className="size-3.5" /> Copy details
          </Button>
          {canManage && <BulkPasteDetailsButton projectId={projectId} clusterId={clusterId} />}
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="mb-2.5">
          <BulkKindBar projectId={projectId} itemIds={selectedIds} onDone={() => setSelected(new Set())} />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="w-8 px-3 py-2.5"><Checkbox checked={allShownSelected} onCheckedChange={toggleAll} aria-label="Select all shown" /></th>
              <th className="px-3 py-2.5 font-semibold">Title</th>
              <th className="px-3 py-2.5 font-semibold">Type</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Funnel</th>
              <th className="px-3 py-2.5 font-semibold">Primary keyword</th>
              <th className="px-3 py-2.5 font-semibold text-right">Vol/mo</th>
              {canManage && <th className="px-3 py-2.5 font-semibold text-right">Assignee</th>}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={canManage ? 8 : 7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No posts match {q.trim() ? `"${q}"` : "that filter"}.
                </td>
              </tr>
            )}
            {shown.map((it) => (
              <tr
                key={it.id}
                onClick={() => setOpenItemId(it.id)}
                className={cn("cursor-pointer border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30", selected.has(it.id) && "bg-[#5B45E0]/5")}
              >
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggleOne(it.id)} aria-label={`Select ${it.title}`} />
                </td>
                <td className="max-w-[320px] px-3 py-2.5 font-medium text-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1 truncate" title={it.title}>{it.title}</div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); copyText(formatItemForCopy(it, items, hub), "Copied this brief - paste into any LLM to draft it."); }}
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="Copy this row's details"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2.5" title={it.contentType ?? undefined} onClick={(e) => e.stopPropagation()}>
                  <KindSelect projectId={projectId} itemId={it.id} kind={it.kind} />
                </td>
                <td className="px-3 py-2.5"><PublishStateBadge state={it.publishState} liveUrl={it.liveUrl} /></td>
                <td className="px-3 py-2.5">
                  {it.funnelStage ? (
                    <Badge variant="outline" className={cn("text-[10px]", FUNNEL_TONE[it.funnelStage.toLowerCase()] ?? "")}>
                      {it.funnelStage}
                    </Badge>
                  ) : "—"}
                </td>
                <td className="max-w-[200px] px-3 py-2.5 text-foreground"><div className="truncate" title={it.targetKeyword ?? undefined}>{it.targetKeyword ?? "—"}</div></td>
                <td className="px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums text-foreground">{it.volMo != null ? it.volMo.toLocaleString() : "—"}</td>
                {canManage && (
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <ClusterItemAssignee itemId={it.id} taskId={it.taskId} currentAssignee={it.assigneeId} members={members} />
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!openItem} onOpenChange={(v) => !v && setOpenItemId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:min-w-[50vw] sm:max-w-2xl lg:max-w-3xl">
          {openItem && (
            <>
              <SheetHeader>
                <SheetTitle>{openItem.title}</SheetTitle>
                <SheetDescription>
                  {[openItem.category, openItem.contentType].filter(Boolean).join(" · ") || "Planned post"}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="flex flex-wrap items-center gap-2">
                  {openItem.funnelStage && (
                    <Badge variant="outline" className={cn("text-[11px]", FUNNEL_TONE[openItem.funnelStage.toLowerCase()] ?? "")}>
                      {openItem.funnelStage}
                    </Badge>
                  )}
                  {openItem.taskStatus && (
                    <Badge className="bg-info-500/15 text-info-700 hover:bg-info-500/15">
                      In Sprint · {openItem.taskStatus}{openItem.assigneeName ? ` · ${openItem.assigneeName}` : ""}
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {canManage && <ClusterItemDetailsButton key={openItem.id} projectId={projectId} item={openItem} />}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => copyText(formatItemForCopy(openItem, items, hub), "Copied this brief - paste into any LLM to draft it.")}
                    >
                      <Copy className="size-3.5" /> Copy details
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <PublishStateBadge state={openItem.publishState} liveUrl={openItem.liveUrl} />
                  <div className="ml-auto">
                    <PublishControl itemId={openItem.id} state={openItem.publishState} liveUrl={openItem.liveUrl} publishedUrl={openItem.publishedUrl} compact />
                  </div>
                </div>

                <PageSpec title={openItem.title} slug={openItem.urlSlug} meta={openItem.metaDescription} siteDomain={siteDomain} />

                {(openItem.gscQueries.length > 0 || openItem.anchorPlan.toHub || openItem.anchorPlan.fromHub) && (
                  <DetailSection label="Search Console queries & anchors">
                    {openItem.gscQueries.length > 0 && (
                      <ul className="mb-2 space-y-1">
                        {openItem.gscQueries.map((q, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-1.5">
                            {(queryOptions(q).length ? queryOptions(q).map((o) => USE_OPTION_LABEL[o]) : [QUERY_USAGE_LABEL[q.usage]]).map((label) => (
                              <Badge key={label} variant="outline" className="text-[10px]">{label}</Badge>
                            ))}
                            <span>{q.query}</span>
                            {q.impressions > 0 && <span className="text-[11.5px] text-muted-foreground">{q.impressions.toLocaleString()} impr. · pos {q.position.toFixed(1)}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="space-y-0.5 text-[12.5px]">
                      {openItem.anchorPlan.toHub && <div><span className="text-muted-foreground">Links to hub with:</span> &ldquo;{openItem.anchorPlan.toHub.text}&rdquo; <span className="text-[11px] text-muted-foreground">({openItem.anchorPlan.toHub.type})</span></div>}
                      {openItem.anchorPlan.fromHub && <div><span className="text-muted-foreground">Hub links here with:</span> &ldquo;{openItem.anchorPlan.fromHub.text}&rdquo; <span className="text-[11px] text-muted-foreground">({openItem.anchorPlan.fromHub.type})</span></div>}
                      {!!openItem.anchorPlan.variants?.length && <div><span className="text-muted-foreground">Anchor variants:</span> {openItem.anchorPlan.variants.join(", ")}</div>}
                    </div>
                  </DetailSection>
                )}
                <ArtifactEditor itemId={openItem.id} artifactUrl={openItem.artifactUrl} driveUrl={openItem.artifactDriveUrl} />
                <ToolEditor projectId={projectId} itemId={openItem.id} tools={openItem.tools} />

                <DetailSection label="Primary keyword">
                  {openItem.targetKeyword ?? "—"} {openItem.volMo != null && <span className="text-muted-foreground">({openItem.volMo.toLocaleString()}/mo)</span>}
                </DetailSection>

                {openItem.supportingKeywords.length > 0 && (
                  <DetailSection label="Supporting keywords">
                    <div className="flex flex-wrap gap-1.5">
                      {openItem.supportingKeywords.map((k, i) => (
                        <Badge key={i} variant="outline" className="text-[11px]">
                          {k.keyword}{k.volume != null && <span className="ml-1 text-muted-foreground">{k.volume.toLocaleString()}</span>}
                        </Badge>
                      ))}
                    </div>
                  </DetailSection>
                )}

                {openItem.serpVerdict && <DetailSection label="SERP verdict">{openItem.serpVerdict}</DetailSection>}

                {openItem.outline.length > 0 && (
                  <DetailSection label="H2 candidates">
                    <ul className="list-disc space-y-1 pl-4">{openItem.outline.map((h, i) => <li key={i}>{h}</li>)}</ul>
                  </DetailSection>
                )}

                {openItem.faqCandidates.length > 0 && (
                  <DetailSection label="FAQ candidates">
                    <ul className="list-disc space-y-1 pl-4">{openItem.faqCandidates.map((q, i) => <li key={i}>{q}</li>)}</ul>
                  </DetailSection>
                )}

                {(openItem.interlinksTo.length > 0 || openItem.interlinksFrom.length > 0) && (
                  <DetailSection label="Interlinking plan">
                    {openItem.interlinksTo.length > 0 && (
                      <div className="mb-2">
                        <div className="mb-1 text-[11px] font-semibold text-muted-foreground">Links to ({openItem.interlinksTo.length})</div>
                        <ul className="space-y-1">{openItem.interlinksTo.map((l, i) => <li key={i} className="truncate text-[12.5px]">{l}</li>)}</ul>
                      </div>
                    )}
                    {openItem.interlinksFrom.length > 0 && (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold text-muted-foreground">Linked from ({openItem.interlinksFrom.length})</div>
                        <ul className="space-y-1">{openItem.interlinksFrom.map((l, i) => <li key={i} className="truncate text-[12.5px]">{l}</li>)}</ul>
                      </div>
                    )}
                  </DetailSection>
                )}

                {openItem.primaryCta && <DetailSection label="Primary CTA">{openItem.primaryCta}</DetailSection>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[13px] leading-relaxed text-foreground">{children}</div>
    </div>
  );
}
