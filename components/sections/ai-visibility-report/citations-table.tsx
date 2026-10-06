"use client";

// Citation sources table: one row per link cited in one answer, across every
// check for the category. Sorting, search, model filter and pagination all run
// on the client over the slim rows the server sent (no answer text in the list;
// "Full answer" opens the existing transcript drawer for that one answer).

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, ChevronLeft, ChevronRight, MessageSquareText, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ENGINE_LABEL, type AiEngine } from "@/lib/ai-citation/types";
import type { CitationRow } from "@/lib/ai-citation/citation-aggregate";
import { countryName } from "@/lib/geo/countries";
import { EngineLogo } from "@/components/icons/engines/engine-logo";
import { useEvidence } from "./evidence-context";

type SortKey = "site" | "promptText" | "engine" | "createdAt";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

const COLUMNS: { key: SortKey; label: string; defaultDir: SortDir }[] = [
  { key: "site", label: "Cited source", defaultDir: "asc" },
  { key: "promptText", label: "Prompt", defaultDir: "asc" },
  { key: "engine", label: "LLM model", defaultDir: "asc" },
  { key: "createdAt", label: "Date", defaultDir: "desc" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

/** The line under the site name: the page title when stored, else the readable path. */
function secondaryText(r: CitationRow): string {
  if (r.title) return r.title;
  try {
    const u = new URL(r.url);
    const path = `${u.pathname.replace(/\/+$/, "")}${u.search}`;
    return path || "Home page";
  } catch {
    return r.url;
  }
}

function compare(a: CitationRow, b: CitationRow, key: SortKey): number {
  switch (key) {
    case "site": return a.site.localeCompare(b.site);
    case "promptText": return a.promptText.localeCompare(b.promptText);
    case "engine": return ENGINE_LABEL[a.engine].localeCompare(ENGINE_LABEL[b.engine]);
    default: return a.createdAt.localeCompare(b.createdAt);
  }
}

export function CitationsTable({ rows, skipped, truncated }: { rows: CitationRow[]; skipped: number; truncated: boolean }) {
  const { openTranscript } = useEvidence();
  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState<AiEngine | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const engineCounts = useMemo(() => {
    const m = new Map<AiEngine, number>();
    for (const r of rows) m.set(r.engine, (m.get(r.engine) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (engine && r.engine !== engine) return false;
      if (!q) return true;
      return r.site.includes(q) || r.url.toLowerCase().includes(q) || r.promptText.toLowerCase().includes(q) || (r.title ?? "").toLowerCase().includes(q)
        // Geography: matches the country name ("india") and its ISO code ("in").
        || (!!r.country && (countryName(r.country).toLowerCase().includes(q) || r.country.toLowerCase().includes(q)));
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const primary = compare(a, b, sortKey) * dir;
      if (primary !== 0) return primary;
      // Answers from one check share a timestamp, so the tiebreak decides the order.
      return b.createdAt.localeCompare(a.createdAt) || a.site.localeCompare(b.site) || a.url.localeCompare(b.url);
    });
  }, [rows, query, engine, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (col: (typeof COLUMNS)[number]) => {
    if (sortKey === col.key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col.key); setSortDir(col.defaultDir); }
    setPage(0);
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="space-y-3 border-b border-border p-4 sm:p-5">
        <div>
          <h3 className="font-heading text-[15px] font-bold text-foreground">Every citation</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Each row is one link an AI answer cited, from every check so far. The same link cited in a different answer is its own row.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              placeholder="Search site, link, prompt or country"
              className="h-8 pl-8 text-[13px]"
              aria-label="Search citations"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setEngine(null); setPage(0); }}
              className={cn("rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors", engine === null ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted")}
            >
              All models <span className="font-mono font-normal opacity-70">{rows.length}</span>
            </button>
            {engineCounts.map(([e, n]) => (
              <button
                key={e}
                type="button"
                onClick={() => { setEngine(engine === e ? null : e); setPage(0); }}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors", engine === e ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted")}
              >
                <EngineLogo engine={e} size={13} /> {ENGINE_LABEL[e]} <span className="font-mono font-normal opacity-70">{n}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-2.5 font-semibold">
                  <button type="button" onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {col.label}
                    {sortKey === col.key
                      ? (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)
                      : <ArrowUpDown className="size-3 opacity-40" />}
                  </button>
                </th>
              ))}
              <th className="px-4 py-2.5 text-center font-semibold">Link</th>
              <th className="px-4 py-2.5 text-right font-semibold">Full answer</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-muted-foreground">No citations match that search.</td>
              </tr>
            ) : pageRows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                <td className="max-w-[300px] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={cn(
                      "flex size-[26px] flex-none items-center justify-center rounded-lg text-[11px] font-bold",
                      r.isProject ? "bg-warning-500/15 text-warning-strong" : "bg-muted text-muted-foreground",
                    )}>{r.site.charAt(0).toUpperCase()}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("truncate text-sm font-medium", r.isProject ? "text-warning-strong" : "text-foreground")}>{r.site}</span>
                        {r.isProject && <span className="shrink-0 text-xs font-semibold text-warning-strong">(you)</span>}
                        {!r.isProject && r.competitorName && (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground" title={r.competitorName}>Competitor</span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground" title={secondaryText(r)}>{secondaryText(r)}</div>
                    </div>
                  </div>
                </td>
                <td className="max-w-[340px] px-4 py-3 text-[13px] text-foreground/90">
                  <div className="line-clamp-2" title={r.promptText}>{r.promptText}</div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground/90">
                      <EngineLogo engine={r.engine} size={15} /> {ENGINE_LABEL[r.engine]}
                    </span>
                    {r.country && (
                      // Name + ISO code, no flag emoji (Windows Chrome does not render them).
                      // Indented to line up under the engine name, past the 15px logo + gap.
                      <span className="inline-flex items-center gap-1.5 pl-[21px] text-[11.5px] text-muted-foreground" title={`Asked as if searching from ${countryName(r.country)}`}>
                        {countryName(r.country)}
                        <span className="rounded border border-border bg-muted px-1 py-px font-mono text-[10px] font-semibold uppercase leading-none text-muted-foreground">{r.country}</span>
                      </span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-[13px] text-muted-foreground">{formatDate(r.createdAt)}</td>
                <td className="px-4 py-3 text-center">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${r.site}`}
                    title={r.url}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowUpRight className="size-4" />
                  </a>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => openTranscript(r.runId)}>
                    <MessageSquareText className="size-3.5" /> View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-[12.5px] text-muted-foreground sm:px-5">
        <span>
          {visible.length === 0 ? "0 citations" : `Showing ${safePage * PAGE_SIZE + 1} to ${Math.min(visible.length, (safePage + 1) * PAGE_SIZE)} of ${visible.length} citations`}
        </span>
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-1 font-mono tabular-nums">{safePage + 1} / {pageCount}</span>
          <Button type="button" size="sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {(skipped > 0 || truncated) && (
        <div className="space-y-0.5 border-t border-border bg-muted/30 px-4 py-2 text-[12px] text-muted-foreground sm:px-5">
          {skipped > 0 && (
            <div>{skipped} citation{skipped === 1 ? "" : "s"} had no usable link (for example a Google AI Overview redirect), so {skipped === 1 ? "it isn't" : "they aren't"} listed.</div>
          )}
          {truncated && <div>This is a very large history, so only the newest {rows.length.toLocaleString()} citations are shown.</div>}
        </div>
      )}
    </Card>
  );
}
