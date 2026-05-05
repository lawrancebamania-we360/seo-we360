"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Fixed dev-only password used to round-trip through Supabase password auth.
// We set it on every dev-login so we don't need to remember it.
const DEV_PASSWORD = "dev-login-only-not-for-prod-a8fQ1zX";
const ALLOWED_DOMAIN = "we360.ai";

export type DevLoginResult = { ok: true } | { ok: false; error: string };

export async function devLoginAction(formData: FormData): Promise<DevLoginResult> {
  if (process.env.NODE_ENV !== "development") {
    return { ok: false, error: "Dev login is disabled outside development." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || email.split("@")[0];
  const role = String(formData.get("role") ?? "member") as "member" | "admin" | "super_admin";
  const platformAdmin = formData.get("platform_admin") === "on";

  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    return { ok: false, error: `Only @${ALLOWED_DOMAIN} emails are allowed.` };
  }

  const admin = createAdminClient();

  // Find existing user by email (admin.listUsers is paginated; first 1000 is plenty for dev).
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) return { ok: false, error: listErr.message };
  let userId = list.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;

  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { name, full_name: name },
    });
    if (createErr || !created.user) {
      return { ok: false, error: createErr?.message ?? "Could not create user." };
    }
    userId = created.user.id;
  } else {
    // Reset password so we can always round-trip sign-in for known dev users.
    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password: DEV_PASSWORD,
      email_confirm: true,
    });
    if (updateErr) return { ok: false, error: updateErr.message };
  }

  // Make sure the profile exists (trigger should handle it, but race-safe upsert).
  const { error: upsertErr } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        email,
        name,
        role,
        platform_admin: platformAdmin,
      },
      { onConflict: "id" }
    );
  if (upsertErr) {
    return {
      ok: false,
      error: `profiles upsert failed: ${upsertErr.message}. Run the latest migrations against your Supabase project (the "platform_admin" column needs to exist).`,
    };
  }

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });
  if (signInErr) return { ok: false, error: signInErr.message };

  redirect("/dashboard/overview");
}
