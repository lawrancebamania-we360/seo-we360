import { requireAdmin } from "@/lib/auth/get-user";
import { getIntegrations } from "@/lib/data/integrations";
import { getGoogleConnection } from "@/lib/actions/google-onboarding";
import { PageHeader } from "@/components/dashboard/page-header";
import { IntegrationsGrid } from "@/components/sections/integrations-grid";
import { GoogleConnectCard } from "@/components/sections/google-connect-card";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const ctx = await requireAdmin();
  const oauthEnabled = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";
  const [integrations, google] = await Promise.all([
    getIntegrations(),
    oauthEnabled ? getGoogleConnection() : Promise.resolve(null),
  ]);
  return (
    <div className="flex-1 px-6 py-8 lg:px-10 space-y-6 max-w-[1400px] w-full mx-auto">
      <PageHeader
        title="Integrations"
        description="Every data source the dashboard talks to. Keys live in .env.local (or Vercel env vars) — AI keys are bring-your-own-key and never stored."
      />
      {oauthEnabled && google && (
        <GoogleConnectCard
          connected={google.connected}
          email={google.email}
          currentGa4={google.currentGa4}
          currentGsc={google.currentGsc}
          activeProjectName={ctx.activeProject?.name ?? null}
        />
      )}
      <IntegrationsGrid integrations={integrations} />
    </div>
  );
}
