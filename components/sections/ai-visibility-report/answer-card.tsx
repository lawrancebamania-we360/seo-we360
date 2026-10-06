"use client";

// One answer on the Sample answers tab (history view): the question as it was
// asked, the engine and geography, the mention / citation / tone badges, a short
// snippet, and the links the answer cited. Clicking the card opens the full
// transcript in the evidence drawer; the link icons open the real page in a new
// tab and must NOT also open the transcript.

import { useState } from "react";
import { ArrowUpRight, ChevronRight, Quote, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ENGINE_LABEL, type AiEngine } from "@/lib/ai-citation/types";
import { countryName } from "@/lib/geo/countries";
import type { HistoryAnswer } from "@/lib/ai-citation/answer-history";
import type { AnswerLink } from "@/lib/ai-citation/answer-links";
import { useEvidence } from "./evidence-context";
import { SentimentChip } from "./sentiment-chip";

/** Links shown before "+N more". */
const LINKS_SHOWN = 5;

const engineLabel = (e: string) => ENGINE_LABEL[e as AiEngine] ?? e;

export function AnswerCard({ answer: a, canManage, onGetCited }: {
  answer: HistoryAnswer;
  canManage: boolean;
  /** Open the "Get cited" flow for this answer's question. */
  onGetCited: (question: string) => void;
}) {
  const { openTranscript, classifying } = useEvidence();
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => openTranscript(a.runId)}
      onKeyDown={(e) => {
        // Only the card itself opens the transcript: Enter on an inner link or button keeps its own job.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTranscript(a.runId); }
      }}
      className="cursor-pointer space-y-2 p-4 transition-colors hover:border-primary/50 hover:bg-muted/20"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{engineLabel(a.engine)}</Badge>
        {a.country && <GeoBadge code={a.country} />}
        {a.mentioned
          ? <Badge className="bg-success-500/15 text-success-700 hover:bg-success-500/15">Mentioned{a.position ? ` #${a.position}` : ""}</Badge>
          : <Badge variant="outline" className="text-muted-foreground">Not mentioned</Badge>}
        {a.cited && <Badge className="bg-info-500/15 text-info-700 hover:bg-info-500/15">Cited</Badge>}
        <SentimentChip sentiment={a.sentiment} mentioned={a.mentioned} classifying={classifying} />
      </div>

      <p className="text-base font-bold text-foreground">{a.promptText}</p>

      {a.snippet && (
        <p className="flex gap-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
          <Quote className="mt-0.5 size-4 shrink-0 text-slate-300" /><span className="line-clamp-3">{a.snippet}</span>
        </p>
      )}

      <CitedLinks links={a.links} />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* Only offer "Get cited" when we are ABSENT from the answer. If AI already
            named us (mentioned or cited), there is nothing to fix here. */}
        {!a.mentioned && !a.cited && canManage && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onGetCited(a.promptText); }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-success-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-success-700"
          >
            <Sparkles className="size-3" /> Get cited
          </button>
        )}
        <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-primary">
          Read the full answer <ChevronRight className="size-3" />
        </span>
      </div>
    </Card>
  );
}

/** Country name plus its ISO-2 code in a mono badge (code only when the name is unknown). */
function GeoBadge({ code }: { code: string }) {
  const name = countryName(code);
  return (
    <span
      title={`Answer requested for ${name}`}
      className="inline-flex h-5 items-center gap-1 rounded-4xl border border-border px-2 text-xs font-medium text-foreground"
    >
      {name !== code && <span>{name}</span>}
      <span className="rounded bg-muted px-1 font-mono text-[10.5px] font-semibold text-muted-foreground">{code}</span>
    </span>
  );
}

/** Label without the host when it is just "host/path" (the site is already shown next to it). */
function shortLabel(l: AnswerLink): string {
  if (l.label.toLowerCase().startsWith(l.site)) {
    const rest = l.label.slice(l.site.length);
    if (rest === "") return "Home page";
    if (rest.startsWith("/")) return rest;
  }
  return l.label;
}

function CitedLinks({ links }: { links: AnswerLink[] }) {
  const [all, setAll] = useState(false);
  if (!links.length) {
    return <p className="pt-0.5 text-xs text-muted-foreground/80">No links cited in this answer.</p>;
  }
  const shown = all ? links : links.slice(0, LINKS_SHOWN);
  const hidden = links.length - shown.length;
  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Cited links <span className="font-mono font-normal tabular-nums">{links.length}</span>
      </p>
      <ul className="space-y-1">
        {shown.map((l) => (
          <li key={l.url} className="flex min-w-0 items-center gap-2 text-[12.5px]">
            <span
              className={cn(
                "flex size-5 flex-none items-center justify-center rounded-md text-[10px] font-bold",
                l.isProject ? "bg-warning-500/15 text-warning-strong" : "bg-muted text-muted-foreground",
              )}
            >
              {l.site.charAt(0).toUpperCase()}
            </span>
            <span className={cn("max-w-[40%] shrink-0 truncate font-medium", l.isProject ? "text-warning-strong" : "text-foreground")} title={l.site}>
              {l.site}
            </span>
            {l.isProject && <span className="shrink-0 text-[11px] font-semibold text-warning-strong">(you)</span>}
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={l.label}>{shortLabel(l)}</span>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${l.site}: ${l.label}`}
              title={l.url}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex size-6 flex-none items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowUpRight className="size-3.5" />
            </a>
          </li>
        ))}
      </ul>
      {links.length > LINKS_SHOWN && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAll((v) => !v); }}
          className="cursor-pointer text-xs font-medium text-primary hover:underline"
        >
          {all ? "Show fewer" : `+${hidden} more`}
        </button>
      )}
    </div>
  );
}
