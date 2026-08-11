// Lists the GA4 properties + GSC sites the connected Google account can access,
// so the Integrations UI can offer a dropdown instead of asking for raw IDs.
// Uses whatever credential lib/google/auth.ts resolves (OAuth preferred).

import { getGoogleAccessToken } from "./auth";

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export interface Ga4PropertyOption {
  propertyId: string; // numeric id, e.g. "273620287"
  displayName: string;
  account: string;
}

export interface GscSiteOption {
  siteUrl: string; // "sc-domain:we360.ai" or "https://we360.ai/"
  permissionLevel: string;
}

// Shared shapes returned by the onboarding actions (kept here so the client card
// can import the types without pulling in the "use server" module).
export interface AvailableProperties {
  ga4: Ga4PropertyOption[];
  gsc: GscSiteOption[];
  error: string | null;
}

export interface GoogleConnectionState {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  currentGa4: string | null;
  currentGsc: string | null;
}

/** GA4 Admin API: accountSummaries.list → every property the account can see. */
export async function listGa4Properties(): Promise<Ga4PropertyOption[]> {
  const token = await getGoogleAccessToken(GA4_SCOPE);
  const res = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`GA4 accountSummaries ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    accountSummaries?: Array<{
      displayName?: string;
      propertySummaries?: Array<{ property?: string; displayName?: string }>;
    }>;
  };
  const out: Ga4PropertyOption[] = [];
  for (const acct of data.accountSummaries ?? []) {
    for (const p of acct.propertySummaries ?? []) {
      const id = (p.property ?? "").replace("properties/", "");
      if (id) out.push({ propertyId: id, displayName: p.displayName ?? id, account: acct.displayName ?? "" });
    }
  }
  return out;
}

/** Search Console API: sites.list → every verified site the account can see. */
export async function listGscSites(): Promise<GscSiteOption[]> {
  const token = await getGoogleAccessToken(GSC_SCOPE);
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GSC sites ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> };
  return (data.siteEntry ?? [])
    .filter((s) => s.siteUrl)
    .map((s) => ({ siteUrl: s.siteUrl!, permissionLevel: s.permissionLevel ?? "" }));
}
