import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminCaller } from "@/lib/admin/guard";
import { logAudit } from "@/lib/admin/audit";

// POST /api/admin/users/[id]/platform-admin — toggle platform_admin flag

export const runtime = "nodejs";

const Body = z.object({ platform_admin: z.boolean() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminCaller();
  if (!gate.ok) return gate.response;

  const { id: targetId } = await params;
  // You can't remove your own platform_admin flag (prevents lockout).
  if (targetId === gate.userId) {
    return NextResponse.json({ error: "Can't change your own platform_admin flag. Ask another admin." }, { status: 400 });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await request.json()); }
  catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }); }

  const admin = createAdminClient();
  const { data: prior } = await admin.from("profiles").select("email, platform_admin").eq("id", targetId).maybeSingle();
  if (!prior) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const { error } = await admin.from("profiles").update({ platform_admin: body.platform_admin }).eq("id", targetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(admin, {
    actor_id: gate.userId,
    action: body.platform_admin ? "user.grant_platform_admin" : "user.revoke_platform_admin",
    target_type: "user",
    target_id: targetId,
    diff: { email: (prior as { email: string }).email, before: (prior as { platform_admin: boolean }).platform_admin, after: body.platform_admin },
  });

  return NextResponse.json({ ok: true });
}
