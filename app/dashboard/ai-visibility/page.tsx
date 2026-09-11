import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// AI Visibility split into 2 independent category pages (employee-monitoring/,
// workforce-analytics/) - each its own nav entry, report, and score. This bare
// route keeps old bookmarks/links alive by redirecting to whichever the user
// last viewed (we360.last_ai_visibility_category, set by _remember-category.tsx),
// falling back to Employee Monitoring for a first-ever visit.
export default async function AiVisibilityRedirectPage() {
  const cookieStore = await cookies();
  const last = cookieStore.get("we360.last_ai_visibility_category")?.value;
  redirect(last === "workforce_analytics" ? "/dashboard/ai-visibility/workforce-analytics" : "/dashboard/ai-visibility/employee-monitoring");
}
