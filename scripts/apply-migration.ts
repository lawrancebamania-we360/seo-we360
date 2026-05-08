// Apply a SQL migration directly via the Supabase Postgres connection.
//
// Usage:
//   SUPABASE_DB_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres" \
//   npx tsx scripts/apply-migration.ts supabase/migrations/<file>.sql
//
// If SUPABASE_DB_URL isn't set, prints the SQL and instructions for
// applying via Supabase Studio's SQL editor.

import { readFileSync } from "fs";
import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

(async () => {
  const sqlPath = process.argv[2];
  if (!sqlPath) {
    console.error("Usage: apply-migration.ts <path/to/migration.sql>");
    process.exit(2);
  }

  const sql = readFileSync(sqlPath, "utf-8");
  const dbUrl = process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    console.error("\n⚠️  SUPABASE_DB_URL not set in .env.local");
    console.error("");
    console.error("Apply this migration via Supabase Studio:");
    console.error("  1. Open https://supabase.com/dashboard/project/_/sql/new");
    console.error(`  2. Paste the contents of: ${sqlPath}`);
    console.error("  3. Click Run.");
    console.error("");
    console.error("Or, to apply automatically next time:");
    console.error("  Settings → Database → Connection string → URI (Session pooler)");
    console.error("  Copy that, paste into .env.local as SUPABASE_DB_URL=...");
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  console.log(`Connecting to ${dbUrl.replace(/:[^@]+@/, ":***@")}…`);
  await client.connect();
  console.log(`Applying ${sqlPath}…`);
  try {
    await client.query(sql);
    console.log("✅ Migration applied successfully");
  } catch (e) {
    console.error("❌ Migration failed:");
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await client.end();
  }
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
