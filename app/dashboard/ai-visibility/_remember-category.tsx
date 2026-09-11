"use client";

import { useEffect } from "react";

// Tiny client component mounted on each category page: remembers which one was
// last viewed (plain cookie, not httpOnly - purely a UX convenience, nothing
// sensitive) so the bare /dashboard/ai-visibility redirects back to it instead of
// always defaulting to Employee Monitoring.
export function RememberCategory({ category }: { category: "employee_monitoring" | "workforce_analytics" }) {
  useEffect(() => {
    document.cookie = `we360.last_ai_visibility_category=${category}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [category]);
  return null;
}
