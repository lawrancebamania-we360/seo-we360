import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user";
import { getBlogClusterDetail } from "@/lib/data/blog-clusters";
import { getClusterGscData } from "@/lib/data/cluster-gsc-queries";
import { buildXlsx } from "@/lib/xlsx/workbook";
import { DIAGNOSIS_LABEL, QUERY_ACTION_LABEL, USE_OPTION_LABEL } from "@/lib/types/cluster-gsc";

// GC-4: download every GSC query of one cluster (tab 1) plus the new-post
// suggestions (tab 2) as an .xlsx.

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ctx = await getUserContext();
  if (!ctx.activeProject) return NextResponse.json({ error: "no active project" }, { status: 400 });

  const [cluster, gsc] = await Promise.all([
    getBlogClusterDetail(ctx.activeProject.id, id),
    getClusterGscData(ctx.activeProject.id, id),
  ]);
  if (!cluster) return NextResponse.json({ error: "not found" }, { status: 404 });

  const titleById = new Map(cluster.items.map((i) => [i.id, i.title]));
  const queryRows = gsc.queries.map((q) => {
    const d = q.drafts;
    const pageTitle = q.rankingPageInfo ? (q.rankingPageInfo.liveTitle ?? q.rankingPageInfo.title) : null;
    return [
      q.query, q.impressions, q.clicks, Math.round(q.ctr * 1000) / 10, q.position,
      DIAGNOSIS_LABEL[q.diagnosis],
      q.gain ? q.gain.clicks : null,
      q.gain ? (q.gain.basis === "now" ? "Better click rate at current rank" : "If it reaches #5") : null,
      q.rankingPage, pageTitle, q.rankingPagePosition, q.matchedKeyword,
      QUERY_ACTION_LABEL[q.action],
      q.action === "assign" && q.itemId ? (titleById.get(q.itemId) ?? null) : q.action === "hub" ? "Hub page" : q.action === "update_existing" ? (pageTitle ?? q.rankingPage) : null,
      q.usages.map((u) => USE_OPTION_LABEL[u]).join("; ") || null,
      d?.title ?? null, d?.title ? d.title.length : null,
      d?.meta ?? null, d?.meta ? d.meta.length : null,
      d?.titleKeepsPrimary === false ? "No - check" : d?.titleKeepsPrimary ? "Yes" : null,
      d?.h2 ?? null, d?.faqQuestion ?? null, d?.faqAnswer ?? null, d?.paragraph ?? null, d?.template ?? null,
      d?.alreadyOnPage ?? null, d?.whyTheyRank ?? null,
      q.targetUrl, q.targetScan?.ok ? q.targetScan.title : null, q.targetScan?.ok ? q.targetScan.meta : null,
      q.targetScan?.ok ? q.targetScan.wordCount : null,
      q.serp ? (q.serp.ourPosition ?? "Not in top 10") : null,
      ...[0, 1, 2].flatMap((i) => {
        const r = q.serp?.top[i];
        return [r ? `${r.title} - ${r.url}` : null, r?.description ?? null];
      }),
      q.serp?.paa.join("; ") || null,
      q.anchors.join("; ") || null,
      q.status, q.assignedBy, q.reason,
    ];
  });
  const newPostRows = gsc.queries.filter((q) => q.action === "new_post").map((q) => [
    q.query, q.impressions, q.clicks, q.position, q.rankingPage, q.status, q.reason,
  ]);

  const buf = buildXlsx([
    {
      name: "GSC Queries",
      columns: ["Query", "Impressions (90d)", "Clicks", "CTR %", "Avg position", "What's wrong",
        "Est. extra clicks (90d)", "Estimate basis", "Ranking page", "Ranking page title", "Ranking page position",
        "Matched keyword", "Action", "Target", "How to use",
        "Draft SEO title", "Title chars (max 60)", "Draft meta description", "Meta chars (max 120)",
        "Title keeps main keyword", "Draft H2", "FAQ question", "FAQ answer", "Paragraph", "Template / tool",
        "Already on the page", "Why the top 3 rank",
        "Page the changes go on", "Our page title now", "Our meta description now", "Our page words",
        "Our position (US mobile)", "Google #1 (title - URL)", "Google #1 meta", "Google #2 (title - URL)", "Google #2 meta",
        "Google #3 (title - URL)", "Google #3 meta", "People also ask",
        "Anchor variants", "Status", "Assigned by", "Reason"],
      rows: queryRows,
    },
    {
      name: "New page suggestions",
      columns: ["Query", "Impressions (90d)", "Clicks", "Avg position", "Ranking page", "Status", "Reason"],
      rows: newPostRows,
    },
  ]);
  const safe = cluster.clusterName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "cluster";
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${safe}-gsc-queries.xlsx"`,
      "cache-control": "no-store, max-age=0",
    },
  });
}
