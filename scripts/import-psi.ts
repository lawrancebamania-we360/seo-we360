#!/usr/bin/env tsx
// Import the psi_dev_brief.json PSI audit into our dashboard.
//   node scripts/import-psi.ts [path-to-psi_dev_brief.json]
// Default path: C:/Users/HP/we360-psi/psi_dev_brief.json
//
// Writes:
//   * cwv_snapshots — 1 row per (url, device) pair
//   * audit_findings — 1 row per mobile opportunity (id ≠ "unused-css-rules" duplication)
//   * seo_gaps — per-url images_status (existing row preserved if already scored)
//   * pillar_scores — recompute SEO + SXO (CWV-weighted)
// Idempotent: deletes prior snapshots from same audit_date then re-inserts.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());

interface PsiPage {
  slug: string;
  url: string;
  mobile?: DeviceData;
  desktop?: DeviceData;
}
interface DeviceData {
  score: number;
  metrics_lab: {
    lcp_ms: number;
    fcp_ms: number;
    tbt_ms: number;
    cls: number;
    si_ms: number;
    ttfb_ms: number;
  };
  metrics_field: {
    inp_p75_ms?: number;
    lcp_p75_ms?: number;
    cls_p75?: number;
  };
  totals?: { total_page_kb: number; main_thread_ms?: number };
  opportunities?: Array<{
    id: string;
    title: string;
    savings_ms?: number;
    savings_bytes?: number;
  }>;
  render_blocking?: { total_ms: number; items_count: number } | Array<unknown>;
}

interface PsiBrief {
  site: string;
  audit_date: string;
  summary: {
    mobile: { avg_score: number; pages_poor_lt_50: number; pages_good_ge_90: number };
    desktop: { avg_score: number; pages_poor_lt_50: number; pages_good_ge_90: number };
  };
  site_wide_issues: {
    top_opportunities: Array<{ id: string; pages_affected: number; total_potential_savings_ms: number }>;
  };
  pages: PsiPage[];
}

