import { getUserContext } from "@/lib/auth/get-user";
import { getSeoReport } from "@/lib/data/seo-report";
import { getBlogAudit, type BlogAuditSnapshot } from "@/lib/data/blog-audit";
import { getTeamMembers } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { SiteTrafficBoxes } from "@/components/sections/site-traffic-boxes";
import { SeoReportView } from "@/components/sections/seo-report-view";
import { BlogAuditWorklist } from "@/components/sections/blog-audit-worklist";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Trash2, GitMerge, RefreshCw, FileSearch, BarChart3, ClipboardList } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const metadata = { title: "Reports" };

// Resolve a ?range= preset to a start date (ISO). end is always "today".
function rangeToStart(range: string): string | undefined {
  const now = new Date();
  if (range === "30d") {
    const d = new Date(now); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }
  if (range === "90d") {
    const d = new Date(now); d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  }
  if (range === "ytd") {
    return `${now.getFullYear()}-01-01`;
  }
  return undefined; // "all"
}

// Unified SEO Reports page. Two lenses on the same url_metrics data:
//   • Published work  — per completed task: titles, owners, "is it winning?"
//                       (the old /dashboard/reports)
//   • Audit worklist  — per URL: prune / merge / refresh decisions you can
//                       convert into Sprint tasks (the old /dashboard/blog-audit,
//                       now folded in here — that route redirects to ?tab=audit)
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; tab?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const params = await searchParams;
  const range = params.range ?? "all";
  const start = rangeToStart(range);
  const end = start ? new Date().toISOString().slice(0, 10) : undefined;

  // The audit worklist lived behind requireSection("seo_gaps"): admins always
  // pass, members pass unless their permission row explicitly denies view.
  // Mirror that here so the tab (and its data fetch) only appears for people
  // who were allowed on the old Blog audit page.
  const seoGapsPerm = ctx.permissions["seo_gaps"];
  const canSeeAudit = ctx.canManageTeam || seoGapsPerm?.can_view !== false;

  const [snapshot, audit, members] = await Promise.all([
    getSeoReport(ctx.activeProject.id, { start, end }),
    canSeeAudit ? getBlogAudit(ctx.activeProject.id) : Promise.resolve(null),
    canSeeAudit ? getTeamMembers() : Promise.resolve([]),
  ]);

  const defaultTab = canSeeAudit && params.tab === "audit" ? "audit" : "published";

  const publishedView = (
    <SeoReportView rows={snapshot.rows} rollup={snapshot.rollup} activeRange={range} />
  );

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Reports"
        description={
          canSeeAudit
            ? "Two views of the same live GSC + GA4 data — what the team shipped and whether it's earning traffic, plus a per-URL audit worklist (prune / merge / refresh) you can turn into Sprint tasks."
            : "What the SEO team shipped — and whether it's earning traffic. Live GSC + GA4 metrics, sitemap status, and SEO issues for every completed blog post and page."
        }
      />

      {/* Whole-site GA4 traffic — last month vs this month (context for both views) */}
      <SiteTrafficBoxes />

      {canSeeAudit && audit ? (
        <Tabs defaultValue={defaultTab} className="gap-5">
          <TabsList>
            <TabsTrigger value="published">
              <BarChart3 className="size-3.5" /> Published work
            </TabsTrigger>
            <TabsTrigger value="audit">
              <ClipboardList className="size-3.5" /> Audit worklist
            </TabsTrigger>
          </TabsList>

          <TabsContent value="published" className="space-y-5">
            {publishedView}
          </TabsContent>

          <TabsContent value="audit" className="space-y-5">
            <AuditPanel
              snapshot={audit}
              members={members}
              canEdit={ctx.canManageTeam}
              projectId={ctx.activeProject.id}
            />
          </TabsContent>
        </Tabs>
      ) : (
        publishedView
      )}
    </div>
  );
}

// ===== Audit worklist panel (the old Blog audit page body) =====

function AuditPanel({
  snapshot, members, canEdit, projectId,
}: {
  snapshot: BlogAuditSnapshot;
  members: Awaited<ReturnType<typeof getTeamMembers>>;
  canEdit: boolean;
  projectId: string;
}) {
  if (snapshot.total_urls === 0) {
    return (
      <Card className="border-dashed p-12 text-center space-y-2">
        <FileSearch className="size-8 text-muted-foreground mx-auto" />
        <div className="text-sm font-medium">No url_metrics data yet</div>
        <div className="text-xs text-muted-foreground max-w-md mx-auto">
          Run the daily sync (locally: <code className="px-1.5 py-0.5 rounded bg-muted text-foreground/80 text-[10px]">npx tsx scripts/sync-url-metrics.ts</code>, or wait for the GitHub Actions schedule at 10am IST) to populate <code className="px-1 py-0.5 rounded bg-muted text-[10px]">url_metrics</code>.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground max-w-2xl">
          Live GSC + GA4 driven decisions for every URL. Prune, merge, refresh, or keep — convert findings into Sprint tasks with one click.
        </p>
        {snapshot.pulled_at && (
          <Badge variant="secondary" className="gap-1.5 shrink-0">
            Snapshot from {formatDistanceToNow(new Date(snapshot.pulled_at), { addSuffix: true })} · {snapshot.total_urls} URLs
          </Badge>
        )}
      </div>

      {/* Summary strip — only actionable decisions (Keep is implicit). */}
      <section className="grid gap-3 grid-cols-1 md:grid-cols-3">
        <SummaryCell icon={Trash2} tone="rose" label="Delete (410)"
          total={snapshot.counts.prune}
          open={snapshot.open_counts.prune}
          hint="Invisible to Google — remove permanently" />
        <SummaryCell icon={GitMerge} tone="amber" label="Merge (301)"
          total={snapshot.counts.merge}
          open={snapshot.open_counts.merge}
          hint="Cannibalized — redirect to stronger sibling" />
        <SummaryCell icon={RefreshCw} tone="violet" label="Update"
          total={snapshot.counts.refresh}
          open={snapshot.open_counts.refresh}
          hint="Striking distance — rewrite to push to top 10" />
      </section>

      <BlogAuditWorklist
        findings={snapshot.findings}
        members={members}
        canEdit={canEdit}
        projectId={projectId}
      />
    </div>
  );
}

function SummaryCell({
  icon: Icon, tone, label, total, open, hint,
}: {
  icon: typeof Trash2;
  tone: "rose" | "amber" | "violet";
  label: string; total: number; open: number; hint: string;
}) {
  const toneClass = {
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  }[tone];

  const subtitle = total === 0
    ? "nothing flagged"
    : open === 0
      ? `${total} already in Sprint`
      : open === total
        ? `${open} need a task`
        : `${open} need a task · ${total - open} in Sprint`;
  const inAction = open > 0;

  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`flex size-9 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-lg font-semibold tabular-nums leading-tight flex items-baseline gap-2">
          <span className={cn(inAction && "text-rose-600 dark:text-rose-400")}>{open}</span>
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>
        <div className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{hint}</div>
      </div>
    </Card>
  );
}
