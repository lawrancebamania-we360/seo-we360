"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight, ExternalLink, AlertTriangle, AlertCircle,
  XCircle, CheckCircle2, Circle, FileText,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { PageGapDetail, AuditFinding } from "@/lib/data/seo-gaps";

const STATUS_META = {
  fail: { label: "Fail", icon: XCircle, className: "text-rose-600 bg-rose-500/10 border-rose-500/20 dark:text-rose-400" },
  missing: { label: "Missing", icon: Circle, className: "text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-400" },
  warn: { label: "Warn", icon: AlertTriangle, className: "text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-400" },
  ok: { label: "OK", icon: CheckCircle2, className: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400" },
} as const;

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20" },
  high:     { label: "High",     className: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20" },
  medium:   { label: "Medium",   className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  low:      { label: "Low",      className: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20" },
};

const SKILL_PRETTY: Record<string, string> = {
  technical: "Technical SEO",
  schema: "Schema markup",
  images: "Images",
  content: "Content quality",
  local: "Local SEO",
  geo: "E-E-A-T / Generative",
  aio: "AI accessibility",
  aeo: "Answer-engine readiness",
  ai_citability: "AI citability",
  speed: "Performance",
  sitemap: "Sitemap",
  hreflang: "Hreflang",
  programmatic: "Programmatic SEO",
};

export function SeoGapDetailCard({ page }: { page: PageGapDetail }) {
  const [expanded, setExpanded] = useState(false);

  const pathname = (() => {
    try { return new URL(page.url).pathname || "/"; } catch { return page.url; }
  })();
  const hostname = (() => {
    try { return new URL(page.url).hostname; } catch { return ""; }
  })();

  const issueCount = page.counts.fail + page.counts.missing;
  const hasCritical = page.top_findings.some((f) => f.priority === "critical");

  // Skill groups sorted by severity (most critical issues first)
  const skillGroups = Object.entries(page.findings_by_skill).sort(([, a], [, b]) => {
    const aCritical = a.filter((f) => f.priority === "critical").length;
    const bCritical = b.filter((f) => f.priority === "critical").length;
    if (aCritical !== bCritical) return bCritical - aCritical;
    return b.length - a.length;
  });

  return (
    <Card className={cn(
      "overflow-hidden transition-all",
      hasCritical && "ring-1 ring-rose-500/20",
      issueCount === 0 && page.top_findings.length === 0 && "opacity-80"
    )}>
      {/* Header row (always visible) */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-sm hover:text-primary inline-flex items-center gap-1 min-w-0 max-w-full"
              >
                <span className="truncate">{pathname}</span>
                <ExternalLink className="size-3 shrink-0 opacity-60" />
              </a>
              {page.is_blog && (
                <Badge variant="secondary" className="text-[9px] gap-1">
                  <FileText className="size-2.5" />
                  Blog
                </Badge>
              )}
            </div>
            {page.page_title && (
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                {page.page_title}
              </div>
            )}
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {hostname}
              {page.last_checked && (
                <> · checked {formatDistanceToNow(new Date(page.last_checked), { addSuffix: true })}</>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {!page.audit_ran ? (
              <Badge className="text-[10px] gap-1 border bg-muted text-muted-foreground border-muted-foreground/20">
                <Circle className="size-2.5" />
                Awaiting audit
              </Badge>
            ) : (
              <>
                {page.counts.fail > 0 && (
                  <Badge className={cn("text-[10px] gap-1 border", STATUS_META.fail.className)}>
                    <XCircle className="size-2.5" />
                    {page.counts.fail} fail
                  </Badge>
                )}
                {page.counts.missing > 0 && (
                  <Badge className={cn("text-[10px] gap-1 border", STATUS_META.missing.className)}>
                    <Circle className="size-2.5" />
                    {page.counts.missing} missing
                  </Badge>
                )}
                {page.counts.warn > 0 && (
                  <Badge className={cn("text-[10px] gap-1 border", STATUS_META.warn.className)}>
                    <AlertTriangle className="size-2.5" />
                    {page.counts.warn} warn
                  </Badge>
                )}
                {issueCount === 0 && page.counts.warn === 0 && (
                  <Badge className={cn("text-[10px] gap-1 border", STATUS_META.ok.className)}>
                    <CheckCircle2 className="size-2.5" />
                    All checks passed
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>

        {/* Awaiting-audit hint */}
        {!page.audit_ran && (
          <div className="text-xs text-muted-foreground rounded-md bg-muted/40 border border-dashed px-3 py-2">
            This URL is tracked but hasn&apos;t been crawled yet. Click <strong>Run audit now</strong> above to
            include it in the next audit — that&apos;ll populate per-page findings here.
          </div>
        )}

        {/* Top issues preview (shown when collapsed) */}
        {!expanded && page.top_findings.length > 0 && (
          <div className="space-y-1.5">
            {page.top_findings.slice(0, 2).map((f) => (
              <TopIssueRow key={f.id} finding={f} compact />
            ))}
            {page.top_findings.length > 2 && (
              <button
                onClick={() => setExpanded(true)}
                className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-0.5"
              >
                +{page.top_findings.length - 2} more issue{page.top_findings.length - 2 === 1 ? "" : "s"}
                <ChevronRight className="size-3" />
              </button>
            )}
          </div>
        )}

        {/* Expand/collapse trigger */}
        {page.top_findings.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full text-left text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 pt-1 border-t"
          >
            <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} />
            {expanded ? "Hide details" : `Show all ${page.top_findings.length} issue${page.top_findings.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {/* Expanded: findings grouped by skill */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t bg-muted/20"
          >
            <div className="p-4 space-y-4">
              {skillGroups.map(([skill, findings]) => (
                <div key={skill} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                      {SKILL_PRETTY[skill] ?? skill}
                    </div>
                    <Badge variant="outline" className="text-[9px]">{findings.length} issue{findings.length === 1 ? "" : "s"}</Badge>
                  </div>
                  <div className="space-y-2">
                    {findings.map((f) => (
                      <FindingDetail key={f.id} finding={f} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function TopIssueRow({ finding, compact }: { finding: AuditFinding; compact?: boolean }) {
  const s = STATUS_META[finding.status];
  const Icon = s.icon;
  const prio = finding.priority ? PRIORITY_META[finding.priority] : null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className={cn("size-3.5 shrink-0 mt-0.5", s.className.split(" ")[0])} />
      <div className="min-w-0 flex-1">
        <div className={cn("leading-snug", compact ? "line-clamp-1" : "")}>
          {finding.message ?? `${finding.skill} / ${finding.check_name}`}
        </div>
      </div>
      {prio && (
        <Badge className={cn("text-[9px] border shrink-0", prio.className)}>
          {prio.label}
        </Badge>
      )}
    </div>
  );
}

function FindingDetail({ finding }: { finding: AuditFinding }) {
  const s = STATUS_META[finding.status];
  const Icon = s.icon;
  const prio = finding.priority ? PRIORITY_META[finding.priority] : null;
  const details = finding.details ?? {};
  const detailKeys = Object.keys(details);
  return (
    <div className="rounded-md border bg-background p-3 space-y-1.5 text-xs">
      <div className="flex items-start gap-2">
        <Icon className={cn("size-3.5 shrink-0 mt-0.5", s.className.split(" ")[0])} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{finding.check_name.replace(/_/g, " ")}</span>
            <Badge className={cn("text-[9px] border", s.className)}>{s.label}</Badge>
            {prio && <Badge className={cn("text-[9px] border", prio.className)}>{prio.label}</Badge>}
            {finding.pillar && <Badge variant="outline" className="text-[9px]">{finding.pillar}</Badge>}
          </div>
          {finding.message && (
            <div className="text-foreground/90 leading-relaxed">
              <span className="font-medium text-rose-700 dark:text-rose-400">What's wrong:</span> {finding.message}
            </div>
          )}
          {finding.impl && (
            <div className="text-muted-foreground leading-relaxed">
              <span className="font-medium text-emerald-700 dark:text-emerald-400">How to fix:</span> {finding.impl}
            </div>
          )}
          {detailKeys.length > 0 && detailKeys.some((k) => k !== "note") && (
            <details className="text-xs text-muted-foreground pt-1">
              <summary className="cursor-pointer hover:text-foreground inline-flex items-center gap-1">
                <AlertCircle className="size-3" />
                Technical details
              </summary>
              <pre className="mt-1.5 rounded bg-muted p-2 overflow-x-auto we360-scroll font-mono text-[10px]">
                {JSON.stringify(details, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
