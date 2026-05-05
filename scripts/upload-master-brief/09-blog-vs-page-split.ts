#!/usr/bin/env tsx
/**
 * Quick analysis: how many of our 120 blog_tasks are actually BLOG-format
 * (article, refresh, listicle, pillar) vs PAGE-format (vs / alt / integration /
 * solution / industry / India landing pages)?
 *
 * The dashboard puts everything under kind=blog_task (single-tenant Blog Sprint
 * convention), but for capacity planning we need to know the real split so we
 * can tell whether the 60-blogs + 20-pages monthly target is in reach.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

const isPage = (title: string): boolean => {
  const t = title.toLowerCase();
  return (
    /comparison page/.test(t) ||
    /alternative page/.test(t) ||
    /alternative-to page/.test(t) ||
    /integration page/.test(t) ||
    /landing page/.test(t) ||
    /industry page/.test(t) ||
    /india page/.test(t) ||
    /vs-competitor page/.test(t) ||
    /\bvs-page\b/.test(t) ||
    /\bsolution-page\b/.test(t) ||
    /\bintegration-page\b/.test(t) ||
    /\bindustry-page\b/.test(t) ||
    /\bindia-page\b/.test(t) ||
    /\balternative-page\b/.test(t) ||
    /\bhomepage-retarget\b/.test(t) ||
    // sheet H1 patterns from MCB tasks (no "page" suffix)
    /^we360 vs /.test(t) ||
    /\balternative\b\s*\[mcb-/.test(t) ||
    /\bintegration\b\s*\[mcb-/.test(t) ||
    /\[b-vs\./.test(t) ||
    /\[b-alt\./.test(t) ||
    /\[b-int\./.test(t) ||
    /\[b3\.2[a-z]?\]/.test(t) ||  // India pages B3.2a-d
    /\[b3\.1i\d\]/.test(t) ||      // industry pages B3.1i1-2
    /\[b4\.2\.\d\]/.test(t) ||     // industry pages B4.2.x
    /\[b2\.2[a-z]?\]/.test(t)      // landing page updates B2.2a-c
  );
};

const isBlog = (title: string): boolean => {
  const t = title.toLowerCase();
  return (
    /update existing blog/.test(t) ||
    /write new article/.test(t) ||
    /write new blog/.test(t) ||
    /pillar #/.test(t) ||
    /data study/.test(t) ||
    /striking-distance/.test(t) ||
    /^cluster-blog\b/.test(t) ||
    /^pillar-blog\b/.test(t) ||
    /^listicle\b/.test(t) ||
    /^how-to-blog\b/.test(t) ||
    /^definitional-blog\b/.test(t) ||
    /^update-blog\b/.test(t) ||
    /\[b1\.\d/.test(t) ||
    /\[b6\.3[a-z]?\]/.test(t) ||
    /\[b3\.3[a-z]?\]/.test(t) ||
    /\[b3\.4\]/.test(t) ||
    /\[b5\.2[a-z]?\]/.test(t) ||
    /\[b8\.[1-3]/.test(t) ||
    /\[b6\.4[a-z]?\]/.test(t)
  );
};

async function main() {
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, title, scheduled_date, team_member_id")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task");

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, email")
    .in("email", ["lokesh.kumar@we360.ai", "ishika.takhtani@we360.ai", "rahul.deswal@we360.ai"]);
  const idToName: Record<string, string> = {};
  for (const p of profiles ?? []) idToName[p.id] = p.name;

  const all = tasks ?? [];
  let pages = 0, blogs = 0, other = 0;
  const otherSamples: string[] = [];
  const byOwnerType: Record<string, { blogs: number; pages: number; other: number }> = {};
  const byMonthType: Record<string, { blogs: number; pages: number; other: number }> = {};

  for (const t of all) {
    const isP = isPage(t.title);
    const isB = isBlog(t.title);
    let cat: "blogs" | "pages" | "other";
    if (isP && !isB) cat = "pages";
    else if (isB && !isP) cat = "blogs";
    else if (isP && isB) cat = "pages";  // ambiguous → page (more conservative for blog target)
    else { cat = "other"; if (otherSamples.length < 12) otherSamples.push(t.title.slice(0, 90)); }

    if (cat === "pages") pages++; else if (cat === "blogs") blogs++; else other++;

    const owner = t.team_member_id ? idToName[t.team_member_id] : "unassigned";
    byOwnerType[owner] ??= { blogs: 0, pages: 0, other: 0 };
    byOwnerType[owner][cat]++;

    if (t.scheduled_date) {
      const month = t.scheduled_date.slice(0, 7);
      byMonthType[month] ??= { blogs: 0, pages: 0, other: 0 };
      byMonthType[month][cat]++;
    }
  }

  console.log(`\nTotal: ${all.length}`);
  console.log(`  Blogs: ${blogs}`);
  console.log(`  Pages: ${pages}`);
  console.log(`  Other: ${other}`);
  console.log(`\n=== Per owner ===`);
  for (const [owner, c] of Object.entries(byOwnerType)) {
    console.log(`  ${owner.padEnd(8)}: blogs=${c.blogs}, pages=${c.pages}, other=${c.other}`);
  }
  console.log(`\n=== Per month (current schedule) ===`);
  for (const [month, c] of Object.entries(byMonthType).sort()) {
    console.log(`  ${month}: blogs=${c.blogs}, pages=${c.pages}, other=${c.other}, total=${c.blogs + c.pages + c.other}`);
  }
  if (other > 0) {
    console.log(`\n=== Sample "other" titles (need pattern review) ===`);
    for (const s of otherSamples) console.log(`  - ${s}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
