// Server-only HubSpot client (private-app token). The token never reaches the
// client bundle — only aggregate counts + timestamps derived here are passed on.
// Retries once on 429 (HubSpot rate limit) honoring Retry-After.

import { env, hasHubspot } from "@/lib/env";

export { hasHubspot };

export async function hubspotFetch(path: string, body?: object): Promise<Response> {
  const token = env().HUBSPOT_PRIVATE_APP_TOKEN;
  const url = `https://api.hubapi.com${path}`;
  const run = () => fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });

  let res = await run();
  if (res.status === 429) {
    const retryAfter = Math.min(Number(res.headers.get("retry-after")) || 1, 3);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    res = await run();
  }
  return res;
}
