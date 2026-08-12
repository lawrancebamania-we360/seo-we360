"use client";

// The evidence drawer (feature 1): every number in the AI-Visibility report
// clicks through to here. Two views in one right-side sheet:
//   list       - the filtered, paginated answers behind the clicked metric
//   transcript - ONE answer's full stored AI response (ai_citation_runs.
//                answer_text), with the brand + competitor mentions highlighted,
//                plus the prompt asked, engine, timestamp and cited sources.
// Read-only by design; data loads lazily via the evidence server actions.

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, ExternalLink, Loader2, Quote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ENGINE_LABEL, type AiEngine } from "@/lib/ai-citation/types";
import { EngineLogo } from "@/components/icons/engines/engine-logo";
import type { AnswerTranscript, EvidenceItem } from "@/lib/ai-citation/evidence";
import type { EvidenceFilter } from "@/lib/ai-citation/trust";
import { segmentMentions } from "@/lib/ai-citation/highlight";
import { fetchAiVisibilityEvidence, fetchAiVisibilityTranscript } from "@/lib/actions/ai-visibility-evidence";
import { SentimentChip } from "./sentiment-chip";

export type DrawerRequest =
  | { kind: "list"; filter: EvidenceFilter; title: string; subtitle?: string }
  | { kind: "transcript"; runId: string }
  | null;

const engineLabel = (e: string) => ENGINE_LABEL[e as AiEngine] ?? e;
const fmtWhen = (iso: string) => {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
};

