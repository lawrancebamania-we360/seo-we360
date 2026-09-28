// List the URLs we should sync today.
//
// Sources (deduped):
//   1. Every published_url on a task in the project
//   2. The site root (https://we360.ai/) and key landing pages
//   3. Optional override: pass --include="<url>,<url>" to add more
//
// In Phase 1 we keep this conservative — just task-linked URLs — so the
// first daily run is fast and we can verify shape correctness. In Phase
// 2 we expand to "top 500 by GSC impressions" once the basics work.
//
// Output: JSON array of URL strings.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: list-target-urls.ts <project_id> [--include=url1,url2]");
    process.exit(2);
  }
  const includeArg = process.argv.find((a) => a.startsWith("--include="));
  const include = includeArg ? includeArg.replace("--include=", "").split(",") : [];

  const { data: tasks } = await admin
    .from("tasks")
    .select("published_url, url")
    .eq("project_id", projectId);

  const urls = new Set<string>();
  for (const t of (tasks ?? []) as Array<{ published_url: string | null; url: string | null }>) {
    if (t.published_url) urls.add(normalize(t.published_url));
    if (t.url && t.url.startsWith("http")) urls.add(normalize(t.url));
  }

  // Always include the homepage and main service pages so the audit covers
  // the whole funnel, not just task-linked posts.
  urls.add("https://we360.ai/");
  urls.add("https://we360.ai/pricing");
  urls.add("https://we360.ai/contact");

  for (const u of include) if (u.trim()) urls.add(normalize(u.trim()));

  console.log(JSON.stringify([...urls].sort()));
})().catch((e) => { console.error("Crash:", e); process.exit(1); });

function normalize(url: string): string {
  try {
    const u = new URL(url);
    // Drop fragments and trailing slashes on root paths only.
    u.hash = "";
    return u.toString();
  } catch { return url; }
}
