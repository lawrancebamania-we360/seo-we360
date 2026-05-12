// Prints the SQL to fix the verification jsonb bug so it can be pasted
// into the Supabase SQL editor. After running this, paste the output
// into Dashboard -> SQL editor -> New query -> Run, then re-run
// scripts/composio/backfill-verifications.ts --execute to enqueue.

import { readFileSync } from "fs";
import { join } from "path";

const sqlPath = join(process.cwd(), "supabase", "migrations", "20260512000001_fix_verification_jsonb.sql");
const sql = readFileSync(sqlPath, "utf8");

console.log("=".repeat(80));
console.log("VERIFICATION JSONB FIX — paste this into Supabase SQL Editor:");
console.log("Dashboard -> SQL Editor -> New query -> paste -> Run");
console.log("=".repeat(80));
console.log();
console.log(sql);
console.log();
console.log("=".repeat(80));
console.log("After running, re-run:");
console.log("  npx tsx --env-file=.env.local scripts/composio/backfill-verifications.ts --execute");
console.log("=".repeat(80));
