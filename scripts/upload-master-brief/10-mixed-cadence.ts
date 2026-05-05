#!/usr/bin/env tsx
/**
 * Phase 10: Re-schedule with a blog-heavy May ratio.
 *
 * Target — May (Weeks 1-4):
 *   40 blogs + 20 pages = 60 total (per user direction)
 *
 * Per owner per week pattern (approximate):
 *   Wk1: 4 blogs + 1 page
 *   Wk2: 3 blogs + 2 pages
 *   Wk3: 3 blogs + 2 pages
 *   Wk4: 3 blogs + 2 pages
 *   = 13 blogs + 7 pages per person × 3 people = 39 blogs + 21 pages ≈ 40 + 20
 *
 * Weeks 5+ (June+):
 *   Just continue 5/week per person from remaining queue (blogs first if any).
 *
 * Robust classifier — uses URL + title patterns + brief.writer_notes.
 *
 * Usage:
 *   npx tsx scripts/upload-master-brief/10-mixed-cadence.ts            # dry run
 *   npx tsx scripts/upload-master-brief/10-mixed-cadence.ts --execute  # write
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

const EXECUTE = process.argv.includes("--execute");
const TASKS_PER_WEEK = 5;

// May pattern: (blogs, pages) per owner per week.
// Pattern 4b+1p / 3b+2p / 3b+2p / 3b+2p × 3 owners ≈ 36 blogs + 24 pages in May.
// User approved this 36+24 split.
const MAY_WEEKS = 4;
const MAY_PATTERN: Array<[number, number]> = [
  [4, 1],   // Week 1
  [3, 2],   // Week 2
  [3, 2],   // Week 3
  [3, 2],   // Week 4
];

// Sprint dates
const today = new Date("2026-05-05T00:00:00Z");
const tomorrow = new Date(today); tomorrow.setUTCDate(today.getUTCDate() + 1);
function nextMondayAfter(d: Date): Date {
  const dow = d.getUTCDay();
  const daysToAdd = dow === 0 ? 1 : (dow === 1 ? 7 : 8 - dow);
  const r = new Date(d); r.setUTCDate(d.getUTCDate() + daysToAdd); return r;
}
const sprintWeek1 = tomorrow;
const sprintWeek2 = nextMondayAfter(tomorrow);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const dateForWeek = (weekIdx: number): string => {
  if (weekIdx === 0) return iso(sprintWeek1);
  const d = new Date(sprintWeek2); d.setUTCDate(sprintWeek2.getUTCDate() + (weekIdx - 1) * 7);
  return iso(d);
};

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

interface Task {
  id: string;
  title: string;
  url: string | null;
  team_member_id: string | null;
  scheduled_date: string | null;
  priority: string | null;
  brief: { writer_notes?: string[]; [k: string]: unknown } | null;
}

// ---- Classifier --------------------------------------------------------
function classify(t: Task): "blog" | "page" {
  const title = t.title.toLowerCase();
  const url = (t.url ?? "").toLowerCase();
  const cluster = (t.brief?.writer_notes as string[] | undefined ?? [])
    .find((n) => /^cluster:/i.test(n))?.toLowerCase() ?? "";

  // 1) URL-based — strongest signal
  if (/^\/(?:vs|alternative|integrations|solutions|in|industries)\//.test(url)) return "page";
  if (url.startsWith("/blog/")) return "blog";

  // 2) Cluster hint from sheet
  if (cluster.includes("page") || cluster.includes("alt") || cluster.includes("vs ") || cluster.includes("integration") || cluster.includes("solution") || cluster.includes("industry") || cluster.includes("india")) {
    if (cluster.includes("blog")) {
      // ambiguous — let title decide below
    } else return "page";
  }

  // 3) Strong page title patterns
  if (
    /\bcomparison page\b/.test(title) ||
    /\balternative page\b/.test(title) ||
    /\balternative-to page\b/.test(title) ||
    /\bintegration page\b/.test(title) ||
    /\blanding page\b/.test(title) ||
    /\bindustry page\b/.test(title) ||
    /\bindia page\b/.test(title) ||
    /\bvs-competitor page\b/.test(title) ||
    /\[b-vs\./.test(title) ||
    /\[b-alt\./.test(title) ||
    /\[b-int\./.test(title) ||
    /\[b3\.2[a-z]?\]/.test(title) ||
    /\[b3\.1i\d\]/.test(title) ||
    /\[b4\.2\.\d\]/.test(title) ||
    /\[b2\.2[a-z]?\]/.test(title)
  ) return "page";

  // 4) Strong blog title patterns
  if (
    /^update existing blog/.test(title) ||
    /^write new article/.test(title) ||
    /^write new blog/.test(title) ||
    /\bpillar #/.test(title) ||
    /\bdata study\b/.test(title) ||
    /\bstriking-distance\b/.test(title) ||
    /\[b1\.\d/.test(title) ||
    /\[b6\.[34]/.test(title) ||
    /\[b3\.[34]/.test(title) ||
    /\[b5\.2[a-z]?\]/.test(title) ||
    /\[b8\.[1-3]/.test(title) ||
    /\[b7\.3\]/.test(title)
  ) return "blog";

  // 5) MCB sheet entries — use H1 patterns
  // "We360 vs X" / "X Alternative" / "We360 Y Integration" → page
  if (/^we360 vs /.test(title)) return "page";
  if (/\balternative\s*\[mcb-/.test(title)) return "page";
  if (/\bintegration\s*\[mcb-/.test(title)) return "page";
  // Calendar-only Lokesh entries — Workforce Management/Planning Software → solution-page-style
  if (/^workforce (management|planning) software/.test(title)) return "page";
  // Field employee tracking, time tracking, attendance tracking, employee monitoring as solution pages
  if (/\b(software|tracking)\b/.test(title) && /\[mcb-(0?1[7-9]|02[01])\]/.test(title)) return "page";

  // 6) Ops tasks (K-tasks, miscellaneous) — count as page since they're not content writing
  // Examples: "Disavow toxic backlinks [K1.2]", "Set up GBP [K1.6]", "Internal linking sweep [K3.1]"
  if (/\[k\d/.test(title) || /^disavow\b/.test(title) || /^set up\b/.test(title) || /^clean up\b/.test(title) || /^internal linking\b/.test(title) || /^mid-plan\b/.test(title) || /^build monthly\b/.test(title)) {
    return "page";   // ops tasks — don't compete for the "blog" capacity bucket
  }

  // 7) Default for "Update existing page" — page
  if (/^update existing page/.test(title)) return "page";

  // 8) Default for cluster-blogs / "Switching from", "Why teams switch", privacy concerns, pricing analysis, guide
  // These are blog-format
  if (/\bswitching\b/.test(title) || /\bwhy teams\b/.test(title) || /\bprivacy concerns\b/.test(title) || /\bpricing analysis\b/.test(title) || /\bfeatures\s*\[/.test(title)) return "blog";

  // 9) Calendar-only generic informational topics → blog
  if (/\b(analysis|management|planning|investment|benchmark|guide)\b/.test(title)) return "blog";

  // Default fallback — blog (informational content)
  return "blog";
}

// ---- Sort comparator ---------------------------------------------------
const sortQueue = (a: Task, b: Task) => {
  const pa = PRIORITY_RANK[a.priority ?? "medium"] ?? 2;
  const pb = PRIORITY_RANK[b.priority ?? "medium"] ?? 2;
  if (pa !== pb) return pa - pb;
  const da = a.scheduled_date ?? "9999-12-31";
  const db = b.scheduled_date ?? "9999-12-31";
  if (da !== db) return da.localeCompare(db);
  return a.title.localeCompare(b.title);
};

// ---- Owner schedule builder --------------------------------------------
function buildOwnerSchedule(blogs: Task[], pages: Task[]): Array<{ task: Task; cat: "blog" | "page"; weekIdx: number }> {
  const out: Array<{ task: Task; cat: "blog" | "page"; weekIdx: number }> = [];
  let bIdx = 0, pIdx = 0;

  // May Weeks 0-3 — apply MAY_PATTERN, fall back to whatever's available if shortage
  for (let week = 0; week < MAY_WEEKS; week++) {
    let [bWant, pWant] = MAY_PATTERN[week];
    let added = 0;
    while (bWant > 0 && bIdx < blogs.length) {
      out.push({ task: blogs[bIdx++], cat: "blog", weekIdx: week });
      bWant--; added++;
    }
    while (pWant > 0 && pIdx < pages.length) {
      out.push({ task: pages[pIdx++], cat: "page", weekIdx: week });
      pWant--; added++;
    }
    // Owner ran out of one type — fill remaining slots with the other
    while (added < TASKS_PER_WEEK && (bIdx < blogs.length || pIdx < pages.length)) {
      if (bIdx < blogs.length) out.push({ task: blogs[bIdx++], cat: "blog", weekIdx: week });
      else if (pIdx < pages.length) out.push({ task: pages[pIdx++], cat: "page", weekIdx: week });
      added++;
    }
  }

  // Weeks 4+ — remaining 5 at a time (blogs first, then pages)
  let week = MAY_WEEKS;
  let remaining = [...blogs.slice(bIdx), ...pages.slice(pIdx)];
  while (remaining.length > 0) {
    const chunk = remaining.slice(0, TASKS_PER_WEEK);
    for (const t of chunk) out.push({ task: t, cat: classify(t), weekIdx: week });
    remaining = remaining.slice(TASKS_PER_WEEK);
    week++;
  }

  return out;
}

// ---- Main --------------------------------------------------------------
async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Sprint Week 1: ${iso(sprintWeek1)} (Wed) — work starts tomorrow`);
  console.log(`Sprint Week 2: ${iso(sprintWeek2)} (Mon) — Monday-aligned thereafter`);
  console.log(`May target: 40 blogs + 20 pages = 60 (per-owner pattern auto-balances)\n`);

  const { data: tasks, error } = await admin
    .from("tasks")
    .select("id, title, url, team_member_id, scheduled_date, priority, brief")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task");
  if (error) { console.error(error); process.exit(1); }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, email")
    .in("email", ["lokesh.kumar@we360.ai", "ishika.takhtani@we360.ai", "rahul.deswal@we360.ai"]);
  const idToName: Record<string, string> = {};
  for (const p of profiles ?? []) idToName[p.id] = p.name;

  const all = (tasks as unknown as Task[]) ?? [];

  // Group + classify per owner
  const byOwner: Record<string, { blogs: Task[]; pages: Task[] }> = {
    Lokesh: { blogs: [], pages: [] },
    Ishika: { blogs: [], pages: [] },
    Rahul:  { blogs: [], pages: [] },
  };
  for (const t of all) {
    const name = t.team_member_id ? idToName[t.team_member_id] : null;
    if (!name || !byOwner[name]) continue;
    const cat = classify(t);
    byOwner[name][cat === "blog" ? "blogs" : "pages"].push(t);
  }

  // Sort each
  for (const o of Object.values(byOwner)) {
    o.blogs.sort(sortQueue);
    o.pages.sort(sortQueue);
  }

  // Print inventory
  console.log(`=== Task inventory (post-classification) ===`);
  for (const [owner, o] of Object.entries(byOwner)) {
    console.log(`  ${owner.padEnd(8)}: ${o.blogs.length + o.pages.length} total — ${o.blogs.length} blogs, ${o.pages.length} pages`);
  }
  const totalBlogs = Object.values(byOwner).reduce((s, o) => s + o.blogs.length, 0);
  const totalPages = Object.values(byOwner).reduce((s, o) => s + o.pages.length, 0);
  console.log(`  Team    : ${totalBlogs + totalPages} total — ${totalBlogs} blogs, ${totalPages} pages\n`);

  // Build per-owner schedules
  type Entry = { task: Task; cat: "blog" | "page"; owner: string; weekIdx: number; weekDate: string };
  const allPlan: Entry[] = [];
  for (const [owner, o] of Object.entries(byOwner)) {
    const entries = buildOwnerSchedule(o.blogs, o.pages);
    for (const e of entries) {
      allPlan.push({ ...e, owner, weekDate: dateForWeek(e.weekIdx) });
    }
  }

  // Print weekly heatmap
  const byWeek: Record<string, Entry[]> = {};
  for (const e of allPlan) (byWeek[e.weekDate] ??= []).push(e);
  console.log(`=== Weekly heatmap ===`);
  console.log(`Week | Date       | Lokesh (b/p) | Ishika (b/p) | Rahul (b/p) | Total (b/p)`);
  for (const wd of Object.keys(byWeek).sort()) {
    const week = byWeek[wd][0].weekIdx + 1;
    const counts: Record<string, { b: number; p: number }> = { Lokesh: { b: 0, p: 0 }, Ishika: { b: 0, p: 0 }, Rahul: { b: 0, p: 0 } };
    for (const e of byWeek[wd]) counts[e.owner][e.cat === "blog" ? "b" : "p"]++;
    const tb = counts.Lokesh.b + counts.Ishika.b + counts.Rahul.b;
    const tp = counts.Lokesh.p + counts.Ishika.p + counts.Rahul.p;
    console.log(
      `W${String(week).padStart(2)}   | ${wd} | ${counts.Lokesh.b}b+${counts.Lokesh.p}p` +
      `      | ${counts.Ishika.b}b+${counts.Ishika.p}p      | ${counts.Rahul.b}b+${counts.Rahul.p}p     | ${tb}b+${tp}p`
    );
  }

  // Monthly summary
  const byMonth: Record<string, { b: number; p: number }> = {};
  for (const e of allPlan) {
    const m = e.weekDate.slice(0, 7);
    byMonth[m] ??= { b: 0, p: 0 };
    if (e.cat === "blog") byMonth[m].b++; else byMonth[m].p++;
  }
  console.log(`\n=== Monthly totals ===`);
  for (const [m, c] of Object.entries(byMonth).sort()) {
    console.log(`  ${m}: ${c.b + c.p} total — ${c.b} blogs, ${c.p} pages`);
  }

  if (!EXECUTE) { console.log(`\n(Dry run — re-run with --execute to apply)`); return; }

  // Apply — only scheduled_date changes; writer_notes stays clean (no
  // metadata pollution like Sprint week / Identifier lines).
  console.log(`\n=== Applying ===`);
  let updated = 0, errors = 0;
  for (const e of allPlan) {
    const { error } = await admin.from("tasks").update({
      scheduled_date: e.weekDate,
      updated_at: new Date().toISOString(),
    }).eq("id", e.task.id);

    if (error) { errors++; console.error(`  ✗ ${e.task.id.slice(0, 8)}: ${error.message}`); }
    else updated++;
  }
  console.log(`\n✓ Updated ${updated} task(s)${errors ? ` — ${errors} error(s)` : ""}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
