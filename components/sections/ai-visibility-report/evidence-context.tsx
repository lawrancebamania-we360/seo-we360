"use client";

// Shared context for the AI-Visibility trust surfaces. Any metric anywhere in
// the report opens the evidence drawer through useEvidence() - a headline stat,
// a persona bar, a leaderboard row, a matrix cell, a sentiment segment - so
// "click any number, read the actual AI answers" needs no prop drilling.
//
// The provider also owns the LAZY brand-sentiment kickoff: when the server
// report says some brand-mention answers are still unclassified (and the viewer
// can manage the section), it fires ONE fire-and-forget classify action on
// mount, exposes `classifying` so chips can shimmer, and refreshes the server
// data when tiers land. The action is capped + locked + "IS NULL"-guarded
// server-side, so a stray double-trigger costs nothing.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { classifyAnswerSentiment } from "@/lib/actions/ai-visibility-evidence";
import type { EvidenceFilter } from "@/lib/ai-citation/trust";
import { EvidenceDrawer, type DrawerRequest } from "./evidence-drawer";

interface EvidenceContextValue {
  /** Open the drawer on a filtered, paginated answer list. */
  openList: (filter: EvidenceFilter, title: string, subtitle?: string) => void;
  /** Open the drawer directly on one answer's full transcript. */
  openTranscript: (runId: string) => void;
  /** True while the lazy sentiment pass is running (chips show a shimmer). */
  classifying: boolean;
}

const Ctx = createContext<EvidenceContextValue | null>(null);

export function useEvidence(): EvidenceContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEvidence must be used inside AivEvidenceProvider");
  return v;
}

export function AivEvidenceProvider({ projectId, canManage, unclassifiedCount, children }: {
  projectId: string;
  canManage: boolean;
  /** report.sentimentRollup.unclassified - how many mention rows still need a tier. */
  unclassifiedCount: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [request, setRequest] = useState<DrawerRequest>(null);
  const [classifying, setClassifying] = useState(false);
  // Fire the lazy pass at most once per mount; the server cap + lock + IS NULL
  // guard make any residual double-fire (e.g. a second tab) harmless.
  const fired = useRef(false);

  useEffect(() => {
    if (!canManage || unclassifiedCount <= 0 || fired.current) return;
    fired.current = true;
    setClassifying(true);
    void (async () => {
      try {
        const r = await classifyAnswerSentiment({ project_id: projectId });
        if (r.ok && (r.classified ?? 0) > 0) router.refresh(); // repaint chips + rollup
      } catch { /* fire-and-forget: rows stay "pending" and retry next visit */ }
      finally { setClassifying(false); }
    })();
  }, [canManage, unclassifiedCount, projectId, router]);

  const openList = useCallback((filter: EvidenceFilter, title: string, subtitle?: string) => {
    setRequest({ kind: "list", filter, title, subtitle });
  }, []);
  const openTranscript = useCallback((runId: string) => {
    setRequest({ kind: "transcript", runId });
  }, []);

  return (
    <Ctx.Provider value={{ openList, openTranscript, classifying }}>
      {children}
      <EvidenceDrawer projectId={projectId} request={request} onClose={() => setRequest(null)} />
    </Ctx.Provider>
  );
}
