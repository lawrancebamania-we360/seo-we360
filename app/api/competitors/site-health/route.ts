import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProjectSectionPermissions } from "@/lib/auth/section-permissions";
import { getPagespeedKey } from "@/lib/integrations/secrets";
import { fetchPageSpeedMobile } from "@/lib/data/competitor-site-health";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/security/rate-limit";

// On-demand competitor site-health refresh. Runs a mobile PageSpeed Insights
// pass against each rival's homepage and upserts the latest Core Web Vitals into
// competitor_site_health. User-triggered (from the Competitors page) so PSI
// spend is under the team's control, never on every page load.
//
// PSI calls are ~25s each and run in PARALLEL, so the wall-clock is one slow
// call, comfortably inside the 60s Hobby ceiling. Capped to a handful of rivals.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_COMPETITORS = 6;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let projectId = "";
  try {
    projectId = ((await request.json()) as { projectId?: string })?.projectId ?? "";
  } catch {
    /* empty / non-JSON body → handled below */
  }
  if (!projectId) return NextResponse.json({ error: "Missing project." }, { status: 400 });

  // Expensive (up to 6 parallel ~25s PageSpeed calls) — cap per user, then per IP.
  if (!(await rateLimit(`comp-site-health:user:${user.id}`, 6, 60))) return tooManyRequests(60);
  if (!(await rateLimit(`comp-site-health:ip:${clientIp(request.headers)}`, 12, 60))) return tooManyRequests(60);

  const perms = await getProjectSectionPermissions(projectId);
  if (!perms.competitors?.edit) {
    return NextResponse.json({ error: "Your role can't manage competitors. Ask a workspace admin." }, { status: 403 });
  }

  // DB-first (UI-saved per-project or org-wide), env-fallback. See lib/integrations/secrets.ts.
  const apiKey = await getPagespeedKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Add a PageSpeed API key in Settings → Integrations to check competitor site health." },
      { status: 400 },
    );
  }

  const { data } = await supabase.from("competitors").select("id, url").eq("project_id", projectId).limit(MAX_COMPETITORS);
  const comps = ((data ?? []) as Array<{ id: string; url: string }>)
    .map((c) => ({ id: c.id, url: normalizeUrl(c.url) }))
    .filter((c) => /^https?:\/\//i.test(c.url));
  if (comps.length === 0) return NextResponse.json({ error: "No competitors with a valid URL to check." }, { status: 400 });

  const now = new Date().toISOString();
  let checked = 0;
  let failed = 0;
  await Promise.all(
    comps.map(async (c) => {
      const m = await fetchPageSpeedMobile(c.url, apiKey);
      if (!m || m.score == null) {
        failed++;
        return;
      }
      const { error } = await supabase.from("competitor_site_health").upsert(
        {
          project_id: projectId,
          competitor_id: c.id,
          url: c.url,
          device: "mobile",
          score: m.score,
          lcp: m.lcp,
          cls: m.cls,
          inp: m.inp,
          ttfb: m.ttfb,
          fcp: m.fcp,
          fetched_at: now,
        } as never,
        { onConflict: "competitor_id,device" },
      );
      if (error) failed++;
      else checked++;
    }),
  );

  return NextResponse.json({
    ok: checked > 0,
    checked,
    failed,
    ...(checked === 0 ? { error: "PageSpeed returned no result. Try again in a moment." } : {}),
  });
}

function normalizeUrl(u: string): string {
  const s = (u ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
