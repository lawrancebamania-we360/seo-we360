import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GDPR Article 17 (right to erasure).
// Permanently deletes the signed-in user's account.
// - auth.users row deleted via admin client -> cascades to profiles, memberships, etc.
// - Content FKs set to null where ON DELETE SET NULL is configured (tasks.created_by,
//   articles.created_by, wins.created_by) so the project's shared data isn't destroyed
//   when one team member leaves.
//
// Safety: requires the caller to re-type their email in the request body as a
// confirmation signal so a CSRF or accidental double-click can't nuke an account.

export const runtime = "nodejs";
export const maxDuration = 20;

const Body = z.object({
  confirm_email: z.string().email(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await request.json()); }
  catch { return NextResponse.json({ error: "invalid body — email required" }, { status: 400 }); }

  if (body.confirm_email.trim().toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "Email doesn't match your account" }, { status: 400 });
  }

  // Guard: super_admin is the account owner — don't let the last super_admin delete
  // themselves from a workspace that still has active projects. They should transfer
  // ownership first.
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role?: string } | null)?.role === "super_admin") {
    const admin = createAdminClient();
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "You're the only super admin. Promote another teammate first, then delete your account." },
        { status: 409 }
      );
    }
  }

  const admin = createAdminClient();
  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  // Belt-and-braces: explicitly delete the profile row in case cascade isn't wired.
  await admin.from("profiles").delete().eq("id", user.id);

  return NextResponse.json({ ok: true });
}
