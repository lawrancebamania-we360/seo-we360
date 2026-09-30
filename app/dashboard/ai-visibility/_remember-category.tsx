"use client";

import { useEffect } from "react";

// Tiny client component mounted on each category page: remembers which one was
// last viewed (plain cookie, not httpOnly - purely a UX convenience, nothing
// sensitive) so the bare /dashboard/ai-visibility redirects back to it instead of
// always defaulting to Employee Monitoring.
// Ticket 3: widened from the 2-value union to any string now that a category
// can be a self-serve key, not just the 2 legacy ones.
export function RememberCategory({ category }: { category: string }) {
  useEffect(() => {
    document.cookie = `we360.last_ai_visibility_category=${category}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [category]);
  return null;
}
