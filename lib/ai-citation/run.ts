// AI-citation run orchestrator. For a project: load its active prompts + brand
// aliases + competitors, run each prompt across the configured engines N times
// (AIO N=1), detect mention/citation/position per run, persist runs + sources
// (tagged with engine, and each prompt already carries persona + topic so the
// report can build persona/topic/model/competitor heatmaps), then roll up
// per-engine snapshots + a single composite visibility score. Metered through
// the org budget gate. Wall-clock bounded so it stays under the 60s function cap.
//
// CONTINUATION (P0-5 follow-up - runs are IMMORTAL, not just honest): a run that
// cannot finish inside its budget no longer stays truncated. The batch opens with
// a run_spec (its full task recipe); a budget-cut slice PARKS the batch back to
// 'queued' and the drain cron (app/api/cron/process-pending-citation-runs) claims
// it and runs the next <=60s slice via resumeRunBatch, until every task has a
// persisted ai_citation_runs row. Remaining work is recomputed each slice as
// spec-tasks MINUS existing rows (keyed prompt_id x engine x run_index), so a
// task can never run - or be billed - twice, and each slice reserves budget only
// for what IT is about to run. Same inline-slice + drain-cron architecture the
// kickoff pipeline proved out (projects.pending_kickoff_phases +
// process-pending-kickoffs); deliberately NOT after()/self-fetch chains (fragile
// on Vercel Hobby) and NOT an external queue vendor.
//
// Engines self-skip when unconfigured, so this runs on whatever keys exist today
// (ChatGPT on the platform OpenAI key) and lights up Claude/Perplexity/Google as
// their keys are added - no code change needed.

import { createAdminClient } from "@/lib/supabase/admin";
import { hostFromUrl } from "@/lib/url";
import { cleanCompetitorRows } from "./clean-inputs";
import { configuredEngines, ENGINE_ADAPTERS } from "./engines";
import { detectInAnswer } from "./detect";
import { aiVisibilityComposite, positionScoreFrom, shareOfVoice } from "./report";
import { AI_ENGINES, type AiEngine } from "./types";
import {
  startRunBatch, heartbeatRunBatch, finishRunBatch, reapStaleBatches,
  parkRunBatchForResume, claimBatchForResume, MAX_RESUME_PASSES,
  type RunTrigger, type EngineProgress, type RunBatchSpec,
} from "./run-state";

const AIO_N = 2; // TEMP bump (was 1) — one extra Google-AIO sample for a one-off run; REVERT to 1 after.
// Per-engine sampling: ChatGPT (no browsing, high variance) needs N=3 to estimate
// a citation rate; Perplexity (live web, near-deterministic) N=1 is enough; AIO is
// on-demand N=1. Same money, far better signal-per-dollar than a flat N everywhere.
const DEFAULT_N_BY_ENGINE: Record<AiEngine, number> = { chatgpt: 3, claude: 2, perplexity: 1, google_aio: AIO_N };
const RUN_CONCURRENCY = 12; // parallel adapter calls in flight - turns a ~350s serial run into ~25s for a scoped run
// Directional per-call cost in cents for metering (NOT shown to users as dollars).
// chatgpt now browses via the OpenAI web_search tool (pricier than a plain
// completion -> ~3c); Claude/Perplexity stay cheap; Google AIO (Apify) is dearest.
const COST_CENTS: Record<AiEngine, number> = { chatgpt: 3, claude: 1, perplexity: 1, google_aio: 12 };
// Launch budget: stop firing new tasks after this. In-flight tasks settle in
// parallel (tail ~ one slow call, up to the ~20s adapter timeout), so 38s + tail
// stays under the 60s Vercel cap with margin. Scoped runs finish well before it;
// bigger runs park the remainder for the drain cron.
const DEFAULT_BUDGET_MS = 38_000;

