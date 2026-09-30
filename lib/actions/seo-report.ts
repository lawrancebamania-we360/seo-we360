"use server";

import { revalidatePath } from "next/cache";

// Manual refresh for /dashboard/reports. The live-URL reachability check and
// sitemap fetch inside getSeoReport() are cached for an hour (next.revalidate)
// so normal page loads don't re-hammer we360.ai - this busts that cache on
// demand so a click reflects the site's current state instead of waiting.
export async function refreshSeoReport() {
  revalidatePath("/dashboard/reports");
}
