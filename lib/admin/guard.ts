import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Guard for /api/admin/* routes. Re-verifies platform_admin server-side so
// requests that skip the /admin layout (e.g. a curl bypass) still get rejected.

export interface AdminCallerOk {
  ok: true;
  userId: string;
}
export interface AdminCallerErr {
  ok: false;
  response: NextResponse;
}

export async function requireAdminCaller(): Promise<AdminCallerOk | AdminCallerErr> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles").select("platform_admin").eq("id", user.id).maybeSingle();
  if (!(profile as { platform_admin?: boolean } | null)?.platform_admin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}