export interface RunOptions {
  engines?: AiEngine[];   // default = configuredEngines()
  n?: number;             // uniform samples per prompt x engine (legacy; prefer nByEngine)
  nByEngine?: Partial<Record<AiEngine, number>>; // per-engine sampling (ChatGPT 3 / Claude 2 / Perplexity 1)
  promptIds?: string[];   // default = all active prompts
  apifyToken?: string;    // required for google_aio
  userId?: string | null;
  maxMs?: number;         // wall-clock budget (default 55s)
  skipGate?: boolean;     // for paths that meter elsewhere
  /** Cap how many prompts the (expensive, slow) google_aio engine covers - used by
   *  the on-demand run to bound Apify cost + time. undefined = every prompt (cron). */
  aioPromptCap?: number;
  /** What kicked off this run, recorded on the lifecycle row so the UI can show
   *  only user-initiated runs. Defaults to 'on_demand'. */
  trigger?: RunTrigger;
  /** INTERNAL (drain cron): continue an existing PARKED batch instead of opening a
   *  new one. Callers use resumeRunBatch, which claims the batch and fills this in. */
  resumeBatch?: { id: string };
}

export interface RunSummary {
  ok: boolean;
  error?: string;
  batchId?: string;
  promptsRun: number;
  enginesUsed: AiEngine[];
  totalRuns: number;
  cited: number;
  mentioned: number;
  costCents: number;
  truncated: boolean;     // true if the wall-clock budget cut this slice short
  /** Tasks still without a persisted row after this slice. > 0 with ok:true means
   *  the batch was parked for the drain cron to finish. */
  remainingTasks?: number;
}

const r4 = (x: number) => Math.round(x * 10000) / 10000;
// Reduce a URL or bare domain to its host for ownership matching. hostFromUrl
// (not cleanHost) so a cited URL's path is dropped - otherwise a source host like
// "hubstaff.com/blog/x" never equals the competitor domain "hubstaff.com" and the
// row is stored untagged (is_project / competitor_id left null). See lib/url.ts.
const clean = (s: string | null | undefined) => hostFromUrl(s);

function emptySummary(over: Partial<RunSummary>): RunSummary {
  return { ok: false, promptsRun: 0, enginesUsed: [], totalRuns: 0, cited: 0, mentioned: 0, costCents: 0, truncated: false, ...over };
}

export function estimateRunCostCents(
  promptCount: number, engines: AiEngine[], n: number | Partial<Record<AiEngine, number>> = DEFAULT_N_BY_ENGINE,
  aioPromptCap?: number,
): number {
  const samplesFor = (e: AiEngine) =>
    e === "google_aio" ? AIO_N : (typeof n === "number" ? n : (n[e] ?? DEFAULT_N_BY_ENGINE[e]));
  // AIO can be capped to fewer prompts than the rest (on-demand cost guard).
  const countFor = (e: AiEngine) =>
    e === "google_aio" && aioPromptCap != null ? Math.min(aioPromptCap, promptCount) : promptCount;
  return engines.reduce((s, e) => s + COST_CENTS[e] * samplesFor(e) * countFor(e), 0);
}

