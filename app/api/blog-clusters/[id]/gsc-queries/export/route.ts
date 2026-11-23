import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user";
import { getBlogClusterDetail } from "@/lib/data/blog-clusters";
import { getClusterGscData } from "@/lib/data/cluster-gsc-queries";
import { buildXlsx } from "@/lib/xlsx/workbook";
import { QUERY_ACTION_LABEL, QUERY_USAGE_LABEL } from "@/lib/types/cluster-gsc";

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
  const queryRows = gsc.queries.map((q) => [
    q.query, q.impressions, q.clicks, Math.round(q.ctr * 1000) / 10, q.position,
    q.rankingPage, q.rankingPagePosition, q.matchedKeyword,
    QUERY_ACTION_LABEL[q.action],
    q.action === "assign" && q.itemId ? (titleById.get(q.itemId) ?? null) : q.action === "hub" ? "Hub page" : q.action === "update_existing" ? q.rankingPage : null,
    q.usage ? QUERY_USAGE_LABEL[q.usage] : null,
    q.anchors.join("; ") || null,
    q.status, q.assignedBy, q.reason,
  ]);
  const newPostRows = gsc.queries.filter((q) => q.action === "new_post").map((q) => [
    q.query, q.impressions, q.clicks, q.position, q.rankingPage, q.status, q.reason,
  ]);

  const buf = buildXlsx([
    {
      name: "GSC Queries",
      columns: ["Query", "Impressions (90d)", "Clicks", "CTR %", "Avg position", "Ranking page", "Ranking page position",
        "Matched keyword", "Action", "Target", "Use as", "Anchor variants", "Status", "Assigned by", "Reason"],
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
