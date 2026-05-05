import Link from "next/link";
import { getUserContext } from "@/lib/auth/get-user";
import { getArticles } from "@/lib/data/articles";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, FileText, CheckCircle2, XCircle, Clock, Sparkles } from "lucide-react";
import { initials } from "@/lib/ui-helpers";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { ArticleStatus } from "@/lib/types/database";

export const metadata = { title: "Articles" };

const STATUS_META: Record<ArticleStatus, { label: string; icon: typeof FileText; className: string }> = {
  draft: { label: "Draft", icon: FileText, className: "text-zinc-600 bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400" },
  review: { label: "In review", icon: Clock, className: "text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400" },
  approved: { label: "Approved", icon: CheckCircle2, className: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400" },
  rejected: { label: "Rejected", icon: XCircle, className: "text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400" },
  published: { label: "Published", icon: Sparkles, className: "text-violet-700 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-400" },
};

export default async function ArticlesPage() {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const articles = await getArticles(ctx.activeProject.id);

  return (
    <div className="flex-1 px-6 py-8 lg:px-10 space-y-6 max-w-[1400px] w-full mx-auto">
      <PageHeader
        title="Article writer"
        description="AI-assisted article drafts with keyword targeting, outline generation, and an approval workflow."
        actions={
          <Button render={<Link href="/dashboard/articles/new" />}>
            <Plus className="size-4" />
            New article
          </Button>
        }
      />
      {articles.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted">
            <FileText className="size-6 text-muted-foreground" />
          </div>
          <div>
            <div className="font-medium">No articles yet</div>
            <div className="text-sm text-muted-foreground mt-1">
              Pick a keyword, generate an outline, and ship your first piece.
            </div>
          </div>
          <Button render={<Link href="/dashboard/articles/new" />}>
            <Plus className="size-4" />
            Create your first article
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => {
            const S = STATUS_META[a.status];
            const Icon = S.icon;
            return (
              <Link key={a.id} href={`/dashboard/articles/${a.id}`}>
                <Card className="p-5 space-y-3 h-full transition-colors hover:border-foreground/20">
                  <div className="flex items-start justify-between gap-2">
                    <Badge className={cn("font-medium", S.className)}>
                      <Icon className="size-3 mr-1" />
                      {S.label}
                    </Badge>
                    {a.ai_provider && a.ai_provider !== "manual" && (
                      <Badge variant="outline" className="text-[10px]">
                        {a.ai_provider}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <div className="font-semibold leading-snug line-clamp-2">{a.title}</div>
                    {a.target_keyword && (
                      <div className="text-xs text-muted-foreground mt-1.5">
                        Target: <span className="font-medium">{a.target_keyword}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <div className="flex items-center gap-2">
                      {a.author && (
                        <>
                          <Avatar className="size-5">
                            <AvatarFallback className="text-[9px]">{initials(a.author.name)}</AvatarFallback>
                          </Avatar>
                          <span>{a.author.name}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{a.word_count} words</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(a.updated_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
