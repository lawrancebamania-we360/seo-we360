import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Radar, ArrowRight } from "lucide-react";

// Start here discovery card for the AI Visibility feature. Self-checking server
// component: renders for first-timers (no citation runs yet) so everyone learns
// the feature exists, and returns null once they've run their first check. The
// product tour still runs first on the first dashboard load; this is the
// persistent on-page nudge after it.
export async function AiVisibilityIntroCard({ projectId }: { projectId: string }) {
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("ai_citation_runs").select("id", { count: "exact", head: true }).eq("project_id", projectId);
    if (count && count > 0) return null;
  } catch {
    return null; // tables not applied yet - skip quietly
  }

  return (
    <Card className="p-5 border-warning-300/40 bg-warning-500/5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning-500/15">
          <Radar className="size-5 text-warning-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">See if AI recommends you</h3>
            <span className="rounded-full bg-warning-500/15 px-1.5 py-0.5 text-xs font-semibold text-warning-700 dark:text-warning-300">New</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Find out whether ChatGPT, Claude, Perplexity and Google AI name you when your buyers ask, who beats you, and exactly how to get cited.
          </p>
          <Link href="/dashboard/ai-visibility" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Check your AI visibility <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
