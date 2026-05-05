import { requireSection } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { NewCompetitorDialog, DeleteCompetitorButton } from "@/components/sections/competitor-dialogs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, TrendingUp, Zap, Shield, Loader2 } from "lucide-react";
import { formatNumber } from "@/lib/ui-helpers";
import type { Competitor } from "@/lib/types/database";
import { formatDistanceToNow } from "date-fns";

export const metadata = { title: "Competitors" };

interface AutoAnalysis {
  analyzed_at?: string;
  they_win?: string[];
  we_win?: string[];
  we_can_steal?: string[];
  keyword_gap?: Array<{ question: string; opportunityScore: number }>;
  summary?: string;
}

export default async function CompetitorsPage() {
  const ctx = await requireSection("competitors");
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const supabase = await createClient();
  const { data } = await supabase
    .from("competitors")
    .select("*")
    .eq("project_id", ctx.activeProject.id)
    .order("da", { ascending: false });
  const competitors = (data ?? []) as Competitor[];
  const canManage = ctx.canManageTeam;

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1400px] w-full mx-auto">
      <PageHeader
        title="Competitors"
        description="Track who's winning in your SERP. Add any competitor — we auto-analyze their site + keyword gap."
        actions={canManage && <NewCompetitorDialog projectId={ctx.activeProject.id} />}
      />
      {competitors.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          No competitors yet. Click <strong>Add competitor</strong> to start the first auto-analysis.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {competitors.map((c) => (
            <CompetitorCard key={c.id} competitor={c} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompetitorCard({ competitor, canManage }: { competitor: Competitor; canManage: boolean }) {
  const analysis = (competitor.auto_analysis ?? {}) as AutoAnalysis;
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500/15 to-rose-500/15 text-orange-700 dark:text-orange-400 font-bold shrink-0">
            {competitor.name[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{competitor.name}</div>
            <a
              href={competitor.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              {(() => { try { return new URL(competitor.url).hostname; } catch { return competitor.url; } })()}
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="secondary">DA {competitor.da ?? "—"}</Badge>
          {canManage && <DeleteCompetitorButton competitorId={competitor.id} name={competitor.name} />}
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Traffic/mo</div>
          <div className="font-semibold tabular-nums">{formatNumber(competitor.traffic)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Analysis</div>
          <div className="font-semibold">
            {competitor.analysis_status === "pending" && (
              <span className="inline-flex items-center gap-1 text-amber-600"><Loader2 className="size-3 animate-spin" /> Queued</span>
            )}
            {competitor.analysis_status === "analyzing" && (
              <span className="inline-flex items-center gap-1 text-sky-600"><Loader2 className="size-3 animate-spin" /> Running</span>
            )}
            {competitor.analysis_status === "complete" && competitor.last_analyzed_at && (
              <span className="text-emerald-600">Done · {formatDistanceToNow(new Date(competitor.last_analyzed_at), { addSuffix: true })}</span>
            )}
            {competitor.analysis_status === "failed" && <span className="text-rose-600">Failed</span>}
          </div>
        </div>
      </div>

      {analysis.summary && (
        <div className="rounded-md bg-muted/40 border p-3 text-xs">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
            Summary
          </div>
          <p className="text-foreground leading-relaxed">{analysis.summary}</p>
        </div>
      )}

      {analysis.we_win && analysis.we_win.length > 0 && (
        <InsightBlock icon={TrendingUp} label="We're winning" tone="emerald" items={analysis.we_win.slice(0, 3)} />
      )}
      {analysis.they_win && analysis.they_win.length > 0 && (
        <InsightBlock icon={Shield} label="They're winning" tone="rose" items={analysis.they_win.slice(0, 3)} />
      )}
      {analysis.keyword_gap && analysis.keyword_gap.length > 0 && (
        <div className="rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 p-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-violet-700 dark:text-violet-400 mb-1.5 inline-flex items-center gap-1">
            <Zap className="size-3" />
            Keyword opportunities
          </div>
          <ul className="space-y-1 text-xs text-violet-900 dark:text-violet-200">
            {analysis.keyword_gap.slice(0, 3).map((k, i) => (
              <li key={i}>· {k.question} <span className="opacity-60">(score {k.opportunityScore}/10)</span></li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function InsightBlock({
  icon: Icon, label, tone, items,
}: {
  icon: typeof TrendingUp;
  label: string;
  tone: "emerald" | "rose";
  items: string[];
}) {
  const classes = tone === "emerald"
    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400"
    : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400";
  const textClasses = tone === "emerald"
    ? "text-emerald-900 dark:text-emerald-200"
    : "text-rose-900 dark:text-rose-200";
  return (
    <div className={`rounded-md border p-3 ${classes}`}>
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5 inline-flex items-center gap-1">
        <Icon className="size-3" />
        {label}
      </div>
      <ul className={`space-y-1 text-xs ${textClasses}`}>
        {items.map((item, i) => (
          <li key={i}>· {item}</li>
        ))}
      </ul>
    </div>
  );
}