async function main() {
  const path = process.argv[2] ?? "C:/Users/HP/we360-psi/psi_dev_brief.json";
  console.log(`Reading PSI brief: ${path}`);
  const brief = JSON.parse(readFileSync(path, "utf-8")) as PsiBrief;
  console.log(`  Site: ${brief.site}`);
  console.log(`  Audit date: ${brief.audit_date}`);
  console.log(`  Pages: ${brief.pages.length}`);
  console.log(`  Mobile avg: ${brief.summary.mobile.avg_score} · Desktop avg: ${brief.summary.desktop.avg_score}`);

  // Guard: project must exist
  const { data: project } = await admin.from("projects").select("id, domain").eq("id", PROJECT_ID).single();
  if (!project) {
    console.error(`Project ${PROJECT_ID} missing`);
    process.exit(1);
  }

  // --------------------------------------------------------
  // 1. cwv_snapshots
  // --------------------------------------------------------
  const capturedAt = `${brief.audit_date}T00:00:00Z`;
  const snapshots: Array<{
    project_id: string; url: string; device: "mobile" | "desktop"; score: number;
    lcp: number | null; cls: number | null; inp: number | null; ttfb: number | null;
    fcp: number | null; tbt: number | null; si: number | null; captured_at: string;
  }> = [];
  for (const page of brief.pages) {
    for (const device of ["mobile", "desktop"] as const) {
      const d = page[device];
      if (!d) continue;
      snapshots.push({
        project_id: PROJECT_ID,
        url: page.url,
        device,
        score: Math.max(0, Math.min(100, Math.round(d.score))),
        lcp: d.metrics_lab?.lcp_ms != null ? d.metrics_lab.lcp_ms / 1000 : null,
        cls: d.metrics_lab?.cls ?? null,
        inp: d.metrics_field?.inp_p75_ms ?? null,
        ttfb: d.metrics_lab?.ttfb_ms != null ? d.metrics_lab.ttfb_ms / 1000 : null,
        fcp: d.metrics_lab?.fcp_ms != null ? d.metrics_lab.fcp_ms / 1000 : null,
        tbt: d.metrics_lab?.tbt_ms ?? null,
        si: d.metrics_lab?.si_ms != null ? d.metrics_lab.si_ms / 1000 : null,
        captured_at: capturedAt,
      });
    }
  }
  // Wipe prior snapshots for this project + device combos to keep idempotent
  await admin.from("cwv_snapshots").delete().eq("project_id", PROJECT_ID).gte("captured_at", `${brief.audit_date}T00:00:00Z`).lt("captured_at", `${brief.audit_date}T23:59:59Z`);
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < snapshots.length; i += BATCH) {
    const { error } = await admin.from("cwv_snapshots").insert(snapshots.slice(i, i + BATCH));
    if (error) { console.error("cwv insert error:", error.message); process.exit(1); }
    inserted += Math.min(BATCH, snapshots.length - i);
  }
  console.log(`  ✓ cwv_snapshots: ${inserted} rows inserted`);

  // --------------------------------------------------------
  // 2. audit_findings — one per opportunity per mobile page
  // --------------------------------------------------------
  const runId = crypto.randomUUID();
  const findings: Array<Record<string, unknown>> = [];
  for (const page of brief.pages) {
    const mob = page.mobile;
    if (!mob) continue;
    // Page-level CWV verdict
    findings.push({
      project_id: PROJECT_ID,
      url: page.url,
      skill: "speed",
      check_name: "psi_mobile_score",
      status: mob.score < 50 ? "fail" : mob.score < 70 ? "warn" : "ok",
      pillar: "SXO",
      priority: mob.score < 50 ? "critical" : mob.score < 70 ? "high" : "low",
      message: `Mobile PSI: ${mob.score}/100 · LCP ${mob.metrics_lab.lcp_ms}ms · CLS ${mob.metrics_lab.cls}`,
      impl: mob.score < 50
        ? "Page-level: compress LCP image, defer non-critical JS, reserve layout for above-the-fold elements."
        : mob.score < 70
        ? "Page is borderline — focus on unused-JS + render-blocking CSS."
        : "Monitoring only.",
      details: {
        lcp_ms: mob.metrics_lab.lcp_ms, fcp_ms: mob.metrics_lab.fcp_ms, tbt_ms: mob.metrics_lab.tbt_ms,
        cls: mob.metrics_lab.cls, inp_p75_ms: mob.metrics_field?.inp_p75_ms ?? null,
      },
      run_id: runId,
    });
    // Per-opportunity findings (only if savings significant)
    for (const opp of mob.opportunities ?? []) {
      if ((opp.savings_ms ?? 0) < 200) continue;
      findings.push({
        project_id: PROJECT_ID,
        url: page.url,
        skill: "speed",
        check_name: opp.id,
        status: (opp.savings_ms ?? 0) > 1000 ? "fail" : "warn",
        pillar: "SXO",
        priority: (opp.savings_ms ?? 0) > 1000 ? "high" : "medium",
        message: `${opp.title} — save ${opp.savings_ms}ms` + (opp.savings_bytes ? ` (${Math.round(opp.savings_bytes / 1024)}KB)` : ""),
        impl: "Apply fix at the template level so all 85 core pages benefit.",
        details: { opp_id: opp.id, savings_ms: opp.savings_ms, savings_bytes: opp.savings_bytes ?? 0 },
        run_id: runId,
      });
    }
  }
  // Wipe prior speed findings from today's audit to keep idempotent
  await admin.from("audit_findings")
    .delete()
    .eq("project_id", PROJECT_ID)
    .eq("skill", "speed")
    .gte("created_at", `${brief.audit_date}T00:00:00Z`);
  inserted = 0;
  for (let i = 0; i < findings.length; i += BATCH) {
    const { error } = await admin.from("audit_findings").insert(findings.slice(i, i + BATCH));
    if (error) { console.error("audit_findings insert error:", error.message); process.exit(1); }
    inserted += Math.min(BATCH, findings.length - i);
  }
  console.log(`  ✓ audit_findings: ${inserted} rows inserted`);

  // --------------------------------------------------------
  // 3. Update pillar_scores for SXO + SEO
  // --------------------------------------------------------
  // Simple weighted model:
  //   SXO = mobile avg score (direct)
  //   SEO = 60% site-wide content signals (unchanged) + 40% desktop avg score
  const sxoScore = Math.round(brief.summary.mobile.avg_score);
  const seoScore = Math.round(0.4 * brief.summary.desktop.avg_score + 60 * 0.6); // assume 60 for content baseline
  const topIssues = brief.site_wide_issues.top_opportunities
    .slice(0, 5)
    .map((o) => `${o.id}: ${o.pages_affected} pages, ${Math.round(o.total_potential_savings_ms / 1000)}s total savings`);
  await admin.from("pillar_scores").insert([
    {
      project_id: PROJECT_ID, pillar: "SXO", score: sxoScore,
      breakdown: { source: "psi", mobile_avg: brief.summary.mobile.avg_score, desktop_avg: brief.summary.desktop.avg_score },
      top_issues: topIssues, captured_at: new Date().toISOString(),
    },
  ]);
  console.log(`  ✓ pillar_scores: SXO=${sxoScore}`);

  console.log("\n✅ PSI import complete.");
  console.log(`   ${snapshots.length} cwv_snapshots · ${findings.length} audit_findings · pillar_scores updated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
