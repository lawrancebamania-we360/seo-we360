// Fake-Supabase check for the content-pipeline -> Team Targets bridge
// (lib/content-pipeline/target-log.ts). No real database: an in-memory client
// stands in for the admin client, so this runs anywhere and asserts the pure
// behaviour - which target a kind maps to, the own_site/pending log shape, the
// unique link_key dedupe, graceful skip when the table is missing, and the undo.
//
// Usage: npx tsx scripts/check-publish-target-log.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { logPublishToTeamTarget, removePublishTargetLog } from "@/lib/content-pipeline/target-log";
import { todayIst } from "@/lib/team-targets/week";

type Row = Record<string, unknown>;
// A table set to undefined models a table the migration hasn't created yet.
type Tables = Record<string, Row[] | undefined>;

// Minimal stand-in for the slice of the PostgREST builder the bridge uses:
// select -> eq/is -> order -> limit (awaitable), insert (awaitable, enforcing the
// (target_id, link_key) unique index), and delete -> eq... (awaitable).
class FakeQuery {
  private mode: "select" | "insert" | "delete" | null = null;
  private filters: { col: string; val: unknown }[] = [];
  private insertRow: Row | null = null;
  private limitN: number | null = null;

  constructor(private tables: Tables, private table: string) {}

  // select() / order() take args from the real builder but ignore them here;
  // declaring no params keeps them lint-clean (extra call args are dropped).
  select() { this.mode = "select"; return this; }
  insert(row: Row) { this.mode = "insert"; this.insertRow = row; return this; }
  delete() { this.mode = "delete"; return this; }
  eq(col: string, val: unknown) { this.filters.push({ col, val }); return this; }
  is(col: string, val: unknown) { this.filters.push({ col, val }); return this; }
  order() { return this; }
  limit(n: number) { this.limitN = n; return this; }

  private match(r: Row) { return this.filters.every((f) => r[f.col] === f.val); }

  then(resolve: (v: { data: Row[] | null; error: { code?: string; message?: string } | null }) => void) {
    const rows = this.tables[this.table];
    if (rows === undefined) {
      resolve({ data: null, error: { code: "PGRST205", message: "Could not find the table in the schema cache" } });
      return;
    }
    if (this.mode === "select") {
      let out = rows.filter((r) => this.match(r));
      if (this.limitN != null) out = out.slice(0, this.limitN);
      resolve({ data: out, error: null });
    } else if (this.mode === "insert") {
      const row = this.insertRow!;
      if (row.link_key != null && rows.some((r) => r.target_id === row.target_id && r.link_key === row.link_key)) {
        resolve({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"team_target_logs_link_uniq\"" } });
        return;
      }
      rows.push({ id: `log-${rows.length + 1}`, ...row });
      resolve({ data: null, error: null });
    } else if (this.mode === "delete") {
      this.tables[this.table] = rows.filter((r) => !this.match(r));
      resolve({ data: null, error: null });
    } else {
      resolve({ data: null, error: null });
    }
  }
}

function fakeAdmin(tables: Tables): SupabaseClient {
  return { from: (table: string) => new FakeQuery(tables, table) } as unknown as SupabaseClient;
}

