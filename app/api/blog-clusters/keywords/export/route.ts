import { NextResponse } from "next/server";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user";

// One CSV of every planned keyword across the active project's Blog Clusters -
// the primary keyword (target_keyword + its volume) and every secondary /
// supporting keyword, flattened into ONE sheet with a Type column so the whole
// keyword set is in one place. Read with the signed-in client, so RLS
// (has_project_access) scopes it to clusters the person can see.

export const runtime = "nodejs";
export const maxDuration = 30;

const COLUMNS = ["Cluster", "Post Title", "Type", "Keyword", "Volume"] as const;

interface ItemRow {
  title: string;
  target_keyword: string | null;
  vol_mo: number | null;
  supporting_keywords: { keyword: string; volume: number | null }[] | null;
  topic_clusters: { cluster_name: string } | null;
}

function csvResponse(data: (string | number)[][]): NextResponse {
  const csv = Papa.unparse({ fields: [...COLUMNS], data });
  const dateStr = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="blog-cluster-keywords-${dateStr}.csv"`,
      "cache-control": "no-store, max-age=0",
    },
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ctx = await getUserContext();
  if (!ctx.activeProject) return csvResponse([]);

  const { data, error } = await supabase
    .from("topic_cluster_items")
    .select("title, target_keyword, vol_mo, supporting_keywords, cluster_id, position, topic_clusters ( cluster_name )")
    .eq("project_id", ctx.activeProject.id)
    .order("cluster_id", { ascending: true })
    .order("position", { ascending: true });
  if (error) return csvResponse([]);

  const items = (data ?? []) as unknown as ItemRow[];
  const rows: (string | number)[][] = [];
  for (const it of items) {
    const cluster = it.topic_clusters?.cluster_name ?? "";
    const title = it.title ?? "";
    // Primary keyword first, then every secondary - all in the one sheet.
    if (it.target_keyword?.trim()) rows.push([cluster, title, "Primary", it.target_keyword.trim(), it.vol_mo ?? ""]);
    for (const sk of it.supporting_keywords ?? []) {
      if (sk?.keyword?.trim()) rows.push([cluster, title, "Secondary", sk.keyword.trim(), sk.volume ?? ""]);
    }
  }
  return csvResponse(rows);
}
