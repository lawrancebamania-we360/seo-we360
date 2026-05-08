"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, ShieldAlert, FileWarning, Loader2, RefreshCw,
  AlertTriangle, AlertCircle, Info, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLatestVerification, requeueTaskVerification } from "@/lib/actions/tasks";
import type { TaskVerification, VerificationIssue } from "@/lib/types/verification";

// Side panel inside the task detail dialog. Shows the latest verification
// breakdown — overall score, hard/soft fails, individual issues with
// suggestions. Admins get a "Re-verify" button to force a re-run.

interface Props {
  taskId: string;
  taskStatus: string;            // tasks.status — used to gate Re-verify
  canEdit: boolean;              // admin only
  // Latest snapshot from the task row. Used to short-circuit the loader and
  // avoid a fetch when there's no verification yet.
  liveStatus: string | null;
  liveScore: number | null;
  liveDelta: number | null;
  liveSummary: string | null;
  liveVerifiedAt: string | null;
}

export function AiVerificationPanel({
  taskId, taskStatus, canEdit, liveStatus, liveScore, liveDelta, liveSummary, liveVerifiedAt,
}: Props) {
  const [verification, setVerification] = useState<TaskVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startReverify] = useTransition();

  // Fetch the full verification record (with issues) only when there's
  // something to show.
  useEffect(() => {
    if (!liveStatus || liveStatus === "queued") {
      setVerification(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getLatestVerification(taskId)
      .then((data) => {
        if (cancelled) return;
        setVerification(data as TaskVerification | null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [taskId, liveStatus, liveVerifiedAt]);

  if (!liveStatus) return null;

  const reverify = () => {
    startReverify(async () => {
      try {
        await requeueTaskVerification(taskId);
        toast.success("Re-queued — will check at the next 10am IST window");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to re-queue");
      }
    });
  };

  const isQueued = liveStatus === "queued" || liveStatus === "running";
  const isDocMissing = liveStatus === "doc_missing";
  const isPassed = liveStatus === "verified";
  const isFailed = liveStatus === "failed";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
        <ShieldCheck className="size-3.5" /> AI verification
      </div>

      {/* Status banner */}
      <div
        className={cn(
          "rounded-lg border p-3 space-y-1.5",
          isPassed   && "bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900",
          isFailed   && "bg-rose-50/60 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900",
          isDocMissing && "bg-rose-50/60 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900",
          isQueued   && "bg-violet-50/40 border-violet-200 dark:bg-violet-950/20 dark:border-violet-900",
        )}
      >
        <div className="flex items-start gap-2.5">
          <StatusIcon status={liveStatus} />
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-sm font-semibold">{statusLabel(liveStatus)}</div>
              {liveScore !== null && (isPassed || isFailed) && (
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  Score {liveScore}/100
                </Badge>
              )}
              {liveDelta !== null && liveDelta !== 0 && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] tabular-nums",
                    liveDelta > 0
                      ? "text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-800"
                      : "text-rose-700 border-rose-300 dark:text-rose-400 dark:border-rose-800",
                  )}
                >
                  {liveDelta > 0 ? "↑" : "↓"} {Math.abs(liveDelta)} from last run
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{liveSummary ?? defaultSummary(liveStatus)}</div>
            {liveVerifiedAt && (
              <div className="text-[11px] text-muted-foreground">
                Last checked {new Date(liveVerifiedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            )}
          </div>
          {canEdit && !isQueued && (taskStatus === "review" || taskStatus === "done") && (
            <Button size="sm" variant="outline" onClick={reverify} disabled={pending} className="gap-1.5">
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              <RefreshCw className="size-3.5" />
              Re-verify
            </Button>
          )}
        </div>
      </div>

      {/* Score breakdown — only show when we have a complete run */}
      {!loading && verification && (verification.status === "verified" || verification.status === "failed") && (
        <ScoreBreakdown verification={verification} />
      )}

      {/* Issue list — hard fails first, then soft, then info */}
      {!loading && verification && verification.issues && verification.issues.length > 0 && (
        <IssuesList issues={verification.issues as VerificationIssue[]} />
      )}

      {/* Source link (the Google Doc or live URL the verification ran against) */}
      {verification && verification.source_url && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs flex items-center gap-2">
          <ExternalLink className="size-3 text-muted-foreground" />
          <span className="text-muted-foreground">Verified against</span>
          <a
            href={verification.source_url}
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:underline truncate"
          >
            {verification.source_type === "live_url" ? "Live URL" : "Google Doc"} ↗
          </a>
          {verification.word_count && (
            <span className="ml-auto text-muted-foreground tabular-nums text-[11px]">
              {verification.word_count.toLocaleString("en-IN")} words
            </span>
          )}
        </div>
      )}

      {loading && (
        <div className="rounded-md border p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin" /> Loading verification details…
        </div>
      )}
    </div>
  );
}

// ============ Sub-components ============

function StatusIcon({ status }: { status: string }) {
  if (status === "verified") return <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />;
  if (status === "failed") return <ShieldAlert className="size-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />;
  if (status === "doc_missing") return <FileWarning className="size-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />;
  if (status === "running") return <Loader2 className="size-5 text-[#5B45E0] dark:text-[#7B62FF] shrink-0 mt-0.5 animate-spin" />;
  return <ShieldCheck className="size-5 text-[#5B45E0] dark:text-[#7B62FF] shrink-0 mt-0.5" />;
}

function statusLabel(status: string): string {
  switch (status) {
    case "verified": return "AI verified · ready for publish";
    case "failed": return "AI verification failed";
    case "doc_missing": return "Doc link missing";
    case "running": return "Verifying now…";
    case "queued": return "Queued for AI verification";
    default: return status;
  }
}

function defaultSummary(status: string): string {
  switch (status) {
    case "queued": return "Will check at the next 10am IST window.";
    case "running": return "Reading the doc and running checks.";
    case "verified": return "All hard checks passed.";
    case "failed": return "One or more hard checks failed. See issues below.";
    case "doc_missing": return "Paste a Google Doc URL into Supporting links above, then re-trigger.";
    default: return "";
  }
}

function ScoreBreakdown({ verification }: { verification: TaskVerification }) {
  const q = verification.quality_result;
  const h = verification.humanization_result;
  const p = verification.plagiarism_result;
  const l = verification.llm_compliance_result;

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="px-3 py-2 bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        Score breakdown
      </div>
      <div className="divide-y text-xs">
        {q && q.ok && (
          <BreakdownRow
            label="Quality"
            stat={`${q.wordCount}/${q.wordCountTarget} words · ${Math.round(q.h2Coverage * 100)}% H2 coverage`}
            sub={`${q.internalLinks} internal · ${q.externalCitations} external · Flesch ${q.fleschReadingEase} · schema [${q.jsonLdBlocks.join(", ") || "none"}]`}
          />
        )}
        {h && h.ok && (
          <BreakdownRow
            label="Humanization"
            stat={`${h.score}/100 (lower is better)`}
            sub={`${h.signals.em_dash_per_100w} em dashes/100w · ${h.signals.ai_vocab_density} AI vocab/1000w · variance ${h.signals.sentence_length_variance}`}
            tone={h.score > 60 ? "fail" : h.score > 45 ? "warn" : "ok"}
          />
        )}
        {p && p.ok && (
          <BreakdownRow
            label="Plagiarism"
            stat={`${p.matchPercent}% match (${p.matchesFound}/${p.phrasesChecked} phrases)`}
            sub={`Search engine: ${p.searchEngine}`}
            tone={p.matchPercent > 25 ? "fail" : p.matchPercent > 10 ? "warn" : "ok"}
          />
        )}
        {l && l.ok && (
          <BreakdownRow
            label="Brief alignment"
            stat={`${l.briefAlignment}/100`}
            sub={l.notes ? l.notes.slice(0, 200) : `Model: ${l.model}`}
            tone={l.briefAlignment >= 80 ? "ok" : l.briefAlignment >= 60 ? "warn" : "fail"}
          />
        )}
      </div>
    </div>
  );
}

function BreakdownRow({ label, stat, sub, tone = "ok" }: { label: string; stat: string; sub: string; tone?: "ok" | "warn" | "fail" }) {
  const dotColor = tone === "fail" ? "bg-rose-500" : tone === "warn" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="px-3 py-2 flex items-start gap-2.5">
      <div className={cn("size-1.5 rounded-full mt-1.5 shrink-0", dotColor)} />
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="font-medium">{label}</div>
        <div className="tabular-nums text-muted-foreground">{stat}</div>
        <div className="text-[11px] text-muted-foreground/80 break-words">{sub}</div>
      </div>
    </div>
  );
}

function IssuesList({ issues }: { issues: VerificationIssue[] }) {
  // Sort: hard first, then soft, then info. Stable within group.
  const order: Record<VerificationIssue["severity"], number> = { hard: 0, soft: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="px-3 py-2 bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
        <span>{sorted.length} issue{sorted.length === 1 ? "" : "s"}</span>
        <span className="text-[10px] normal-case tracking-normal text-muted-foreground/80">
          {issues.filter((i) => i.severity === "hard").length} hard · {issues.filter((i) => i.severity === "soft").length} soft · {issues.filter((i) => i.severity === "info").length} info
        </span>
      </div>
      <div className="divide-y">
        {sorted.map((issue, idx) => (
          <IssueRow key={idx} issue={issue} />
        ))}
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: VerificationIssue }) {
  const Icon = issue.severity === "hard" ? AlertCircle : issue.severity === "soft" ? AlertTriangle : Info;
  const tone = issue.severity === "hard"
    ? "text-rose-600 dark:text-rose-400"
    : issue.severity === "soft"
    ? "text-amber-600 dark:text-amber-400"
    : "text-sky-600 dark:text-sky-400";

  return (
    <div className="px-3 py-2.5 text-xs flex items-start gap-2.5">
      <Icon className={cn("size-3.5 shrink-0 mt-0.5", tone)} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="font-medium break-words">{issue.message}</div>
        {issue.suggestion && (
          <div className="text-muted-foreground break-words">
            <span className="font-medium text-foreground/80">Fix:</span> {issue.suggestion}
          </div>
        )}
        {issue.evidence && (
          <div className="text-[11px] italic text-muted-foreground bg-muted/40 rounded px-2 py-1 break-words">
            “{issue.evidence}”
          </div>
        )}
      </div>
      <Badge variant="outline" className="text-[9px] uppercase tracking-wider shrink-0">
        {issue.category}
      </Badge>
    </div>
  );
}