function seedTargets(): Row[] {
  return [
    { id: "t-blogs", project_id: "p1", task: "Upload Blogs to website", owner_id: "dinesh", removed_at: null, created_at: "2026-10-01" },
    { id: "t-guides", project_id: "p1", task: "Upload Guides to website", owner_id: "dinesh", removed_at: null, created_at: "2026-10-01" },
  ];
}

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`); }
}

const NOW = new Date("2026-10-19T06:00:00Z");
const EXPECTED_DATE = todayIst(NOW);

async function run() {
  // 1. A guide -> the Guides target, logged own_site / pending.
  {
    const tables: Tables = { team_targets: seedTargets(), team_target_logs: [] };
    await logPublishToTeamTarget(fakeAdmin(tables), {
      projectId: "p1", isGuide: true, publishedUrl: "https://www.we360.ai/guides/time-tracking/", reportedBy: "u1", now: NOW,
    });
    const logs = tables.team_target_logs!;
    const l = logs[0];
    check("guide logs exactly one row", logs.length === 1, `got ${logs.length}`);
    check("guide log -> Guides target", l?.target_id === "t-guides", String(l?.target_id));
    check("guide log kind own_site", l?.verification_kind === "own_site", String(l?.verification_kind));
    check("guide log status pending", l?.verification_status === "pending", String(l?.verification_status));
    check("guide log quantity 1", l?.quantity === 1, String(l?.quantity));
    check("guide log link stored", l?.link === "https://www.we360.ai/guides/time-tracking/", String(l?.link));
    check("guide log link_key normalized", l?.link_key === "we360.ai/guides/time-tracking", String(l?.link_key));
    check("guide log reported_by", l?.reported_by === "u1", String(l?.reported_by));
    check("guide log date is today (IST)", l?.log_date === EXPECTED_DATE, `${l?.log_date} vs ${EXPECTED_DATE}`);
  }

  // 2. A non-guide (blog / listicle / pillar) -> the Blogs target.
  {
    const tables: Tables = { team_targets: seedTargets(), team_target_logs: [] };
    await logPublishToTeamTarget(fakeAdmin(tables), {
      projectId: "p1", isGuide: false, publishedUrl: "https://we360.ai/blog/focus/", reportedBy: "u1", now: NOW,
    });
    const l = tables.team_target_logs![0];
    check("blog log -> Blogs target", l?.target_id === "t-blogs", String(l?.target_id));

    // More non-guide pages also fall to Blogs.
    await logPublishToTeamTarget(fakeAdmin(tables), { projectId: "p1", isGuide: false, publishedUrl: "https://we360.ai/blog/top-apps/", reportedBy: "u1", now: NOW });
    await logPublishToTeamTarget(fakeAdmin(tables), { projectId: "p1", isGuide: false, publishedUrl: "https://we360.ai/blog/untyped/", reportedBy: "u1", now: NOW });
    const all = tables.team_target_logs!;
    check("other non-guide kinds also -> Blogs target", all.every((r) => r.target_id === "t-blogs"), all.map((r) => r.target_id).join(","));
    check("three distinct blog logs", all.length === 3, `got ${all.length}`);
  }

  // 3. Re-publishing the same page (equivalent URL, same link_key) does not duplicate.
  {
    const tables: Tables = { team_targets: seedTargets(), team_target_logs: [] };
    const base = { projectId: "p1", isGuide: true, reportedBy: "u1", now: NOW };
    await logPublishToTeamTarget(fakeAdmin(tables), { ...base, publishedUrl: "https://www.we360.ai/guides/x/" });
    // Different spelling (no www, no trailing slash) -> same normalized link_key.
    await logPublishToTeamTarget(fakeAdmin(tables), { ...base, publishedUrl: "https://we360.ai/guides/x" });
    check("re-publish does not duplicate (unique link_key)", tables.team_target_logs!.length === 1, `got ${tables.team_target_logs!.length}`);
  }

  // 4. Missing team_target_logs table: the bridge swallows it, nothing thrown.
  {
    const tables: Tables = { team_targets: seedTargets(), team_target_logs: undefined };
    let threw = false;
    try {
      await logPublishToTeamTarget(fakeAdmin(tables), { projectId: "p1", isGuide: true, publishedUrl: "https://we360.ai/guides/y/", reportedBy: "u1", now: NOW });
    } catch { threw = true; }
    check("missing logs table does not throw (publish still succeeds)", !threw);

    // Missing team_targets table (migration not applied at all) also just skips.
    let threw2 = false;
    try {
      await logPublishToTeamTarget(fakeAdmin({ team_target_logs: [] }), { projectId: "p1", isGuide: false, publishedUrl: "https://we360.ai/blog/z/", reportedBy: "u1", now: NOW });
    } catch { threw2 = true; }
    check("missing targets table does not throw", !threw2);
  }

  // 5. Unpublish removes the matching log, leaving an unrelated one in place.
  {
    const tables: Tables = { team_targets: seedTargets(), team_target_logs: [] };
    await logPublishToTeamTarget(fakeAdmin(tables), { projectId: "p1", isGuide: true, publishedUrl: "https://we360.ai/guides/keep-me/", reportedBy: "u1", now: NOW });
    await logPublishToTeamTarget(fakeAdmin(tables), { projectId: "p1", isGuide: false, publishedUrl: "https://we360.ai/blog/remove-me/", reportedBy: "u1", now: NOW });
    check("two logs before undo", tables.team_target_logs!.length === 2);

    await removePublishTargetLog(fakeAdmin(tables), { projectId: "p1", isGuide: false, publishedUrl: "https://we360.ai/blog/remove-me/" });
    const left = tables.team_target_logs!;
    check("undo removes the blog log", left.length === 1, `got ${left.length}`);
    check("undo keeps the unrelated guide log", left[0]?.link_key === "we360.ai/guides/keep-me", String(left[0]?.link_key));

    // Undo of a URL that was never logged is a no-op (and doesn't throw).
    await removePublishTargetLog(fakeAdmin(tables), { projectId: "p1", isGuide: true, publishedUrl: "https://we360.ai/guides/never-logged/" });
    check("undo of unknown URL is a no-op", tables.team_target_logs!.length === 1);
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => { console.error("Crash:", e instanceof Error ? e.stack : e); process.exit(1); });
