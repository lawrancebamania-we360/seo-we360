// Fake-Supabase check for the Reddit Citations -> Team Targets bridge
// (lib/reddit-citations/target-log.ts). No real database: an in-memory client
// stands in for the admin client and asserts the pure behaviour - adds credit
// the row owner's target, publishes credit Leena's target (under her), the
// third_party/pending shape, the link_key dedupe, removal, and the graceful skip
// when a target or table is missing.
//
// Usage: npx tsx scripts/check-reddit-citation-log.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  logCitationAdded, removeCitationAddedLog, logCitationPublished, removeCitationPublishedLog, logKeywordPlan,
} from "@/lib/reddit-citations/target-log";
import { todayIst } from "@/lib/team-targets/week";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[] | undefined>;

class FakeQuery {
  private mode: "select" | "insert" | "delete" | null = null;
  private filters: { col: string; val: unknown }[] = [];
  private insertRow: Row | null = null;
  private limitN: number | null = null;
  constructor(private tables: Tables, private table: string) {}
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
    if (rows === undefined) { resolve({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }); return; }
    if (this.mode === "select") {
      let out = rows.filter((r) => this.match(r));
      if (this.limitN != null) out = out.slice(0, this.limitN);
      resolve({ data: out, error: null });
    } else if (this.mode === "insert") {
      const row = this.insertRow!;
      if (row.link_key != null && rows.some((r) => r.target_id === row.target_id && r.link_key === row.link_key)) {
        resolve({ data: null, error: { code: "23505", message: "unique violation" } }); return;
      }
      rows.push({ id: `log-${rows.length + 1}`, ...row });
      resolve({ data: null, error: null });
    } else if (this.mode === "delete") {
      this.tables[this.table] = rows.filter((r) => !this.match(r));
      resolve({ data: null, error: null });
    } else resolve({ data: null, error: null });
  }
}

const fakeAdmin = (tables: Tables): SupabaseClient =>
  ({ from: (t: string) => new FakeQuery(tables, t) } as unknown as SupabaseClient);

