"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function deleteKeyword(keywordId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") throw new Error("Not authorized");

  const { error } = await supabase.from("keywords").delete().eq("id", keywordId);
  if (error) throw error;
  revalidatePath("/dashboard/keywords");
}

export async function bulkDeleteKeywords(keywordIds: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("keywords").delete().in("id", keywordIds);
  if (error) throw error;
  revalidatePath("/dashboard/keywords");
}