export async function runProjectCitations(projectId: string, opts: RunOptions = {}): Promise<RunSummary> {
  const admin = createAdminClient();
  const resumeId = opts.resumeBatch?.id ?? null;

  // A claimed continuation must never bail out and leave its batch stranded
  // 'running' - the reaper would requeue it and the drain would spin on it
  // forever. Terminal-close it with whatever earlier slices already produced.
  const bail = async (error: string): Promise<RunSummary> => {
    if (resumeId) await closeOutIncompleteBatch(admin, projectId, resumeId, error);
    return emptySummary({ error, batchId: resumeId ?? undefined });
  };

  const { data: project } = await admin
    .from("projects").select("id, name, domain, industry, country").eq("id", projectId).maybeSingle();
  if (!project) return bail("project not found");

  const host = clean(project.domain);
  const hostNoTld = host.split(".")[0];
  const brandAliases = [...new Set([project.name, host, hostNoTld]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length >= 2))];

  const { data: compRows } = await admin
    .from("competitors").select("id, name, url").eq("project_id", projectId);
  // Same junk filter as generation: don't track instagram.com / a wikipedia page
  // as a "competitor" in the heatmaps just because it was auto-discovered.
  const competitors = cleanCompetitorRows((compRows ?? []) as { id: string; name: string; url: string }[])
    .map((c) => ({ id: c.id, name: c.name, domain: clean(c.url) }));

  let pq = admin.from("ai_citation_prompts")
    .select("id, text, persona, topic, country").eq("project_id", projectId).eq("active", true);
  if (opts.promptIds?.length) pq = pq.in("id", opts.promptIds);
  const { data: prompts } = await pq;
  if (!prompts?.length) return bail("no active prompts");

  // Only run engines that are configured; drop AIO if we have no Apify token.
  const requested = (opts.engines ?? configuredEngines()).filter((e) => AI_ENGINES.includes(e));
  const engines = requested.filter((e) => e !== "google_aio" || !!opts.apifyToken);
  if (!engines.length) return bail("no configured engines");
  // Per-engine sample count (clamped). AIO is always 1.
  const nFor = (e: AiEngine): number =>
    e === "google_aio" ? AIO_N : Math.min(Math.max(opts.nByEngine?.[e] ?? opts.n ?? DEFAULT_N_BY_ENGINE[e], 1), 7);

  // Flatten to independent tasks (one adapter call each) so they run CONCURRENTLY
  // instead of the old fully-sequential triple loop that blew past the budget and
  // truncated mid-run (biasing the report toward whichever buckets generated first).
  // Samples of the same prompt x engine are independent, so they parallelize freely.
  // Built BEFORE the budget gate so both the reservation and the continuation
  // dedupe below work on the exact task list.
  const allTasks: { p: (typeof prompts)[number]; engine: AiEngine; i: number }[] = [];
  for (let pi = 0; pi < prompts.length; pi++) {
    const p = prompts[pi];
    for (const engine of engines) {
      // Cap the expensive google_aio engine to the first aioPromptCap prompts (the
      // on-demand cost/time guard); the other engines cover every prompt.
      if (engine === "google_aio" && opts.aioPromptCap != null && pi >= opts.aioPromptCap) continue;
      const samples = nFor(engine);
      for (let i = 0; i < samples; i++) allTasks.push({ p, engine, i });
    }
  }

  // Continuation dedupe: any task that already has a persisted row for this batch
  // is DONE - never re-run, never re-billed. Keyed on the same triple stamped on
  // every ai_citation_runs row, so partial samples of one prompt x engine resume
  // exactly where they stopped.
  let tasks = allTasks;
  let alreadyDone = 0;
  const doneByEngine: Record<string, number> = {};
  if (resumeId) {
    const { data: doneRows, error: doneErr } = await admin
      .from("ai_citation_runs")
      .select("prompt_id, engine, run_index")
      .eq("run_batch_id", resumeId);
    // Failing open here could double-run (and double-bill) finished tasks - bail.
    if (doneErr) return bail(`could not load completed tasks: ${doneErr.message}`);
    const done = new Set((doneRows ?? []).map((r) => `${r.prompt_id}|${r.engine}|${r.run_index}`));
    tasks = allTasks.filter((t) => !done.has(`${t.p.id}|${t.engine}|${t.i}`));
    alreadyDone = done.size;
    for (const r of (doneRows ?? []) as { engine: string }[]) {
      doneByEngine[r.engine] = (doneByEngine[r.engine] ?? 0) + 1;
    }
    if (!tasks.length) {
      // Nothing left (e.g. the parking slice died right after its insert): close
      // out as complete; the closeout recomputes honest batch-wide counters.
      const closed = await closeOutIncompleteBatch(admin, projectId, resumeId, null);
      return {
        ok: true, batchId: resumeId, promptsRun: closed.promptsTouched, enginesUsed: engines,
        totalRuns: closed.totalRuns, cited: closed.cited, mentioned: closed.mentioned,
        costCents: 0, truncated: false, remainingTasks: 0,
      };
    }
  }

  // Reserve budget up-front (skip for internal paths that meter elsewhere) - for
  // THIS SLICE'S remaining tasks only. A continued batch already paid for what
  // earlier slices actually ran via their own record(), so estimating on the
  // post-dedupe task list is what makes a continued run never double-reserve.
  // Billing was removed in We360 — runs are un-metered. The only spend bound is
  // the set of built-in caps (per-engine sample counts, aioPromptCap, the 38s
  // wall-clock budget, MAX_RESUME_PASSES) plus manual-only triggering.

  const batchId = resumeId ?? crypto.randomUUID();
  const deadline = Date.now() + (opts.maxMs ?? DEFAULT_BUDGET_MS);
  type RunRow = Record<string, unknown> & { id: string; engine: AiEngine };
  const runRows: RunRow[] = [];
  const sourceRows: Record<string, unknown>[] = [];
  const compHitRows: Record<string, unknown>[] = [];
  let cited = 0, mentioned = 0, costCents = 0, truncated = false;

  // --- Durable run lifecycle (P0-5 + continuation) --------------------------
  // Fresh run: reap any earlier run of THIS project whose heartbeat went stale
  // (resumable ones are requeued for the drain, dead ones flipped timed_out),
  // then open this run's lifecycle row as 'running' WITH the task recipe
  // (run_spec) - so the batch is resumable even if this whole function dies.
  // Resume: the drain already claimed the row (queued -> running); parking is
  // always allowed since the spec exists by definition. All best-effort +
  // no-ops before the migrations are applied, so the run itself is unaffected.
  let canPark = false;
  if (resumeId) {
    canPark = true;
  } else {
    await reapStaleBatches(admin, projectId);
    const spec: RunBatchSpec = {
      promptIds: prompts.map((p) => p.id),
      engines,
      nByEngine: Object.fromEntries(engines.map((e) => [e, nFor(e)])) as Partial<Record<AiEngine, number>>,
      aioPromptCap: opts.aioPromptCap ?? null,
      skipGate: opts.skipGate || undefined,
    };
    const { specPersisted } = await startRunBatch(admin, {
      projectId, batchId, totalTasks: allTasks.length, engines,
      trigger: opts.trigger ?? "on_demand", userId: opts.userId ?? null,
      spec,
    });
    // Parking is only safe when the spec landed (pre-migration it does not) -
    // otherwise a truncated run falls back to P0-5's truncate-and-finish.
    canPark = specPersisted;
  }
  // Heartbeat progress at most every ~2s (NOT per adapter call - that'd be a DB
  // write per task). The pool workers bump `completedCount`; this throttle turns
  // it into a durable "x of y" the poller reads and the reaper uses for liveness.
  // Seeded with prior slices' work so a resume's cumulative x/y never regresses.
  let completedCount = alreadyDone;
  let lastBeat = 0;
  const HEARTBEAT_MS = 2000;
  // Per-engine x/y for the live banner. Totals come from the FULL spec task list
  // (not just this slice); `engineDone` is seeded from prior slices' rows and
  // bumped as each task settles (in the worker below).
  const engineTotals: Record<string, number> = {};
  for (const t of allTasks) engineTotals[t.engine] = (engineTotals[t.engine] ?? 0) + 1;
  const engineDone: Record<string, number> = { ...doneByEngine };
  const engineProgress = (): EngineProgress => {
    const out: EngineProgress = {};
    for (const e of Object.keys(engineTotals)) out[e] = { done: engineDone[e] ?? 0, total: engineTotals[e] };
    return out;
  };
  const maybeHeartbeat = async () => {
    const now = Date.now();
    if (now - lastBeat < HEARTBEAT_MS) return;
    lastBeat = now;
    await heartbeatRunBatch(admin, batchId, completedCount, engineProgress());
  };

  const runOne = async (t: (typeof tasks)[number]): Promise<void> => {
    const res = await ENGINE_ADAPTERS[t.engine].run(t.p.text, {
      country: t.p.country ?? project.country ?? undefined,
      projectDomain: host,
      apifyToken: opts.apifyToken,
      deadlineMs: deadline,
    });
    const det = res.ok
      ? detectInAnswer({ answerText: res.answerText, sources: res.citations, projectDomain: host, brandAliases, competitors })
      : null;
    const runId = crypto.randomUUID();
    // All mutations below are synchronous (no await between them), so concurrent
    // tasks never interleave a partial write - safe on the single JS thread.
    // Meter the path actually taken (res.costCents) when the adapter reports it -
    // e.g. a ChatGPT web_search that degraded to a plain completion costs less.
    if (res.ok) costCents += res.costCents ?? COST_CENTS[t.engine];
    if (det?.project.cited) cited++;
    if (det?.project.mentioned) mentioned++;
    runRows.push({
      id: runId, project_id: projectId, prompt_id: t.p.id, engine: t.engine,
      run_index: t.i, run_batch_id: batchId,
      answer_text: res.answerText ? res.answerText.slice(0, 8000) : null,
      project_cited: det?.project.cited ?? false,
      project_mentioned: det?.project.mentioned ?? false,
      position: det?.project.position ?? null,
      cost_credits: res.ok ? (res.costCents ?? COST_CENTS[t.engine]) : 0,
      error: res.error ?? null,
    });
    if (det) {
      for (const s of res.citations) {
        const hostS = clean(s.domain || s.url);
        const isProject = !!hostS && (hostS === host || hostS.endsWith("." + host) || host.endsWith("." + hostS));
        const comp = competitors.find((c) => c.domain && hostS && (hostS === c.domain || hostS.endsWith("." + c.domain)));
        sourceRows.push({
          run_id: runId, project_id: projectId,
          // Store the normalized host (not the raw, often-null engine domain) so the
          // report's top-sources + the why-cited domain fallback have a real host.
          domain: hostS || s.domain || null, url: s.url ?? null, title: s.title ?? null, snippet: s.snippet ?? null,
          is_project: isProject, competitor_id: comp?.id ?? null,
        });
      }
      // Per-competitor hit (mentioned/cited/position) - powers the persona/topic/
      // model x competitor heatmaps. Store only presence rows.
      for (const ch of det.competitors) {
        if (ch.hit.mentioned || ch.hit.cited) {
          compHitRows.push({
            run_id: runId, project_id: projectId,
            competitor_id: ch.id ?? null, competitor_name: ch.name,
            mentioned: ch.hit.mentioned, cited: ch.hit.cited, position: ch.hit.position ?? null,
          });
        }
      }
    }
  };

  try {
    // Concurrency-limited pool: up to RUN_CONCURRENCY calls in flight; stop
    // launching once the wall-clock budget is hit (the batch parks and the drain
    // cron finishes the rest). In-flight tasks settle in parallel, so the tail
    // stays ~one call long.
    let idx = 0;
    const worker = async (): Promise<void> => {
      while (idx < tasks.length) {
        if (Date.now() > deadline) { truncated = true; return; }
        const t = tasks[idx++];
        try { await runOne(t); } catch { /* a single failed call must not kill the batch */ }
        // Progress heartbeat (throttled inside): advances the durable "x of y" the
        // poller reads and proves liveness to the reaper.
        completedCount++;
        engineDone[t.engine] = (engineDone[t.engine] ?? 0) + 1;
        await maybeHeartbeat();
      }
    };
    await Promise.all(Array.from({ length: Math.min(RUN_CONCURRENCY, tasks.length) }, () => worker()));

    const promptsTouched = new Set(runRows.map((r) => r.prompt_id as string)).size;

    // Persist runs first (sources FK to runs.id, which we set client-side).
    if (runRows.length) {
      const { error } = await admin.from("ai_citation_runs").insert(runRows);
      if (error) throw new Error(`insert runs: ${error.message}`);
    }
    if (sourceRows.length) {
      const { error } = await admin.from("ai_citation_sources").insert(sourceRows);
      if (error) console.error("[ai-citation] insert sources:", error.message);
    }
    if (compHitRows.length) {
      // Non-fatal: the table may not exist yet (migration 20260629000001 applied
      // manually). Heatmaps degrade to the project column until it is applied.
      const { error } = await admin.from("ai_citation_competitor_hits").insert(compHitRows);
      if (error) console.error("[ai-citation] insert competitor hits:", error.message);
    }

    // How much of the WHOLE batch now has a persisted row. A task whose runOne
    // hard-crashed (row never pushed) counts as remaining - a later slice retries
    // it, bounded by MAX_RESUME_PASSES.
    const doneNow = alreadyDone + runRows.length;
    const remainingTasks = Math.max(0, allTasks.length - doneNow);
    if (remainingTasks > 0) truncated = true;

    // Rollups + terminal counters must reflect the WHOLE batch. A fresh batch is
    // fully in memory; a continued batch's earlier slices live only in the DB, so
    // aggregate from there (fall back to slice-local data on a read error).
    let aggRows: Array<Record<string, unknown> & { engine: AiEngine }> = runRows;
    let aggHits: Record<string, unknown>[] = compHitRows;
    if (resumeId) {
      const agg = await loadBatchRows(admin, batchId);
      if (agg) { aggRows = agg.rows; aggHits = agg.hits; }
    }
    await writeRollups(admin, projectId, aggRows, aggHits);

    const anyOk = aggRows.some((r) => !r.error);
    const aggCited = aggRows.filter((r) => r.project_cited === true).length;
    const aggMentioned = aggRows.filter((r) => r.project_mentioned === true).length;
    const aggCost = aggRows.reduce((s, r) => s + (Number(r.cost_credits) || 0), 0);

    // Close the lifecycle row. All-errored across the whole batch (no run row
    // landed without an error — e.g. the Apify FREE-tier cap makes google_aio
    // return status:FAILED, or every engine timed out) is a failure the UI must
    // show with a Retry, not a parked run that burns more slices on a
    // misconfigured provider.
    if (!anyOk) {
      const firstErr = runRows.find((r) => r.error)?.error as string | undefined;
      await finishRunBatch(admin, batchId, {
        status: "failed", completedTasks: doneNow, totalRuns: aggRows.length,
        cited: aggCited, mentioned: aggMentioned, costCents: aggCost, truncated,
        errorMessage: firstErr
          ? `No AI answers were returned. First error: ${String(firstErr).slice(0, 300)}`
          : "No AI answers were returned. The engines may be misconfigured or a provider was unavailable.",
      });
      return emptySummary({
        error: firstErr ? `No AI answers returned (${String(firstErr).slice(0, 200)})` : "No AI answers were returned.",
        batchId, enginesUsed: engines,
      });
    }

    if (remainingTasks > 0 && canPark) {
      // Ran out of budget with work left: PARK for the drain cron instead of the
      // old truncate-and-finish. Everything this slice DID run is already
      // persisted, metered, and rolled up - the report shows the partial result
      // immediately, and the next slice pays only for what remains.
      await parkRunBatchForResume(admin, batchId, {
        completedTasks: doneNow, progress: engineProgress(),
      });
      return {
        ok: true, batchId, promptsRun: promptsTouched, enginesUsed: engines,
        totalRuns: aggRows.length, cited, mentioned, costCents, truncated: true,
        remainingTasks,
      };
    }

    // Fully done (or truncated with no way to park pre-migration - the old
    // "partial, weekly pass finishes the rest" behavior).
    await finishRunBatch(admin, batchId, {
      status: "succeeded", completedTasks: doneNow, totalRuns: aggRows.length,
      cited: aggCited, mentioned: aggMentioned, costCents: aggCost, truncated,
    });

    return {
      ok: true, batchId, promptsRun: promptsTouched, enginesUsed: engines,
      totalRuns: aggRows.length, cited, mentioned, costCents, truncated,
      remainingTasks,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Persist the failure durably so the UI shows a truthful failed state + Retry
    // instead of a spinner that dies with the request. A failed batch is NOT
    // resumed (failed is terminal; Retry opens a fresh batch).
    await finishRunBatch(admin, batchId, {
      status: "failed", completedTasks: completedCount, truncated,
      errorMessage: message.slice(0, 500),
    });
    return emptySummary({ error: message, batchId, enginesUsed: engines });
  }
}

