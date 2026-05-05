import { requireAdmin } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RunAuditButton } from "@/components/sections/run-audit-button";
import type { Project } from "@/lib/types/database";
import { format } from "date-fns";

export const metadata = { title: "Project" };

export default async function ProjectsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);
  const project = ((data ?? [])[0] ?? null) as Project | null;

  return (
    <div className="flex-1 px-6 py-8 lg:px-10 space-y-6 max-w-[900px] w-full mx-auto">
      <PageHeader
        title="Project"
        description="Internal dashboard — single project (we360.ai). Hit 'Run audit now' to kick off all 8 SEO skills immediately, or wait for the Tuesday 11 AM IST cron."
      />
      {!project ? (
        <Card className="p-10 text-center text-sm text-muted-foreground border-dashed">
          The <code className="px-1 rounded bg-muted">we360.ai</code> project row is missing — run the
          latest Supabase migrations (including{" "}
          <code className="px-1 rounded bg-muted">20260424000002_seed_we360_project.sql</code>).
        </Card>
      ) : (
        <Card className="p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex size-11 items-center justify-center rounded-lg bg-[#5B45E0] text-white font-bold shrink-0">
                {project.name[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-lg truncate text-[#231D4F] dark:text-white">
                  {project.name}
                </div>
                <div className="text-xs text-muted-foreground truncate">{project.domain}</div>
              </div>
            </div>
            <Badge variant={project.is_active ? "secondary" : "outline"}>
              {project.is_active ? "Active" : "Archived"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground">Industry</div>
              <div className="font-medium">{project.industry ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Country / TZ</div>
              <div className="font-medium">{project.country} / {project.timezone}</div>
            </div>
            <div>
              <div className="text-muted-foreground">GA4</div>
              <div className="font-medium truncate">
                {project.ga4_property_id ?? "Not connected"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">GSC</div>
              <div className="font-medium truncate">
                {project.gsc_property_url ? "Connected" : "Not connected"}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t">
            <div className="text-[10px] text-muted-foreground">
              Created {format(new Date(project.created_at), "MMM d, yyyy")}
            </div>
            {project.is_active && <RunAuditButton projectId={project.id} />}
          </div>
        </Card>
      )}
    </div>
  );
}
