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

import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ClusterItemAssignee } from "@/components/sections/blog-clusters/cluster-item-assignee";
import type { BlogClusterItemRow } from "@/lib/data/blog-clusters";
import type { Member } from "@/components/sections/assignee-picker";

const FUNNEL_TONE: Record<string, string> = {
  tofu: "border-info-300 text-info-700",
  mofu: "border-warning-300 text-warning-700",
  bofu: "border-success-300 text-success-700",
};

function formatItemForCopy(it: BlogClusterItemRow): string {
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
  if (it.interlinksTo.length) lines.push(`Interlinks to: ${it.interlinksTo.join(", ")}`);
  if (it.interlinksFrom.length) lines.push(`Interlinks from: ${it.interlinksFrom.join(", ")}`);
  if (it.metaDescription) lines.push(`Meta description: ${it.metaDescription}`);
  if (it.urlSlug) lines.push(`URL slug: ${it.urlSlug}`);
  if (it.primaryCta) lines.push(`Primary CTA: ${it.primaryCta}`);

  return lines.join("\n").trim();
}

function formatClusterForCopy(clusterName: string, items: BlogClusterItemRow[]): string {
  return [`# ${clusterName} — ${items.length} planned post${items.length === 1 ? "" : "s"}`, "", ...items.map(formatItemForCopy)].join("\n\n---\n\n");
}

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("Couldn't copy - select the text and copy manually.");
  }
}

export function BlogClusterTable({ clusterName, items, members, canManage }: {
  clusterName: string;
  items: BlogClusterItemRow[];
  members: Member[];
  canManage: boolean;
}) {
  const [openItem, setOpenItem] = useState<BlogClusterItemRow | null>(null);

  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No rows in this cluster yet.</p>;
  }

  return (
    <>
      <div className="mb-2.5 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => copyText(formatClusterForCopy(clusterName, items), `Copied all ${items.length} briefs - paste into any LLM to draft them.`)}
        >
          <Copy className="size-3.5" /> Copy all details
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 font-semibold">Title</th>
              <th className="px-3 py-2.5 font-semibold">Category</th>
              <th className="px-3 py-2.5 font-semibold">Funnel</th>
              <th className="px-3 py-2.5 font-semibold">Content type</th>
              <th className="px-3 py-2.5 font-semibold">Primary keyword</th>
              <th className="px-3 py-2.5 font-semibold text-right">Vol/mo</th>
              {canManage && <th className="px-3 py-2.5 font-semibold text-right">Assignee</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.id}
                onClick={() => setOpenItem(it)}
                className="cursor-pointer border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30"
              >
                <td className="max-w-[320px] px-3 py-2.5 font-medium text-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1 truncate" title={it.title}>{it.title}</div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); copyText(formatItemForCopy(it), "Copied this brief - paste into any LLM to draft it."); }}
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="Copy this row's details"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </td>
                <td className="max-w-[140px] px-3 py-2.5 text-muted-foreground">
                  <div className="truncate" title={it.category ?? undefined}>{it.category ?? "—"}</div>
                </td>
                <td className="px-3 py-2.5">
                  {it.funnelStage ? (
                    <Badge variant="outline" className={cn("text-[10px]", FUNNEL_TONE[it.funnelStage.toLowerCase()] ?? "")}>
                      {it.funnelStage}
                    </Badge>
                  ) : "—"}
                </td>
                <td className="max-w-[180px] px-3 py-2.5 text-muted-foreground"><div className="truncate" title={it.contentType ?? undefined}>{it.contentType ?? "—"}</div></td>
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

      <Sheet open={!!openItem} onOpenChange={(v) => !v && setOpenItem(null)}>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto gap-1.5"
                    onClick={() => copyText(formatItemForCopy(openItem), "Copied this brief - paste into any LLM to draft it.")}
                  >
                    <Copy className="size-3.5" /> Copy details
                  </Button>
                </div>

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

                {openItem.metaDescription && <DetailSection label="Meta description">{openItem.metaDescription}</DetailSection>}
                {openItem.urlSlug && (
                  <DetailSection label="URL slug">
                    <span className="inline-flex items-center gap-1.5">
                      {openItem.urlSlug}
                      <a href={openItem.urlSlug.startsWith("http") ? openItem.urlSlug : `https://${openItem.urlSlug}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="size-3" />
                      </a>
                    </span>
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

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[13px] leading-relaxed text-foreground">{children}</div>
    </div>
  );
}
