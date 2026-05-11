import { requireSection } from "@/lib/auth/get-user";
import { getBlogAudit } from "@/lib/data/blog-audit";
import { getTeamMembers } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BlogAuditWorklist } from "@/components/sections/blog-audit-worklist";
import { Trash2, GitMerge, RefreshCw, CheckCircle2, FileSearch } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const metadata = { title: "Blog audit" };

export default async function BlogAuditPage() {
  const ctx = await requireSection("seo_gaps");
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const [snapshot, members] = await Promise.all([
    getBlogAudit(ctx.activeProject.id),
    getTeamMembers(),
  ]);

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Blog audit"
        description="Live GSC + GA4 driven decisions for every URL. Prune, merge, refresh, or keep — convert findings into Sprint tasks with one click."
        actions={
          snapshot.pulled_at && (
            <Badge variant="secondary" className="gap-1.5">
              Snapshot from {formatDistanceToNow(new Date(snapshot.pulled_at), { addSuffix: true })} · {snapshot.total_urls} URLs
            </Badge>
          )
        }
      />

      {snapshot.total_urls === 0 ? (
        <Card className="border-dashed p-12 text-center space-y-2">
          <FileSearch className="size-8 text-muted-foreground mx-auto" />
          <div className="text-sm font-medium">No url_metrics data yet</div>
          <div className="text-xs text-muted-foreground max-w-md mx-auto">
            Run the daily Composio sync (locally: <code className="px-1.5 py-0.5 rounded bg-muted text-foreground/80 text-[10px]">npx tsx scripts/composio/sync-url-metrics.ts</code>, or wait for the GitHub Actions schedule at 10am IST) to populate <code className="px-1 py-0.5 rounded bg-muted text-[10px]">url_metrics</code>.
          </div>
        </Card>
      ) : (
        <>
          {/* Summary strip — Open count is what's actionable today */}
          <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <SummaryCell icon={Trash2} tone="rose" label="Prune (410)"
              total={snapshot.counts.prune}
              open={snapshot.open_counts.prune}
              hint="Invisible to Google — delete permanently" />
            <SummaryCell icon={GitMerge} tone="amber" label="Merge (301)"
              total={snapshot.counts.merge}
              open={snapshot.open_counts.merge}
              hint="Cannibalized — redirect to stronger sibling" />
            <SummaryCell icon={RefreshCw} tone="violet" label="Refresh"
              total={snapshot.counts.refresh}
              open={snapshot.open_counts.refresh}
              hint="Striking distance — rewrite to push to top 10" />
            <SummaryCell icon={CheckCircle2} tone="emerald" label="Keep"
              total={snapshot.counts.keep}
              open={0}
              hint="Performing well — no action needed" />
          </section>

          <BlogAuditWorklist
            findings={snapshot.findings}
            members={members}
            canEdit={ctx.canManageTeam}
            projectId={ctx.activeProject.id}
          />
        </>
      )}
    </div>
  );
}

function SummaryCell({
  icon: Icon, tone, label, total, open, hint,
}: {
  icon: typeof Trash2;
  tone: "rose" | "amber" | "violet" | "emerald";
  label: string; total: number; open: number; hint: string;
}) {
  const toneClass = {
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  }[tone];
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`flex size-9 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-lg font-semibold tabular-nums leading-tight">
          {total}
          {open > 0 && (
            <span className="text-xs font-normal text-rose-600 dark:text-rose-400 ml-2">
              {open} open
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{hint}</div>
      </div>
    </Card>
  );
}
