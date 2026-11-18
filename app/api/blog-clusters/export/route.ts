import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user";
import { getClustersForExport } from "@/lib/data/blog-clusters";
import { buildXlsx, type Sheet } from "@/lib/xlsx/workbook";
import { DETAIL_COLUMNS, OVERVIEW_COLUMNS, detailRow, overviewRow } from "@/lib/blog-clusters/export-rows";

// The whole project's Blog Clusters as one .xlsx: tab 1 "All" is a per-post
// overview across every cluster; then one detailed tab per cluster whose columns
// mirror the paste-import schema (so a tab re-pastes cleanly). Read with the
// signed-in client, so RLS scopes it to clusters the person can see.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ctx = await getUserContext();
  if (!ctx.activeProject) return NextResponse.json({ error: "no active project" }, { status: 400 });

  const clusters = await getClustersForExport(ctx.activeProject.id);
  const sheets: Sheet[] = [
    {
      name: "All",
      columns: OVERVIEW_COLUMNS,
      rows: clusters.flatMap((c) => c.items.map((it) => overviewRow(c.name, it))),
    },
    ...clusters.map((c) => ({
      name: c.name,
      columns: DETAIL_COLUMNS,
      rows: c.items.map((it) => detailRow(c.name, it)),
    })),
  ];

  const buf = buildXlsx(sheets);
  const dateStr = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="blog-clusters-${dateStr}.xlsx"`,
      "cache-control": "no-store, max-age=0",
    },
  });
}
