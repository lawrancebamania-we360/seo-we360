"use client";

// "Where AI pulls its answers from": every site AI has cited, with its total
// citation count. Click a site to expand it in place into each distinct link it
// was cited for, each with its own count. Built from the SAME rows as the table
// (groupCitationsBySite), so a site's total is always the sum of its link counts
// and all site totals add up to the table's row count.

import { useState } from "react";
import { ArrowUpRight, ChevronDown, Quote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SiteGroup } from "@/lib/ai-citation/citation-aggregate";

const SITES_SHOWN = 15;
const LINKS_SHOWN = 10;

function linkPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./i, "")}${u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

export function CitationSitesGraph({ groups }: { groups: SiteGroup[] }) {
  const [openSites, setOpenSites] = useState<Set<string>>(new Set());
  const [moreLinks, setMoreLinks] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const flip = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  };

  const max = groups[0]?.total || 1;
  const total = groups.reduce((n, g) => n + g.total, 0);
  const shown = showAll ? groups : groups.slice(0, SITES_SHOWN);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-2">
        <span className="mt-0.5 flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
          <Quote className="size-3.5" />
        </span>
        <div>
          <h3 className="font-heading text-[15px] font-bold text-foreground">Where AI pulls its answers from</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {total.toLocaleString()} citation{total === 1 ? "" : "s"} across {groups.length.toLocaleString()} site{groups.length === 1 ? "" : "s"}, from every check so far. Click a site to see each link it was cited for.
          </p>
        </div>
      </div>

      <div className="space-y-0.5">
        {shown.map((g) => {
          const isOpen = openSites.has(g.site);
          const linksOpen = moreLinks.has(g.site);
          const links = linksOpen ? g.links : g.links.slice(0, LINKS_SHOWN);
          return (
            <div key={g.site}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenSites((s) => flip(s, g.site))}
                className={cn(
                  "-mx-2 flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50",
                  g.isProject && "bg-warning-500/[0.07] hover:bg-warning-500/[0.12]",
                )}
              >
                <span className={cn(
                  "flex size-[26px] flex-none items-center justify-center rounded-lg text-[11px] font-bold",
                  g.isProject ? "bg-warning-500/15 text-warning-strong" : "bg-muted text-muted-foreground",
                )}>{g.site.charAt(0).toUpperCase()}</span>
                <span className={cn("min-w-[100px] flex-1 truncate text-sm", g.isProject ? "font-semibold text-warning-strong" : "text-foreground")}>
                  {g.site}{g.isProject && " (you)"}
                  <span className="ml-2 text-[11.5px] font-normal text-muted-foreground">{g.links.length} link{g.links.length === 1 ? "" : "s"}</span>
                </span>
                <div className="hidden h-[9px] w-[200px] max-w-[34vw] flex-none overflow-hidden rounded-full bg-muted sm:block">
                  <div className={cn("h-full rounded-full", g.isProject ? "bg-warning-500" : "bg-ember-500")} style={{ width: `${Math.max(3, Math.round((g.total / max) * 100))}%` }} />
                </div>
                <span className="w-9 text-right font-mono text-[13.5px] font-medium tabular-nums text-foreground">{g.total}</span>
                <ChevronDown className={cn("size-4 flex-none text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="mb-1 ml-[38px] border-l border-border pl-3">
                  {links.map((l) => (
                    <div key={l.linkKey} className="flex items-center gap-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-foreground" title={l.label}>{l.label}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground" title={l.url}>{linkPath(l.url)}</div>
                      </div>
                      <span className="w-9 flex-none text-right font-mono text-[13px] tabular-nums text-foreground">{l.count}</span>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${l.label}`}
                        title={l.url}
                        className="inline-flex size-7 flex-none items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ArrowUpRight className="size-3.5" />
                      </a>
                    </div>
                  ))}
                  {g.links.length > LINKS_SHOWN && (
                    <button
                      type="button"
                      onClick={() => setMoreLinks((s) => flip(s, g.site))}
                      className="py-1.5 text-[12.5px] font-medium text-primary hover:underline"
                    >
                      {linksOpen ? "Show fewer links" : `Show ${g.links.length - LINKS_SHOWN} more links`}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {groups.length > SITES_SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-[13px] font-medium text-primary hover:underline"
        >
          {showAll ? `Show top ${SITES_SHOWN} sites` : `Show all ${groups.length.toLocaleString()} sites`}
        </button>
      )}
    </Card>
  );
}
