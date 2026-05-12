// Backfill `task_verifications` rows for tasks that are in review/done
// status with a supporting Google Doc (or, for done tasks, a published URL)
// but have no verification record yet.
//
// Cause: tasks moved into review via code paths that bypass the
// updateTaskStatus action (bulk inserts, direct DB updates, status moves
// made before the verification feature shipped) never trigger the
// enqueue_task_verification RPC, so the AI verification panel hides
// itself with no signal to the user.
//
// Usage:
//   npx tsx scripts/composio/backfill-verifications.ts                # dry-run, list candidates
//   npx tsx scripts/composio/backfill-verifications.ts --execute      # actually enqueue

import { createAdminClient } from "@/lib/supabase/admin";

const EXECUTE = process.argv.includes("--execute");

(async () => {
  const s = createAdminClient();

  // Pull all review/done tasks that have NO verification row yet.
  // ai_verification_id is the mirrored sentinel; if null, no row exists.
  const { data, error } = await s
    .from("tasks")
    .select("id, title, status, supporting_links, published_url, ai_verification_id, ai_verification_status")
    .in("status", ["review", "done"])
    .is("ai_verification_id", null);
  if (error) throw error;

  type Row = {
    id: string; title: string; status: string;
    supporting_links: string[] | null;
    published_url: string | null;
    ai_verification_id: string | null;
    ai_verification_status: string | null;
  };
  const rows = (data ?? []) as Row[];

  const docOf = (r: Row): string | null => {
    if (r.status === "done") return r.published_url ?? findDoc(r.supporting_links);
    return findDoc(r.supporting_links);
  };

  const hasDoc: Row[] = [];
  const noDoc: Row[] = [];
  for (const r of rows) {
    if (docOf(r)) hasDoc.push(r);
    else noDoc.push(r);
  }

  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Review/done tasks missing verification row: ${rows.length}`);
  console.log(`  → with doc URL (will enqueue):    ${hasDoc.length}`);
  console.log(`  → without doc URL (doc_missing):  ${noDoc.length}\n`);

  console.log("First 10 with doc:");
  for (const r of hasDoc.slice(0, 10)) {
    console.log(`  [${r.status}] ${r.title.slice(0, 80)}`);
  }

  if (!EXECUTE) {
    console.log("\nRe-run with --execute to enqueue these.");
    return;
  }

  let ok = 0, fail = 0;
  for (const r of hasDoc) {
    const { error: rpcErr } = await s.rpc("enqueue_task_verification", {
      p_task_id: r.id,
      p_trigger_status: r.status,
    });
    if (rpcErr) {
      console.error(`  ✗ ${r.id.slice(0, 8)} ${r.title.slice(0, 60)}: ${rpcErr.message}`);
      fail++;
    } else {
      ok++;
    }
  }
  // Also enqueue the no-doc ones so they show "doc_missing" in the UI
  // rather than hiding silently — the prompt nudges admin to paste a URL.
  for (const r of noDoc) {
    const { error: rpcErr } = await s.rpc("enqueue_task_verification", {
      p_task_id: r.id,
      p_trigger_status: r.status,
    });
    if (rpcErr) {
      console.error(`  ✗ ${r.id.slice(0, 8)} ${r.title.slice(0, 60)}: ${rpcErr.message}`);
      fail++;
    } else {
      ok++;
    }
  }
  console.log(`\nEnqueued ${ok} task(s), ${fail} failure(s).`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

function findDoc(links: string[] | null): string | null {
  if (!links) return null;
  for (const l of links) {
    if (typeof l === "string" && l.includes("docs.google.com")) return l;
  }
  return null;
}
