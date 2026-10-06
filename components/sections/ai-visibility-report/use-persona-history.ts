"use client";

// Loads every persona that was ever asked, with counts across ALL checks, the
// first time the Sample answers tab mounts (the tab only mounts when opened).
// Refetches when the server report changes (router.refresh after a new check) or
// the category changes. Loading is derived from the state's key, not set
// synchronously in the effect; on a refresh the previous data stays on screen
// until the new data lands (the key does not change), so nothing flickers.

import { useEffect, useState } from "react";
import { fetchPersonaHistory } from "@/lib/actions/ai-visibility-answers";
import type { PersonaHistory } from "@/lib/ai-citation/answer-history";

type State = { key: string; data: PersonaHistory | null; error: string | null } | null;
const FAILED = "Could not load the answer history.";

export function usePersonaHistory(projectId: string, category: string, refreshToken: unknown) {
  const key = `${projectId}|${category}`;
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPersonaHistory({ project_id: projectId, category })
      .then((r) => {
        if (cancelled) return;
        setState({ key, data: r.ok ? r.data ?? null : null, error: r.ok ? null : r.error ?? FAILED });
      })
      .catch(() => {
        if (!cancelled) setState({ key, data: null, error: FAILED });
      });
    return () => { cancelled = true; };
  }, [projectId, category, key, refreshToken]);

  const current = state?.key === key ? state : null;
  return { loading: current === null, data: current?.data ?? null, error: current?.error ?? null };
}
