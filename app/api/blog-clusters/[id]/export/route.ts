import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user";
import { getBlogClusterDetail } from "@/lib/data/blog-clusters";
import { buildXlsx } from "@/lib/xlsx/workbook";
import { DETAIL_COLUMNS, detailRow } from "@/lib/blog-clusters/export-rows";

// One cluster's posts as a single-sheet .xlsx, in the detailed (paste-import)
// column layout - the per-cluster download from the cluster detail page.

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ctx = await getUserContext();
  if (!ctx.activeProject) return NextResponse.json({ error: "no active project" }, { status: 400 });

  const cluster = await getBlogClusterDetail(ctx.activeProject.id, id);
  if (!cluster) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buf = buildXlsx([{
    name: cluster.clusterName,
    columns: DETAIL_COLUMNS,
    rows: cluster.items.map((it) => detailRow(cluster.clusterName, it)),
  }]);
  const safe = cluster.clusterName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "cluster";
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${safe}-keywords.xlsx"`,
      "cache-control": "no-store, max-age=0",
    },
  });
}