export interface ResumeResult {
  ok: boolean;
  /** Why nothing ran (not found / not parked / claim raced) - benign; the drain logs it. */
  skipped?: string;
  /** The batch was terminal-closed without running (resume cap, engines gone). */
  closed?: string;
  summary?: RunSummary;
}

/**
 * Continue a PARKED batch: claim it (queued -> running, resume_count++), rebuild
 * its task list from run_spec, and run the next wall-clock slice via
 * runProjectCitations - which parks it again if it STILL cannot finish. Called by
 * the drain cron (process-pending-citation-runs) under the same per-project run
 * lock the on-demand action uses. Bounded by MAX_RESUME_PASSES; over the cap the
 * batch closes out with whatever it has.
 */
export async function resumeRunBatch(
  batchId: string,
  opts: { maxMs?: number; apifyToken?: string } = {},
): Promise<ResumeResult> {
  const admin = createAdminClient();
  const { data } = await admin.from("ai_citation_run_batches")
    .select("id, project_id, status, run_spec, trigger, user_id, resume_count")
    .eq("id", batchId).maybeSingle();
  const b = data as {
    id: string; project_id: string; status: string; run_spec: RunBatchSpec | null;
    trigger: string | null; user_id: string | null; resume_count: number | null;
  } | null;
  if (!b) return { ok: false, skipped: "batch not found" };
  if (b.status !== "queued") return { ok: false, skipped: `status is ${b.status}` };
  const spec = b.run_spec;
  if (!spec?.promptIds?.length || !spec.engines?.length) return { ok: false, skipped: "no run spec" };

  const claimed = await claimBatchForResume(admin, batchId, b.resume_count ?? 0);
  if (!claimed) return { ok: false, skipped: "claim raced" };

  // Pass cap AFTER the claim so the closeout can go through finishRunBatch's
  // status='running' guard. A batch still unfinished after MAX_RESUME_PASSES
  // slices closes with what it has instead of burning budget forever.
  if ((b.resume_count ?? 0) + 1 > MAX_RESUME_PASSES) {
    await closeOutIncompleteBatch(admin, b.project_id, batchId, "the run hit its continuation limit before finishing");
    return { ok: true, closed: "resume limit reached" };
  }

  // Engines can change between slices (a key removed, no Apify token today):
  // continue with the still-runnable subset; completion is measured against it.
  const engines = spec.engines.filter((e) => configuredEngines().includes(e));
  if (!engines.length) {
    await closeOutIncompleteBatch(admin, b.project_id, batchId, "no configured engines were left to continue with");
    return { ok: true, closed: "no engines" };
  }

  const summary = await runProjectCitations(b.project_id, {
    engines,
    nByEngine: spec.nByEngine,
    promptIds: spec.promptIds,
    aioPromptCap: spec.aioPromptCap ?? undefined,
    skipGate: spec.skipGate === true,
    apifyToken: opts.apifyToken,
    maxMs: opts.maxMs,
    userId: b.user_id,
    trigger: (b.trigger as RunTrigger | null) ?? "cron",
    resumeBatch: { id: batchId },
  });
  return { ok: summary.ok, summary };
}

