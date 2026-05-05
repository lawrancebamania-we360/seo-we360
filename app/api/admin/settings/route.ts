import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCaller } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";

// PATCH /api/admin/settings — platform-wide toggles (trial, signup open, maintenance, internal domains)

export const runtime = "nodejs";

const Body = z.object({
  trial_enabled: z.boolean().optional(),
  trial_days: z.number().int().min(0).max(90).optional(),
  signup_open: z.boolean().optional(),
  maintenance_mode: z.boolean().optional(),
  internal_email_domains: z.array(z.string()).optional(),
});

export async function PATCH(request: NextRequest) {
  const gate = await requireAdminCaller();
  if (!gate.ok) return gate.response;

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await request.json()); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "invalid body" }, { status: 400 }); }

  const admin = createAdminClient();
  const { data: prior } = await admin.from("platform_settings").select("*").eq("id", 1).maybeSingle();

  const { error } = await admin
    .from("platform_settings")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(admin, {
    actor_id: gate.userId,
    action: "settings.update",
    target_type: "platform_settings",
    diff: { before: prior, after: body },
  });

  return NextResponse.json({ ok: true });
}
