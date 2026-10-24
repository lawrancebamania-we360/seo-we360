// Daily content-distribution sync: pull each feed-capable platform, and record
// every post (Backlink Submission + the mapped Team Target credit) via the
// shared ingest. Deduped, so running it daily only ever adds genuinely new
// posts. The login/JS platforms are pulled separately via Claude-in-Chrome into
// the same ingest. Best-effort throughout: one platform failing never stops the
// others, and nothing here can throw out of the cron.

import type { SupabaseClient } from "@supabase/supabase-js";
import { FEED_PLATFORMS } from "@/lib/content-distribution/platforms";
import { fetchPlatformPosts } from "@/lib/content-distribution/feeds";
import { ingestDetectedPost } from "@/lib/content-distribution/ingest";

const WE360_DOMAIN = "we360.ai";
const FALLBACK_PROJECT = "11111111-1111-4111-8111-000000000001";

export interface PlatformResult { platform: string; owner: string; posts: number; submissionsNew: number; creditsNew: number; ok: boolean }
export interface DistributionSummary { ran_at: string; projectId: string; platforms: PlatformResult[]; submissionsNew: number; creditsNew: number }

async function resolveProjectId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.from("projects").select("id").ilike("domain", WE360_DOMAIN).order("created_at", { ascending: true }).limit(1);
  return (data as { id: string }[] | null)?.[0]?.id ?? FALLBACK_PROJECT;
}

async function resolveOwners(admin: SupabaseClient, firstNames: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await admin.from("profiles").select("id, name").neq("role", "client");
  for (const p of (data as { id: string; name: string }[] | null) ?? []) {
    const first = p.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (first && firstNames.some((f) => f.toLowerCase() === first) && !map.has(first)) map.set(first, p.id);
  }
  return map;
}

export async function runContentDistributionSync(admin: SupabaseClient, now: Date = new Date()): Promise<DistributionSummary> {
  const projectId = await resolveProjectId(admin);
  const owners = await resolveOwners(admin, [...new Set(FEED_PLATFORMS.map((p) => p.ownerFirstName))]);

  const results: PlatformResult[] = [];
  for (const platform of FEED_PLATFORMS) {
    const ownerId = owners.get(platform.ownerFirstName.toLowerCase()) ?? null;
    let subs = 0, credits = 0, ok = true;
    try {
      const posts = await fetchPlatformPosts(platform);
      for (const post of posts) {
        const r = await ingestDetectedPost(admin, {
          projectId, websiteDomain: platform.websiteDomain, ownerId, target: platform.target,
          url: post.url, title: post.title, publishedDate: post.publishedDate, now,
        });
        if (r.submissionNew) subs++;
        if (r.creditNew) credits++;
      }
      results.push({ platform: platform.label, owner: platform.ownerFirstName, posts: posts.length, submissionsNew: subs, creditsNew: credits, ok: posts.length > 0 || true });
    } catch {
      ok = false;
      results.push({ platform: platform.label, owner: platform.ownerFirstName, posts: 0, submissionsNew: subs, creditsNew: credits, ok });
    }
  }

  return {
    ran_at: now.toISOString(), projectId, platforms: results,
    submissionsNew: results.reduce((a, r) => a + r.submissionsNew, 0),
    creditsNew: results.reduce((a, r) => a + r.creditsNew, 0),
  };
}