/**
 * Terminal-close a batch WITHOUT running more work: recompute honest counters
 * from the rows that actually landed (all slices), refresh the day's rollups so
 * the report matches, and finish as succeeded (something usable landed) or
 * failed (nothing did). Used when a continuation cannot proceed (spec unusable,
 * engines gone, budget blocked, resume cap) and when a resume finds nothing left
 * to do. Must be called while the batch is 'running' (post-claim) - finishRunBatch
 * is guarded on that status.
 */
async function closeOutIncompleteBatch(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  batchId: string,
  reason: string | null,
): Promise<{ totalRuns: number; cited: number; mentioned: number; promptsTouched: number }> {
  const agg = await loadBatchRows(admin, batchId);
  const rows = agg?.rows ?? [];
  const cited = rows.filter((r) => r.project_cited === true).length;
  const mentioned = rows.filter((r) => r.project_mentioned === true).length;
  const costCents = rows.reduce((s, r) => s + (Number(r.cost_credits) || 0), 0);
  const anyOk = rows.some((r) => !r.error);
  if (agg && rows.length) {
    // Make the day's rollup reflect everything the batch produced (idempotent
    // delete+insert inside writeRollups; no-ops when every row errored).
    await writeRollups(admin, projectId, rows, agg.hits);
  }
  await finishRunBatch(admin, batchId, anyOk
    ? {
        status: "succeeded", completedTasks: rows.length, totalRuns: rows.length,
        cited, mentioned, costCents,
        truncated: !!reason, // a reason means it stopped short; no reason = fully done
        errorMessage: reason ? `Continuation stopped: ${reason}`.slice(0, 500) : null,
      }
    : {
        status: "failed", completedTasks: rows.length, totalRuns: rows.length,
        cited, mentioned, costCents, truncated: true,
        errorMessage: (reason ?? "The run could not be continued.").slice(0, 500),
      });
  return { totalRuns: rows.length, cited, mentioned, promptsTouched: new Set(rows.map((r) => r.prompt_id as string)).size };
}

