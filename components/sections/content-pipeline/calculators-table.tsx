"use client";

// Calculators combined view (the "Calculators" filter on the To Publish page).
// Every tool in the project's library, who made it, and which guides/blogs use
// it. Read-only here - tools are authored from each post's drawer in Blog
// Clusters. Rows expand to the full spec + the list of posts using the tool.

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Calculator, ChevronDown, ChevronRight, Download, ExternalLink, FileArchive } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchBox, matchesQuery } from "@/components/ui/search-box";
import { toExternalUrl } from "@/lib/url";
import { signBundleUrl } from "@/lib/actions/content-tools";
import type { ToolOverviewRow } from "@/lib/data/blog-clusters";

async function downloadBundle(path: string) {
  const url = await signBundleUrl(path);
  if (!url) { toast.error("Couldn't get the download link."); return; }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function CalculatorsTable({ tools }: { tools: ToolOverviewRow[] }) {
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const toggle = (id: string) => setOpenRows((p) => ({ ...p, [id]: !p[id] }));
  const usedCount = useMemo(() => tools.filter((t) => t.usedOn.length > 0).length, [tools]);
  const shown = tools.filter((t) => matchesQuery(q, t.name, t.output, t.inputs, t.formula, t.createdByName, t.usedOn.map((u) => u.title).join(" ")));

  if (!tools.length) {
    return (
      <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
        No calculators yet. They&apos;re created from a guide or blog&apos;s drawer in Blog Clusters — open a post and add one under &quot;Calculator / Tool&quot;.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12.5px] text-muted-foreground">{tools.length} calculator{tools.length === 1 ? "" : "s"} · {usedCount} attached to a post</div>
        <SearchBox value={q} onChange={setQ} placeholder="Search calculators..." className="w-full sm:w-64" />
      </div>
      {shown.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">No calculators match &ldquo;{q}&rdquo;.</Card>
      ) : (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 font-semibold">Calculator</th>
              <th className="px-3 py-2.5 font-semibold">Output</th>
              <th className="px-3 py-2.5 font-semibold">Bundle</th>
              <th className="px-3 py-2.5 font-semibold">Used on</th>
              <th className="px-3 py-2.5 font-semibold">Made by</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const open = !!openRows[t.id];
              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-border/60 align-top transition-colors hover:bg-muted/20">
                    <td className="max-w-[300px] px-3 py-2.5">
                      <div className="flex items-start gap-1.5">
                        <button type="button" onClick={() => toggle(t.id)} aria-expanded={open} title={open ? "Hide details" : "Show details"}
                          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        </button>
                        <button type="button" onClick={() => toggle(t.id)} className="flex min-w-0 items-center gap-1.5 text-left">
                          <Calculator className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium text-foreground hover:underline">{t.name}</span>
                        </button>
                      </div>
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5 text-[12.5px] text-muted-foreground"><div className="truncate" title={t.output ?? undefined}>{t.output || "—"}</div></td>
                    <td className="px-3 py-2.5">
                      {t.bundlePath ? (
                        <button type="button" onClick={() => downloadBundle(t.bundlePath!)} className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground hover:underline">
                          <FileArchive className="size-3.5 text-muted-foreground" /> <span className="max-w-[140px] truncate">{t.bundleName ?? "bundle"}</span> <Download className="size-3 text-muted-foreground" />
                        </button>
                      ) : toExternalUrl(t.embedUrl) ? (
                        <a href={toExternalUrl(t.embedUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground hover:underline"><ExternalLink className="size-3.5 text-muted-foreground" /> External</a>
                      ) : <span className="text-[12.5px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
                      {t.usedOn.length === 0 ? <span className="text-muted-foreground/70">Not attached</span> : `${t.usedOn.length} post${t.usedOn.length === 1 ? "" : "s"}`}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-muted-foreground">{t.createdByName ?? "—"}</td>
                  </tr>
                  {open && (
                    <tr className="border-b border-border/60">
                      <td colSpan={5} className="px-3 pb-3.5 pt-0">
                        <div className="ml-6 space-y-2.5 rounded-lg border border-border bg-muted/30 p-3.5">
                          <Detail label="Content">{t.content || <Dash />}</Detail>
                          <Detail label="Inputs">{t.inputs || <Dash />}</Detail>
                          <Detail label="Output">{t.output || <Dash />}</Detail>
                          <Detail label="Formula">{t.formula || <Dash />}</Detail>
                          <Detail label="Used on">
                            {t.usedOn.length === 0 ? <Dash text="Not attached to any post yet." /> : (
                              <ul className="space-y-1">
                                {t.usedOn.map((u) => (
                                  <li key={u.itemId} className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px] capitalize">{u.kind}</Badge>
                                    <Link href={`/dashboard/blog-clusters/${u.clusterId}`} className="truncate text-foreground hover:underline" title={u.title}>{u.title}</Link>
                                    {u.liveUrl && <a href={u.liveUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground"><ExternalLink className="size-3" /></a>}
                                    <span className="shrink-0 text-[11px] text-muted-foreground">· {u.clusterName}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </Detail>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function Dash({ text }: { text?: string }) {
  return <span className="text-muted-foreground">{text ?? "—"}</span>;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 text-[13px] sm:gap-3">
      <div className="pt-px text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="min-w-0 whitespace-pre-wrap break-words text-foreground">{children}</div>
    </div>
  );
}
