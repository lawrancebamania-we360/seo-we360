import { createClient } from "@/lib/supabase/server";
import type { CwvSnapshot, Device } from "@/lib/types/database";

export async function getLatestCwv(projectId: string): Promise<Record<Device, CwvSnapshot | null>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cwv_snapshots")
    .select("*")
    .eq("project_id", projectId)
    .order("captured_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as CwvSnapshot[];
  return {
    mobile: rows.find((r) => r.device === "mobile") ?? null,
    desktop: rows.find((r) => r.device === "desktop") ?? null,
  };
}

export async function getCwvHistory(projectId: string, device: Device, days = 30): Promise<CwvSnapshot[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("cwv_snapshots")
    .select("*")
    .eq("project_id", projectId)
    .eq("device", device)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true });
  return (data ?? []) as CwvSnapshot[];
}