/**
 * Everything a batch has persisted so far (across ALL slices), for batch-wide
 * rollups + terminal counters. Returns null on a read error (callers fall back
 * to slice-local data). Row count is bounded by the batch's own total_tasks
 * (prompts x engines x samples), so the .in() on hit run_ids stays small.
 */
async function loadBatchRows(
  admin: ReturnType<typeof createAdminClient>,
  batchId: string,
): Promise<{ rows: Array<Record<string, unknown> & { engine: AiEngine }>; hits: Record<string, unknown>[] } | null> {
  const { data: rows, error } = await admin.from("ai_citation_runs")
    .select("id, prompt_id, engine, error, project_cited, project_mentioned, position, cost_credits")
    .eq("run_batch_id", batchId);
  if (error || !rows) return null;
  let hits: Record<string, unknown>[] = [];
  const ids = rows.map((r) => (r as { id: string }).id);
  if (ids.length) {
    // Best-effort: the hits table may not exist yet (migration 20260629000001).
    const { data: h } = await admin.from("ai_citation_competitor_hits")
      .select("run_id, mentioned, cited").in("run_id", ids);
    hits = (h ?? []) as Record<string, unknown>[];
  }
  return { rows: rows as unknown as Array<Record<string, unknown> & { engine: AiEngine }>, hits };
}

