"use client";

// Loads every cited link for a category the first time the Citation sources tab
// mounts (the tab only mounts when opened), so the Overview landing tab never
// pays for it. Refetches when the server report changes (router.refresh after a
// new check) or the category changes. Loading is derived from the state's key,
// not set synchronously in the effect.

import { useEffect, useState } from "react";
import { fetchAiVisibilityCitations } from "@/lib/actions/ai-visibility-evidence";
import type { CitationSourcesData } from "@/lib/ai-citation/citation-sources";

type State = { key: string; data: CitationSourcesData | null; error: string | null } | null;
const FAILED = "Could not load the cited sources.";

export function useCitationRows(projectId: string, category: string, refreshToken: unknown) {
  const key = `${projectId}|${category}`;
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAiVisibilityCitations({ project_id: projectId, category })
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
