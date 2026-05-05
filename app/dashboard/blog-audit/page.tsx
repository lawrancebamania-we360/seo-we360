import { requireSection } from "@/lib/auth/get-user";
import { getLatestBlogAudit } from "@/lib/data/blog-audit";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BlogAuditTable } from "@/components/sections/blog-audit-table";
import { Trash2, GitMerge, RefreshCw, CheckCircle2, FileSearch } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const metadata = { title: "Blog audit" };

export default async function BlogAuditPage() {
  const ctx = await requireSection("seo_gaps");
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const { run, rows } = await getLatestBlogAudit(ctx.activeProject.id);

  // Roll up counts for the summary strip
  const counts = { prune: 0, merge: 0, refresh: 0, keep: 0 };
  const doneCounts = { prune: 0, merge: 0, refresh: 0, keep: 0 };
  for (const r of rows) {
    counts[r.decision]++;
    if (r.status === "done") doneCounts[r.decision]++;
  }

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Blog audit"
        description="GSC + GA4 driven decisions for every blog URL — prune, merge, refresh, or keep. Re-run the script monthly to refresh decisions."
        actions={
          run && (
            <Badge variant="secondary" className="gap-1.5">
              Snapshot from {formatDistanceToNow(new Date(run.pulled_at), { addSuffix: true })} · {run.total_urls} URLs
            </Badge>
          )
        }
      />

      {!run ? (
        <Card className="border-dashed p-12 text-center space-y-2">
          <FileSearch className="size-8 text-muted-foreground mx-auto" />
          <div className="text-sm font-medium">No blog audit yet</div>
          <div className="text-xs text-muted-foreground max-w-md mx-auto">
            Run <code className="px-1.5 py-0.5 rounded bg-muted text-foreground/80 text-[10px]">npx tsx scripts/blog-audit-gsc-ga4.ts --execute</code> to pull GSC + GA4 data, apply the decision tree, and populate this dashboard.
          </div>
          <div className="text-[11px] text-muted-foreground pt-2">
            Prereq: apply <code className="px-1 py-0.5 rounded bg-muted text-[10px]">supabase/migrations/20260429000001_blog_audit.sql</code> in the Supabase SQL editor first.
          </div>
        </Card>
      ) : (
        <>
          {/* Summary strip */}
          <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <SummaryCell icon={Trash2} tone="rose" label="Prune (410)"
              total={counts.prune} done={doneCounts.prune}
              hint="Invisible to Google — delete permanently" />
            <SummaryCell icon={GitMerge} tone="amber" label="Merge (301)"
              total={counts.merge} done={doneCounts.merge}
              hint="Cannibalized — redirect to stronger sibling" />
            <SummaryCell icon={RefreshCw} tone="violet" label="Refresh"
              total={counts.refresh} done={doneCounts.refresh}
              hint="Striking distance — rewrite to push to top 10" />
            <SummaryCell icon={CheckCircle2} tone="emerald" label="Keep"
              total={counts.keep} done={doneCounts.keep}
              hint="Performing well — internal links only" />
          </section>

          <BlogAuditTable rows={rows} />
        </>
      )}
    </div>
  );
}

function SummaryCell({
  icon: Icon, tone, label, total, done, hint,
}: {
  icon: typeof Trash2;
  tone: "rose" | "amber" | "violet" | "emerald";
  label: string; total: number; done: number; hint: string;
}) {
  const toneClass = {
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  }[tone];
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`flex size-9 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-lg font-semibold tabular-nums leading-tight">
          {total}
          {total > 0 && (
            <span className="text-xs font-normal text-muted-foreground ml-2">
              {done}/{total} done ({pct}%)
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{hint}</div>
      </div>
    </Card>
  );
}