// Per-engine snapshot rows + one composite all-engines visibility score for the
// period (UTC date). Heatmaps (persona/topic/competitor) are computed at READ
// time by joining runs -> prompts, so they need no extra snapshot here.
async function writeRollups(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  runRows: Array<Record<string, unknown> & { engine: AiEngine }>,
  compHitRows: Array<Record<string, unknown>>,
): Promise<void> {
  if (!runRows.length) return;
  // A fully-failed batch (every engine errored) must NOT delete + overwrite a
  // good same-day rollup with a false 0 - leave the prior rollup intact.
  if (!runRows.some((r) => !r.error)) return;
  const period = new Date().toISOString().slice(0, 10);

  const agg = new Map<AiEngine, { n: number; m: number; c: number; posSum: number; posN: number }>();
  for (const row of runRows) {
    if (row.error) continue; // only successful runs feed the rates
    const e = row.engine;
    const a = agg.get(e) ?? { n: 0, m: 0, c: 0, posSum: 0, posN: 0 };
    a.n++;
    if (row.project_mentioned) a.m++;
    if (row.project_cited) a.c++;
    const pos = row.position as number | null;
    if (typeof pos === "number") { a.posSum += pos; a.posN++; }
    agg.set(e, a);
  }

  const band = (p: number, n: number) => (n ? 1.96 * Math.sqrt((p * (1 - p)) / n) : 0);
  const snapshots = [...agg].map(([engine, a]) => {
    const mr = a.n ? a.m / a.n : 0;
    const cr = a.n ? a.c / a.n : 0;
    return {
      project_id: projectId, engine, period_date: period, n_runs: a.n,
      mention_rate: r4(mr), citation_rate: r4(cr),
      avg_position: a.posN ? r4(a.posSum / a.posN) : null,
      confidence_low: r4(Math.max(0, cr - band(cr, a.n))),
      confidence_high: r4(Math.min(1, cr + band(cr, a.n))),
    };
  });
  // Idempotent per day: drop any earlier rollup for this period before writing,
  // so multiple runs in one day do not pile up duplicate snapshot/score rows
  // (which would corrupt the trend + delta reads). Latest run of the day wins -
  // and a continued batch re-rolls with its cumulative rows each slice, so the
  // final slice leaves the full-batch rollup in place.
  await admin.from("ai_citation_snapshots").delete().eq("project_id", projectId).eq("period_date", period);
  if (snapshots.length) {
    const { error } = await admin.from("ai_citation_snapshots").insert(snapshots);
    if (error) console.error("[ai-citation] insert snapshots:", error.message);
  }

  // Composite directional index (0-100). Phase-1 blend = citation-weighted with
  // mention support; position/SoV/readiness fold in later (open decision #6).
  const totals = [...agg.values()].reduce((s, a) => ({ n: s.n + a.n, m: s.m + a.m, c: s.c + a.c }), { n: 0, m: 0, c: 0 });
  const mentionRate = totals.n ? totals.m / totals.n : 0;
  const citationRate = totals.n ? totals.c / totals.n : 0;
  const competitorMentions = compHitRows.filter((h) => h.mentioned === true).length;
  const sov = shareOfVoice(totals.m, competitorMentions);
  const positionScore = positionScoreFrom(runRows.filter((r) => !r.error).map((r) => r.position as number | null));
  const composite = aiVisibilityComposite(citationRate, mentionRate, sov, positionScore);
  await admin.from("ai_visibility_scores").delete().eq("project_id", projectId).eq("period_date", period);
  const { error } = await admin.from("ai_visibility_scores").insert({
    project_id: projectId, period_date: period, engine: null,
    composite_score: composite, mention_sov: r4(sov), citation_sov: r4(citationRate), readiness_score: null,
  });
  if (error) console.error("[ai-citation] insert score:", error.message);
}