function seedTargets(): Row[] {
  return [
    { id: "t-namrata", project_id: "p1", task: "Reddit citations", owner_id: "namrata", removed_at: null, created_at: "2026-11-01" },
    { id: "t-lokesh", project_id: "p1", task: "Reddit citations", owner_id: "lokesh", removed_at: null, created_at: "2026-11-01" },
    { id: "t-leena", project_id: "p1", task: "Publish Reddit citations", owner_id: "leena", removed_at: null, created_at: "2026-11-01" },
    { id: "t-kw", project_id: "p1", task: "Keyword plan to Leena (Reddit citations)", owner_id: "lawrance", removed_at: null, created_at: "2026-11-01" },
  ];
}

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`); }
}
const NOW = new Date("2026-11-12T06:00:00Z");
const EXPECTED_DATE = todayIst(NOW);
const THREAD_A = "https://www.reddit.com/r/NoStupidQuestions/comments/1wavhh8/alternatives/";

async function run() {
  // 1. Add credits the row owner's target, third_party / pending.
  {
    const t: Tables = { team_targets: seedTargets(), team_target_logs: [] };
    await logCitationAdded(fakeAdmin(t), { projectId: "p1", ownerId: "namrata", redditLink: THREAD_A, now: NOW });
    const l = t.team_target_logs![0];
    check("add logs one row", t.team_target_logs!.length === 1);
    check("add -> owner's target", l?.target_id === "t-namrata", String(l?.target_id));
    check("add kind third_party", l?.verification_kind === "third_party", String(l?.verification_kind));
    check("add status pending", l?.verification_status === "pending", String(l?.verification_status));
    check("add reported_by = owner", l?.reported_by === "namrata", String(l?.reported_by));
    check("add link_key normalized", l?.link_key === "reddit.com/r/nostupidquestions/comments/1wavhh8/alternatives", String(l?.link_key));
    check("add log_date today (IST)", l?.log_date === EXPECTED_DATE, `${l?.log_date} vs ${EXPECTED_DATE}`);
  }

  // 2. A different owner -> their own target.
  {
    const t: Tables = { team_targets: seedTargets(), team_target_logs: [] };
    await logCitationAdded(fakeAdmin(t), { projectId: "p1", ownerId: "lokesh", redditLink: "https://reddit.com/r/x/comments/y/z/", now: NOW });
    check("other owner -> their target", t.team_target_logs![0]?.target_id === "t-lokesh");
    // An owner with no Reddit-citations target is skipped silently.
    await logCitationAdded(fakeAdmin(t), { projectId: "p1", ownerId: "stranger", redditLink: "https://reddit.com/r/a/comments/b/c/", now: NOW });
    check("owner without a target is skipped", t.team_target_logs!.length === 1, `got ${t.team_target_logs!.length}`);
  }

  // 3. Re-adding the same thread (equivalent URL) does not duplicate.
  {
    const t: Tables = { team_targets: seedTargets(), team_target_logs: [] };
    await logCitationAdded(fakeAdmin(t), { projectId: "p1", ownerId: "namrata", redditLink: THREAD_A, now: NOW });
    await logCitationAdded(fakeAdmin(t), { projectId: "p1", ownerId: "namrata", redditLink: THREAD_A.replace("www.", "").replace(/\/$/, ""), now: NOW });
    check("re-add does not duplicate (unique link_key)", t.team_target_logs!.length === 1, `got ${t.team_target_logs!.length}`);
  }

  // 4. Publish credits Leena's target, under Leena (its owner), third_party.
  {
    const t: Tables = { team_targets: seedTargets(), team_target_logs: [] };
    await logCitationPublished(fakeAdmin(t), { projectId: "p1", link: "https://www.reddit.com/r/x/comments/y/z/comment/abc/", now: NOW });
    const l = t.team_target_logs![0];
    check("publish -> publish target", l?.target_id === "t-leena", String(l?.target_id));
    check("publish reported_by = Leena (target owner)", l?.reported_by === "leena", String(l?.reported_by));
    check("publish kind third_party", l?.verification_kind === "third_party");
  }

  // 5. Keyword plan credits the keyword-plan target, under its owner.
  {
    const t: Tables = { team_targets: seedTargets(), team_target_logs: [] };
    await logKeywordPlan(fakeAdmin(t), { projectId: "p1", planUrl: "https://docs.google.com/document/d/plan", now: NOW });
    const l = t.team_target_logs![0];
    check("keyword plan -> kw target", l?.target_id === "t-kw", String(l?.target_id));
    check("keyword plan reported_by = owner", l?.reported_by === "lawrance", String(l?.reported_by));
  }

  // 6. Removal takes out the matching log, keyed by target + link_key.
  {
    const t: Tables = { team_targets: seedTargets(), team_target_logs: [] };
    await logCitationAdded(fakeAdmin(t), { projectId: "p1", ownerId: "namrata", redditLink: THREAD_A, now: NOW });
    await logCitationPublished(fakeAdmin(t), { projectId: "p1", link: "https://reddit.com/r/x/comments/y/z/comment/abc/", now: NOW });
    check("two logs before removal", t.team_target_logs!.length === 2);
    await removeCitationAddedLog(fakeAdmin(t), { projectId: "p1", ownerId: "namrata", redditLink: THREAD_A });
    check("remove add log", t.team_target_logs!.length === 1, `got ${t.team_target_logs!.length}`);
    check("publish log kept", t.team_target_logs![0]?.target_id === "t-leena");
    await removeCitationPublishedLog(fakeAdmin(t), { projectId: "p1", link: "https://reddit.com/r/x/comments/y/z/comment/abc/" });
    check("remove publish log", t.team_target_logs!.length === 0);
  }

  // 7. Missing team_target_logs table: swallowed, nothing thrown.
  {
    const t: Tables = { team_targets: seedTargets(), team_target_logs: undefined };
    let threw = false;
    try { await logCitationAdded(fakeAdmin(t), { projectId: "p1", ownerId: "namrata", redditLink: THREAD_A, now: NOW }); } catch { threw = true; }
    check("missing logs table does not throw", !threw);
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => { console.error("Crash:", e instanceof Error ? e.stack : e); process.exit(1); });
