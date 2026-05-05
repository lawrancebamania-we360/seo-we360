import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// PATCH /api/profile/preferences — updates per-user AI model preference + future UI prefs

export const runtime = "nodejs";

const Body = z.object({
  preferred_ai_model: z.enum(["sonnet", "opus", "gpt-4o", "gpt-4o-mini"]).optional(),
});

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await request.json()); }
  catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }); }

  const { error } = await supabase.from("profiles").update(body).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
