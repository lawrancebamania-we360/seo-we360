// Graceful handling of the OPTIONAL ai_citation_runs columns (prompt_text,
// country, category) before their migrations are applied. Migrations here are
// applied by hand, so every read and write has to work on a database that is
// missing them: a run must NEVER be lost, and a report must never go blank.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn } from "./run-state";

/** The select-list suffix that reads the snapshot columns. */
export const SNAPSHOT_COLS = ", prompt_text, country";

/**
 * Which column a "missing column" error names, or null when it can't be told.
 * PostgREST: `Could not find the 'x' column of 'ai_citation_runs' in the schema cache`.
 * Postgres:  `column "x" of relation "ai_citation_runs" does not exist`
 *            / `column ai_citation_runs.x does not exist`.
 */
export function missingColumnName(message: string | undefined): string | null {
  if (!message) return null;
  const m =
    message.match(/could not find the '([^']+)' column/i) ??
    message.match(/column "?([a-z0-9_]+)"? of relation/i) ??
    message.match(/column [a-z0-9_]+\.([a-z0-9_]+) does not exist/i);
  return m ? m[1] : null;
}

export interface DegradingInsertResult {
  error: { message: string } | null;
  /** Optional columns that had to be left out because the database doesn't have them yet. */
  dropped: string[];
}

/**
 * Insert rows, and when the database says an OPTIONAL column doesn't exist, retry
 * without just that column. Anything else (a real constraint error, a missing
 * required column) is returned unchanged so it still surfaces. Bounded: at most
 * optional.length + 1 attempts.
 */
export async function insertRowsDegrading(
  admin: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  optional: readonly string[],
): Promise<DegradingInsertResult> {
  let current = rows;
  const dropped: string[] = [];
  for (let attempt = 0; attempt <= optional.length; attempt++) {
    const { error } = await admin.from(table).insert(current);
    if (!error) {
      if (dropped.length) console.warn(`[ai-citation] ${table}: saved without ${dropped.join(", ")} (migration not applied yet)`);
      return { error: null, dropped };
    }
    if (!isMissingColumn(error.message)) return { error, dropped };
    const named = missingColumnName(error.message);
    // A missing column we don't treat as optional is a real problem: surface it.
    if (named && !optional.includes(named)) return { error, dropped };
    const toDrop = named ? [named] : optional.filter((c) => !dropped.includes(c));
    if (!toDrop.length) return { error, dropped };
    dropped.push(...toDrop);
    current = current.map((r) => {
      const copy = { ...r };
      for (const k of toDrop) delete copy[k];
      return copy;
    });
  }
  return { error: { message: `${table}: insert still failing after dropping optional columns` }, dropped };
}

export type PreserveWordingResult =
  /** Every answer for the prompt now carries the wording it was asked with. */
  | { status: "saved" }
  /** The prompt_text column doesn't exist yet (migration not applied): nothing could be saved. */
  | { status: "unavailable" }
  /** A real database error: the caller must NOT go on to overwrite the wording. */
  | { status: "failed"; message: string };

/**
 * Called just BEFORE a prompt's text is overwritten: stamp every answer of that
 * prompt that doesn't yet carry its own wording with the OLD wording, so the
 * results already collected stay tied to the question they actually answered.
 * Answers that already carry a wording are never touched (`prompt_text is null`
 * only), so calling this twice, or for a prompt whose answers are all stamped,
 * changes nothing.
 */
export async function preservePriorWording(
  admin: SupabaseClient,
  promptId: string,
  oldText: string,
): Promise<PreserveWordingResult> {
  const wording = oldText.trim();
  if (!wording) return { status: "saved" };
  const { error } = await admin
    .from("ai_citation_runs")
    .update({ prompt_text: wording })
    .eq("prompt_id", promptId)
    .is("prompt_text", null);
  if (!error) return { status: "saved" };
  if (isMissingColumn(error.message)) return { status: "unavailable" };
  return { status: "failed", message: error.message };
}

/**
 * Run a read that selects the snapshot columns; if the database doesn't have them
 * yet, run it again without. `run(true)` must include SNAPSHOT_COLS in its select.
 */
export async function withSnapshotCols<R extends { error: { message: string } | null }>(
  run: (withSnapshot: boolean) => PromiseLike<R>,
): Promise<R> {
  const res = await run(true);
  if (res.error && isMissingColumn(res.error.message)) return run(false);
  return res;
}
