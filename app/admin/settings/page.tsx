import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsEditor } from "@/components/admin/settings-editor";

export const metadata = { title: "Platform settings · Admin" };

export default async function SettingsPage() {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_settings").select("*").eq("id", 1).maybeSingle();

  type Settings = {
    id: number;
    trial_enabled: boolean;
    trial_days: number;
    signup_open: boolean;
    maintenance_mode: boolean;
    internal_email_domains: string[];
    updated_at: string;
  };
  const settings = (data as Settings) ?? {
    id: 1, trial_enabled: true, trial_days: 15, signup_open: true,
    maintenance_mode: false, internal_email_domains: ["we360.ai"], updated_at: new Date().toISOString(),
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform settings</h1>
        <p className="text-sm text-muted-foreground">
          Changes take effect on the next signup or page load. No deploy required.
        </p>
      </div>
      <SettingsEditor settings={settings} />
    </div>
  );
}
