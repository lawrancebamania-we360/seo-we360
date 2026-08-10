// Google AI Overviews engine. Wraps the existing best-effort Apify tracker
// (runAiOverviewTracker). Unlike the chat engines this runs on a SEARCH KEYWORD
// (we pass the prompt text as the query) and needs the project domain + an Apify
// token, supplied by run.ts via opts. Best-effort: Apify is flaky and metered, so
// run.ts caps this to N=1 and skips it when no Apify token is available.

import type { AiEngine, EngineAdapter, EngineCitation } from "../types";
import { engineError } from "./_shared";
import { runAiOverviewTracker } from "@/lib/apify/intelligence";

const ENGINE: AiEngine = "google_aio";

export const googleAioAdapter: EngineAdapter = {
  engine: ENGINE,
  // A global APIFY_TOKEN is a hint that AIO is generally available; the real
  // per-project token is passed to run() and is what actually gates the call.
  isConfigured: () => !!process.env.APIFY_TOKEN?.trim(),
  async run(prompt, opts) {
    const token = opts?.apifyToken?.trim();
    const projectDomain = opts?.projectDomain?.trim();
    if (!token) return engineError(ENGINE, "Apify token not available");
    if (!projectDomain) return engineError(ENGINE, "project domain missing");
    // Bound the (slow) Apify call to what's left of the run's wall-clock budget, MINUS
    // a safety margin for the in-flight concurrency tail + post-run DB writes - so a
    // single AIO call finishes well before the batch deadline (and the 60s function
    // cap), not right at it. Skip entirely if there isn't enough headroom left.
    const remaining = opts?.deadlineMs ? opts.deadlineMs - Date.now() : undefined;
    const SAFETY_MS = 8000;
    if (remaining != null && remaining < 6000 + SAFETY_MS) return engineError(ENGINE, "insufficient time budget for AIO");
    const timeoutMs = remaining != null ? Math.min(40000, remaining - SAFETY_MS) : undefined;
    try {
      const r = await runAiOverviewTracker({ token, keyword: prompt, projectDomain, country: opts?.country, timeoutMs, retries: timeoutMs ? 0 : 1 });
      if (r.error) return engineError(ENGINE, r.error);
      const first = r.results[0];
      if (!first) return { engine: ENGINE, ok: true, answerText: "", citations: [] };
      const citations: EngineCitation[] = (first.cited_sources ?? []).map((s) => ({
        url: s.url,
        title: s.title || undefined,
        snippet: s.snippet || undefined,
      }));
      return { engine: ENGINE, ok: true, answerText: first.ai_overview_text ?? "", citations };
    } catch (e) {
      return engineError(ENGINE, e instanceof Error ? e.message : String(e));
    }
  },
};
