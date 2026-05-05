import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTopicCluster } from "@/lib/seo-skills/topic-cluster";
import { verifyProjectAccess } from "@/lib/auth/verify-access";

// BYOK topic-cluster generator.
// POST: { provider, apiKey, seedKeyword, projectId }
// - Admin-only (super_admin / admin)
// - Pulls up to 40 of the project's existing articles for coverage analysis
// - Calls the BYOK microservice with the user's Claude/OpenAI key
// - Persists cluster + one row per spoke
// - Returns { cluster_id, plan } — the full saved plan for immediate UI render

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  provider: z.enum(["claude", "openai"]),
  apiKey: z.string().min(10),
  seedKeyword: z.string().min(2).max(200),
  projectId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify caller belongs to the target project's org
  const access = await verifyProjectAccess(admin, user.id, body.projectId, { minRole: "admin" });
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code });

  const { data: project } = await admin
    .from("projects").select("id, name, domain, industry").eq("id", body.projectId).single();
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  // Build the "what already exists" list from TWO sources:
  //   1. articles — blogs produced through the article writer
  //   2. seo_gaps — blog URLs crawled from the live sitemap (written outside the app)
  // Dedupe by URL so pre-existing blogs don't get double-counted against
  // app-authored articles on the same slug.
  const [articleRowsResp, crawledBlogsResp] = await Promise.all([
    admin
      .from("articles")
      .select("title, published_url, slug, target_keyword")
      .eq("project_id", body.projectId)
      .limit(40),
    admin
      .from("seo_gaps")
      .select("page_url, page_title, h1_text")
      .eq("project_id", body.projectId)
      .eq("is_blog", true)
      .order("last_seen_at", { ascending: false })
      .limit(80),
  ]);

  type ArticleRow = { title: string; published_url: string | null; slug: string | null; target_keyword: string | null };
  type CrawledBlog = { page_url: string; page_title: string | null; h1_text: string | null };

  const seen = new Set<string>();
  const existingArticles: Array<{ title: string; url: string; target_keyword?: string | null }> = [];

  for (const a of (articleRowsResp.data ?? []) as ArticleRow[]) {
    const url = a.published_url ??
      (a.slug ? `https://${project.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/${a.slug}` : "");
    const key = url.toLowerCase();
    if (!url || seen.has(key)) continue;
    seen.add(key);
    existingArticles.push({ title: a.title, url, target_keyword: a.target_keyword });
  }
  for (const b of (crawledBlogsResp.data ?? []) as CrawledBlog[]) {
    const key = b.page_url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const title = b.page_title || b.h1_text;
    if (!title) continue;
    existingArticles.push({ title, url: b.page_url });
  }

  let plan;
  try {
    plan = await buildTopicCluster({
      seedKeyword: body.seedKeyword,
      industry: project.industry,
      projectName: project.name,
      projectDomain: project.domain,
      existingArticles,
      provider: body.provider,
      apiKey: body.apiKey,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "cluster generation failed" },
      { status: 502 }
    );
  }

  // Persist the cluster + spokes. One round-trip for each — cluster first so we
  // have the id for the items, then a single batch insert for spokes.
  const { data: inserted, error: clusterErr } = await admin
    .from("topic_clusters")
    .insert({
      project_id: body.projectId,
      seed_keyword: plan.seed_keyword,
      pillar_title: plan.pillar.title,
      pillar_slug: plan.pillar.slug_suggestion || null,
      pillar_primary_keyword: plan.pillar.primary_keyword,
      pillar_outline: plan.pillar.h2_outline,
      pillar_word_target: plan.pillar.word_count_target,
      pillar_summary: plan.pillar.summary || null,
      interlinking: plan.interlinking,
      roadmap: plan.roadmap,
      coverage_total: plan.coverage.total_spokes,
      coverage_new: plan.coverage.new_content,
      coverage_already_covered: plan.coverage.already_covered,
      coverage_pct: plan.coverage.coverage_pct,
      provider: body.provider,
      generated_by: user.id,
      cost_estimate_usd: plan.cost_estimate_usd,
    })
    .select()
    .single();

  if (clusterErr || !inserted) {
    return NextResponse.json(
      { error: clusterErr?.message ?? "failed to persist cluster" },
      { status: 500 }
    );
  }

  const clusterId = (inserted as { id: string }).id;

  // Order spokes by roadmap position; spokes not in the roadmap fall to the end
  const roadmapIdx = new Map<string, number>(
    plan.roadmap.map((r, i) => [r.spoke_title, r.order || i + 1])
  );
  const orderedSpokes = [...plan.spokes].sort((a, b) => {
    const ai = roadmapIdx.get(a.title) ?? 999;
    const bi = roadmapIdx.get(b.title) ?? 999;
    return ai - bi;
  });

  const itemRows = orderedSpokes.map((s, i) => ({
    cluster_id: clusterId,
    project_id: body.projectId,
    position: i + 1,
    title: s.title,
    target_keyword: s.target_keyword || null,
    intent: s.intent,
    kd_estimate: s.kd_estimate,
    word_count_target: s.word_count_target,
    outline: s.outline,
    reason: s.reason || null,
    already_covered_by: s.already_covered_by ?? null,
  }));

  if (itemRows.length > 0) {
    const { error: itemsErr } = await admin.from("topic_cluster_items").insert(itemRows);
    if (itemsErr) {
      // Roll back the cluster so we don't leave orphan rows
      await admin.from("topic_clusters").delete().eq("id", clusterId);
      return NextResponse.json(
        { error: `failed to persist spokes: ${itemsErr.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, cluster_id: clusterId, plan });
}
