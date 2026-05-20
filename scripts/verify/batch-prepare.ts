// Wrapper: run prepare.ts on each pending verification, capture ONLY the
// metadata (title, ok/error, word count, partial scores) so we don't blow up
// context with full doc text. For each successful prepare we cache the full
// result JSON to /tmp/prepared_<id>.json for later analysis.

import { spawn } from "child_process";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createAdminClient } from "@/lib/supabase/admin";

(async () => {
  const s = createAdminClient();
  const { data } = await s
    .from("task_verifications")
    .select("id, status, retry_count, source_type, source_url, tasks!task_verifications_task_id_fkey!inner(title, target_keyword)")
    .or("status.eq.queued,and(status.eq.failed,retry_count.lt.3)")
    .order("queued_at", { ascending: true })
    .limit(50);

  const rows = (data ?? []) as Array<{
    id: string; status: string; retry_count: number; source_type: string; source_url: string;
    tasks: { title: string; target_keyword: string };
  }>;

  const tmp = tmpdir();
  console.log(`Processing ${rows.length} verifications…\n`);
  console.log("ID                                   | Type       | Result | Words | Title");
  console.log("─".repeat(120));

  for (const r of rows) {
    const out = await runPrepare(r.id);
    const cls = out.ok === false ? `FAIL:${out.error}` : "OK";
    let words = "";
    if (out.ok !== false && out.doc_meta?.wordCount != null) {
      words = String(out.doc_meta.wordCount);
      writeFileSync(join(tmp, `prepared_${r.id}.json`), JSON.stringify(out));
    }
    console.log(`${r.id} | ${r.source_type.padEnd(10)} | ${cls.padEnd(7)} | ${words.padEnd(5)} | ${r.tasks.title.slice(0, 60)}`);
  }
})().catch((e) => { console.error("Crash:", e); process.exit(1); });

function runPrepare(id: string): Promise<{ ok?: boolean; error?: string; doc_meta?: { wordCount?: number } } & Record<string, unknown>> {
  return new Promise((resolve) => {
    const p = spawn("npx", ["tsx", "scripts/verify/prepare.ts", id], {
      shell: true,
      env: process.env,
    });
    let stdout = "";
    p.stdout.on("data", (d) => { stdout += d.toString(); });
    p.stderr.on("data", () => {});
    p.on("close", () => {
      try {
        // prepare.ts emits one JSON line at the end of stdout
        const last = stdout.trim().split("\n").reverse().find((l) => l.trim().startsWith("{"));
        resolve(last ? JSON.parse(last) : { ok: false, error: "no_output" });
      } catch (e) {
        resolve({ ok: false, error: `parse_error:${e instanceof Error ? e.message : e}` });
      }
    });
  });
}
