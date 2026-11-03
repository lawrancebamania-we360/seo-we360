// Server-only HubSpot client (private-app token). The token never reaches the
// client bundle — only aggregate counts + timestamps derived here are passed on.

import { env, hasHubspot } from "@/lib/env";

export { hasHubspot };

export async function hubspotFetch(path: string, body?: object): Promise<Response> {
  const token = env().HUBSPOT_PRIVATE_APP_TOKEN;
  return fetch(`https://api.hubapi.com${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
}
