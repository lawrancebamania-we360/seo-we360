import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// AI Visibility splits into independent category pages (2 legacy static
// routes, plus any self-serve category via the [categoryKey] dynamic route -
// Ticket 3) - each its own nav entry, report, and score. This bare route
// keeps old bookmarks/links alive by redirecting to whichever the user last
// viewed (we360.last_ai_visibility_category, set by _remember-category.tsx),
// falling back to Employee Monitoring for a first-ever visit. An unrecognized
// or stale cookie value just falls through to the dynamic route, which
// 404s on its own if that category no longer exists - no worse than today.
export default async function AiVisibilityRedirectPage() {
  const cookieStore = await cookies();
  const last = cookieStore.get("we360.last_ai_visibility_category")?.value;
  if (last === "workforce_analytics") redirect("/dashboard/ai-visibility/workforce-analytics");
  if (!last || last === "employee_monitoring") redirect("/dashboard/ai-visibility/employee-monitoring");
  redirect(`/dashboard/ai-visibility/${encodeURIComponent(last)}`);
}