export function EvidenceDrawer({ projectId, request, onClose }: {
  projectId: string;
  request: DrawerRequest;
  onClose: () => void;
}) {
  const [view, setView] = useState<"list" | "transcript">("list");
  const [fromList, setFromList] = useState(false);
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [transcript, setTranscript] = useState<AnswerTranscript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();

  const loadPage = useCallback((filter: EvidenceFilter, page: number, append: boolean) => {
    start(async () => {
      const r = await fetchAiVisibilityEvidence({ project_id: projectId, filter, page });
      if (!r.ok || !r.page) { setError(r.error ?? "Could not load the answers."); return; }
      setTotal(r.page.total);
      setItems((prev) => (append ? [...prev, ...r.page!.items] : r.page!.items));
    });
  }, [projectId]);

  const loadTranscript = useCallback((runId: string) => {
    setTranscript(null);
    start(async () => {
      const r = await fetchAiVisibilityTranscript({ project_id: projectId, run_id: runId });
      if (!r.ok || !r.transcript) { setError(r.error ?? "Could not load the transcript."); return; }
      setTranscript(r.transcript);
    });
  }, [projectId]);

  // A new open request re-initializes the drawer to its starting view — an
  // intentional reset in response to an external trigger (the `request` prop the
  // context sets when a metric is clicked). react-hooks/set-state-in-effect is
  // the Next-16 baseline drift the eslint pass downgrades to a warning;
  // suppressed locally rather than contorting the async-loading flow into a
  // key-remount that would still re-fetch on mount.
  useEffect(() => {
    if (!request) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    if (request.kind === "list") {
      setView("list"); setFromList(false); setItems([]); setTotal(0); setTranscript(null);
      loadPage(request.filter, 0, false);
    } else {
      setView("transcript"); setFromList(false); setItems([]); setTranscript(null);
      loadTranscript(request.runId);
    }
  }, [request, loadPage, loadTranscript]);

  const openItem = (runId: string) => {
    setView("transcript");
    setFromList(true);
    setError(null);
    loadTranscript(runId);
  };
  const backToList = () => { setView("list"); setTranscript(null); setError(null); };

  const listMeta = request?.kind === "list" ? request : null;
  const showList = view === "list" && listMeta;

  return (
    <Sheet open={!!request} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl lg:max-w-5xl xl:max-w-[1400px]">
        <SheetHeader>
          <SheetTitle>{showList ? listMeta.title : "AI answer transcript"}</SheetTitle>
          <SheetDescription>
            {showList
              ? (listMeta.subtitle ?? "Every number in this report traces back to a real AI answer. Click one to read the full transcript.")
              : "The exact answer the AI engine gave, with your brand and competitors highlighted."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-6">
          {error && <p className="rounded-lg border border-error-300/60 bg-error-50 dark:bg-error-950/30 px-3 py-2 text-xs text-error-700 dark:text-error-400">{error}</p>}

          {showList ? (
            <ListView items={items} total={total} loading={loading}
              onOpen={openItem}
              onLoadMore={() => loadPage(listMeta.filter, Math.floor(items.length / 20), true)}
            />
          ) : (
            <TranscriptView transcript={transcript} loading={loading} fromList={fromList} onBack={backToList} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ListView({ items, total, loading, onOpen, onLoadMore }: {
  items: EvidenceItem[]; total: number; loading: boolean;
  onOpen: (runId: string) => void; onLoadMore: () => void;
}) {
  if (loading && !items.length) {
    return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading answers...</p>;
  }
  if (!items.length) {
    return <p className="py-6 text-sm text-muted-foreground">No answers match this slice in the latest run.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{total} answer{total === 1 ? "" : "s"} in the latest run match this. Newest first, mentions on top.</p>
      {items.map((a) => (
        <button key={a.runId} type="button" onClick={() => onOpen(a.runId)}
          className="w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/30 cursor-pointer space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="secondary" className="gap-1 pl-1"><EngineLogo engine={a.engine} size={12} />{engineLabel(a.engine)}</Badge>
            {a.persona !== "Other" && <Badge variant="outline">{a.persona}</Badge>}
            {a.mentioned
              ? <Badge className="bg-success-500/15 text-success-700 hover:bg-success-500/15">Mentioned{a.position ? ` #${a.position}` : ""}</Badge>
              : <Badge variant="outline" className="text-muted-foreground">Not mentioned</Badge>}
            {a.cited && <Badge className="bg-info-500/15 text-info-700 hover:bg-info-500/15">Cited</Badge>}
            <SentimentChip sentiment={a.sentiment} mentioned={a.mentioned} />
            <span className="ml-auto text-xs text-muted-foreground">{fmtWhen(a.createdAt)}</span>
          </div>
          <p className="text-sm font-medium">{a.promptText}</p>
          {a.snippet && <p className="line-clamp-2 text-xs text-muted-foreground">{a.snippet}</p>}
          <p className="text-xs font-medium text-primary">Read the full answer</p>
        </button>
      ))}
      {items.length < total && (
        <Button variant="outline" size="sm" className="w-full" disabled={loading} onClick={onLoadMore}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : null} Show more ({items.length} of {total})
        </Button>
      )}
    </div>
  );
}

function TranscriptView({ transcript, loading, fromList, onBack }: {
  transcript: AnswerTranscript | null; loading: boolean; fromList: boolean; onBack: () => void;
}) {
  if (loading || !transcript) {
    return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading transcript...</p>;
  }
  const t = transcript;
  return (
    <div className="space-y-4">
      {fromList && (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer">
          <ArrowLeft className="size-3.5" /> Back to the list
        </button>
      )}

      {/* What was asked */}
      <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">The question we asked</div>
        <p className="text-sm font-medium">{t.promptText || "(prompt no longer available)"}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="secondary" className="gap-1 pl-1"><EngineLogo engine={t.engine} size={12} />{engineLabel(t.engine)}</Badge>
          {t.persona && <Badge variant="outline">{t.persona}</Badge>}
          {t.topic && <Badge variant="outline">{t.topic}</Badge>}
          <span className="text-xs text-muted-foreground">asked {fmtWhen(t.createdAt)}</span>
        </div>
      </div>

      {/* Outcome badges */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {t.mentioned
          ? <Badge className="bg-success-500/15 text-success-700 hover:bg-success-500/15">You were mentioned{t.position ? ` (rank #${t.position})` : ""}</Badge>
          : <Badge variant="outline" className="text-muted-foreground">You were not mentioned</Badge>}
        {t.cited
          ? <Badge className="bg-info-500/15 text-info-700 hover:bg-info-500/15">Your site was cited</Badge>
          : <Badge variant="outline" className="text-muted-foreground">Your site was not cited</Badge>}
        <SentimentChip sentiment={t.sentiment} mentioned={t.mentioned} />
      </div>

      {/* The full answer, highlighted */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <Quote className="size-3" /> The full answer
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-warning-400/80" /> you</span>
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-info-400/70" /> competitors</span>
          </div>
        </div>
        {t.error ? (
          <p className="text-xs text-error-600 dark:text-error-400">This call failed on the engine side, so there is no answer to show. Error: {t.error.slice(0, 200)}</p>
        ) : t.answerText ? (
          <HighlightedAnswer text={t.answerText} brandNames={t.brandNames} competitorNames={t.competitorNames} />
        ) : (
          <p className="text-xs text-muted-foreground">The engine returned an empty answer for this call.</p>
        )}
      </div>

      {/* Cited sources */}
      {t.sources.length > 0 && (
        <div className="rounded-lg border p-3 space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Sources this answer cited</div>
          {t.sources.map((s, i) => {
            const href = s.url || (s.domain ? `https://${s.domain}` : null);
            const label = s.domain || s.url || "unknown source";
            return (
              <div key={`${label}-${i}`} className="flex items-center gap-2 text-xs">
                <span className={cn("truncate", s.isProject && "font-semibold text-warning-700 dark:text-warning-400", s.isCompetitor && "text-info-700 dark:text-info-400")}>
                  {label}{s.isProject ? " (you)" : s.isCompetitor ? " (competitor)" : ""}
                </span>
                {s.title && <span className="truncate text-muted-foreground">· {s.title}</span>}
                {href && (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0 text-muted-foreground hover:text-foreground" title="Open the cited page">
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Highlight brand/competitor names inside a plain string (no markdown here).
function highlightRuns(text: string, brand: string[], comp: string[], kp: string): ReactNode[] {
  return segmentMentions(text, brand, comp).map((s, i) =>
    s.kind === "plain" ? (
      <span key={`${kp}-${i}`}>{s.text}</span>
    ) : (
      <mark key={`${kp}-${i}`} className={cn("rounded px-0.5 font-semibold text-foreground",
        s.kind === "brand" ? "bg-warning-300/50 dark:bg-warning-500/30" : "bg-info-300/40 dark:bg-info-500/25")}>
        {s.text}
      </mark>
    ),
  );
}

// Inline markdown (**bold**, *italic*, `code`, [text](url)) → React, with brand
// highlighting applied to the plain text inside.
function renderInline(text: string, brand: string[], comp: string[], kp: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0, k = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(...highlightRuns(text.slice(last, m.index), brand, comp, `${kp}t${k++}`));
    if (m[1]) nodes.push(<strong key={`${kp}b${k++}`} className="font-semibold text-foreground">{highlightRuns(m[2], brand, comp, `${kp}bi${k}`)}</strong>);
    else if (m[3]) nodes.push(<em key={`${kp}i${k++}`}>{highlightRuns(m[4], brand, comp, `${kp}ii${k}`)}</em>);
    else if (m[5]) nodes.push(<code key={`${kp}c${k++}`} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{m[6]}</code>);
    else if (m[7]) nodes.push(<a key={`${kp}l${k++}`} href={m[9]} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{m[8]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(...highlightRuns(text.slice(last), brand, comp, `${kp}t${k++}`));
  return nodes;
}

// Lightweight markdown renderer for a stored AI answer: headings, bullet/numbered
// lists, blockquotes and paragraphs, with brand/competitor names highlighted. No
// external dependency — AI answers only use a small subset of markdown.
function HighlightedAnswer({ text, brandNames, competitorNames }: { text: string; brandNames: string[]; competitorNames: string[] }) {
  const b = brandNames, c = competitorNames;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0, key = 0;
  const isBlockStart = (l: string) => /^(#{1,6}\s|>\s?|\s*[-*•]\s|\s*\d+\.\s)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const cls = lvl <= 1 ? "text-lg font-bold" : lvl === 2 ? "text-base font-bold" : "text-sm font-semibold";
      blocks.push(<p key={key} className={cn("mt-4 first:mt-0 text-foreground", cls)}>{renderInline(h[2], b, c, `h${key++}`)}</p>);
      i++; continue;
    }
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, "")); i++; }
      blocks.push(<blockquote key={key} className="mt-3 border-l-2 border-primary/40 pl-3 italic text-foreground/80">{renderInline(q.join(" "), b, c, `q${key++}`)}</blockquote>);
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*•]\s+/, "")); i++; }
      blocks.push(<ul key={key} className="mt-2 list-disc space-y-1 pl-5">{items.map((it, j) => <li key={j}>{renderInline(it, b, c, `ul${key}-${j}`)}</li>)}</ul>);
      key++; continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      blocks.push(<ol key={key} className="mt-2 list-decimal space-y-1 pl-5">{items.map((it, j) => <li key={j}>{renderInline(it, b, c, `ol${key}-${j}`)}</li>)}</ol>);
      key++; continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={key} className="mt-3 first:mt-0 leading-relaxed text-foreground/90">{renderInline(para.join(" "), b, c, `p${key++}`)}</p>);
  }

  return <div className="text-[13.5px] leading-relaxed">{blocks}</div>;
}
