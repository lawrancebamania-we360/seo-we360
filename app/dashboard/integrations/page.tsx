import { requireAdmin } from "@/lib/auth/get-user";
import { getIntegrations } from "@/lib/data/integrations";
import { PageHeader } from "@/components/dashboard/page-header";
import { IntegrationsGrid } from "@/components/sections/integrations-grid";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  await requireAdmin();
  const integrations = await getIntegrations();
  return (
    <div className="flex-1 px-6 py-8 lg:px-10 space-y-6 max-w-[1400px] w-full mx-auto">
      <PageHeader
        title="Integrations"
        description="Every data source the dashboard talks to. Keys live in .env.local (or Vercel env vars) — AI keys are bring-your-own-key and never stored."
      />
      <IntegrationsGrid integrations={integrations} />
    </div>
  );
}
