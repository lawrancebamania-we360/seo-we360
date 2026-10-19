// Team Targets: telling "the migration has not been applied yet" apart from a
// real failure, so the page and the actions can say so plainly instead of
// crashing. PostgREST reports a missing table as PGRST205, Postgres itself as 42P01.

export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "PGRST205" || err.code === "42P01") return true;
  return /could not find the table|relation .* does not exist/i.test(err.message ?? "");
}

export const MIGRATION_NOTICE =
  "Team Targets needs a one-time database update first. Apply the 20261019000001 migration in Supabase, then try again.";
