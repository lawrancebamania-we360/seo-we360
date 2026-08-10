"use client";

// Pre-run "tracking scope" drawer. The user is asked only the two things they care
// about - WHICH competitors (a subset of the shared list) and the TARGET KEYWORD
// they want to get cited for. Klimb auto-picks the angles (per industry) and the
// reputation checks. On confirm it saves the scope, generates/grows the prompt
// glossary, runs the check, and reports a summary of what was asked. Dash-free.

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Check, X, Sparkles, Coins, Play, Target } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveAiVisibilityScope, estimateRunScope, generateAiVisibilityPrompts, runAiVisibilityNow, addScopeCompetitor, removeScopeCompetitor } from "@/lib/actions/ai-visibility";

const SOFT_CAP = 5; // comfortable competitor count; 6-8 shows a credit-cost note
const HARD_CAP = 8;

const ANGLE_LABEL: Record<string, string> = {
  "best-of": "best-in-category", comparison: "competitor comparisons", alternatives: "alternatives",
  integration: "integrations", "use-case": "use-cases", "pricing-roi": "pricing / ROI", vertical: "by segment",
};

export interface ScopeDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  competitors: { id: string; name: string }[];
  suggestedTopics: string[];        // angles Klimb will check (per industry) - auto, shown read-only
  defaultKeyword: string;           // pre-fill pulled from the project's tracked keywords
  initial: { competitor_ids: string[]; target_keyword: string | null } | null;
  onDone: () => void;
}

export function AiVisibilityScopeDrawer({ open, onOpenChange, projectId, competitors, suggestedTopics, defaultKeyword, initial, onDone }: ScopeDrawerProps) {
  const [comps, setComps] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [est, setEst] = useState<{ checks: number; credits: number; creditsLeft: number | null } | null>(null);
  const [busy, setBusy] = useState<null | "gen" | "run">(null);
  const [extra, setExtra] = useState<{ id: string; name: string }[]>([]); // competitors added inline this session
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false); // synchronous guard against a rapid double-add race
  const allComps = [...competitors, ...extra]
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i) // dedup: `extra` can overlap refreshed props
    .filter((c) => !removed.has(c.id));

  useEffect(() => {
    if (!open) return;
    setComps(initial?.competitor_ids?.length ? initial.competitor_ids : competitors.slice(0, 3).map((c) => c.id));
    setKeyword(initial?.target_keyword || defaultKeyword || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Live cost preview (no spend). Angles are auto, so the estimate is stable.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    estimateRunScope({ project_id: projectId, topics: suggestedTopics, depth_n: 3 }).then((r) => {
      if (!cancelled && r.ok) setEst({ checks: r.checks ?? 0, credits: r.credits ?? 0, creditsLeft: r.creditsLeft ?? null });
    });
    return () => { cancelled = true; };
  }, [open, projectId, suggestedTopics]);

  const toggleComp = (id: string) => setComps((c) => {
    if (c.includes(id)) return c.filter((x) => x !== id);
    if (c.length >= HARD_CAP) return c;
    return [...c, id];
  });

  // Add a competitor by URL, verified server-side before it can cost run credits.
  const addByUrl = async (force = false) => {
    const url = newUrl.trim();
    if (!url || addingRef.current) return;
    addingRef.current = true;
    setAdding(true);
    const r = await addScopeCompetitor({ project_id: projectId, url, force });
    setAdding(false);
    addingRef.current = false;
    if (r.ok && r.id) {
      if (!allComps.some((c) => c.id === r.id)) setExtra((e) => [...e, { id: r.id as string, name: r.name || url }]);
      setComps((c) => (c.includes(r.id as string) ? c : [...c, r.id as string]));
      setNewUrl("");
    } else {
      const msg = r.error ?? "Could not add competitor.";
      if (msg.endsWith("Add it anyway?")) toast(msg, { action: { label: "Add anyway", onClick: () => addByUrl(true) } });
      else toast.error(msg);
    }
  };

  // Remove a competitor from the shared list (X on the chip). Optimistic; reverts on error.
  const removeComp = async (id: string) => {
    setRemoved((s) => new Set(s).add(id));
    setComps((c) => c.filter((x) => x !== id));
    setExtra((e) => e.filter((x) => x.id !== id));
    const r = await removeScopeCompetitor({ project_id: projectId, competitor_id: id });
    if (!r.ok) { toast.error(r.error ?? "Could not remove competitor."); setRemoved((s) => { const n = new Set(s); n.delete(id); return n; }); }
  };

  const run = async () => {
    setBusy("gen");
    const saved = await saveAiVisibilityScope({ project_id: projectId, competitor_ids: comps, topics: suggestedTopics, depth_n: 3, target_keyword: keyword.trim() || null });
    if (!saved.ok) { setBusy(null); toast.error(saved.error ?? "Could not save scope."); return; }
    const gen = await generateAiVisibilityPrompts({ project_id: projectId });
    if (!gen.ok) { setBusy(null); toast.error(gen.error ?? "Could not generate prompts."); return; }
    setBusy("run");
    const res = await runAiVisibilityNow({ project_id: projectId });
    setBusy(null);
    if (!res.ok) { toast.error(res.error ?? "Run failed."); return; }
    const angles = suggestedTopics.map((t) => ANGLE_LABEL[t] ?? t).join(", ");
    // "vs 0 competitors" reads as a broken comparison. With none explicitly
    // tracked the run still infers the category leaders (see the drawer note
    // above), so say that instead of a bare zero.
    const vsClause = comps.length > 0
      ? `vs ${comps.length} competitor${comps.length === 1 ? "" : "s"}`
      : "vs the category leaders we infer";
    toast.success(`Asked buyer questions across ${angles} + a reputation check, ${vsClause}. Checked ${res.totalRuns ?? 0} answers - mentioned in ${res.mentioned ?? 0}.${res.truncated ? " (partial - the weekly pass finishes the rest)" : ""}`);
    onOpenChange(false);
    onDone();
  };

  const overSoftCap = comps.length > SOFT_CAP;

  return (
    <Sheet open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Set up your AI-citation test</SheetTitle>
          <SheetDescription>Two quick things, then Klimb writes the buyer questions and runs them for you.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-52 pt-2">
          {/* Target keyword */}
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><Target className="size-4 text-ember-600" /> What do you most want to get cited for?</h3>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. employee monitoring software for remote teams"
              maxLength={120}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ember-400"
            />
            <p className="mt-1 text-xs text-muted-foreground">Pre-filled from your tracked keywords - edit it to focus the questions.</p>
          </section>

          {/* Competitors */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Track against</h3>
              <span className={cn("text-xs", overSoftCap ? "text-warning-600" : "text-muted-foreground")}>{comps.length} of {HARD_CAP}</span>
            </div>
            {allComps.length === 0
              ? <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">No competitors yet - add one below, or Klimb will infer the category leaders.</p>
              : (
                <div className="flex flex-wrap gap-2">
                  {allComps.map((c) => {
                    const on = comps.includes(c.id);
                    const disabled = !on && comps.length >= HARD_CAP;
                    return (
                      <span key={c.id}
                        className={cn("inline-flex items-center gap-1 rounded-full border pl-3 pr-1 py-1 text-xs font-medium transition-colors",
                          on ? "border-success-300 bg-success-500/10 text-success-700" : "border-muted-foreground/20 text-muted-foreground")}>
                        <button type="button" disabled={disabled} onClick={() => toggleComp(c.id)}
                          className={cn("inline-flex items-center gap-1.5 py-0.5", disabled && "cursor-not-allowed opacity-40")}>
                          {on && <Check className="size-3" />}{c.name}
                        </button>
                        <button type="button" onClick={() => removeComp(c.id)} title="Remove competitor"
                          className="rounded-full p-0.5 opacity-50 transition hover:bg-error-500/15 hover:text-error-600 hover:opacity-100">
                          <X className="size-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            {/* Add a competitor by URL - verified server-side before it can cost credits. */}
            <div className="mt-2.5 flex gap-2">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addByUrl(); } }}
                placeholder="add a competitor by url, e.g. teramind.com"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-xs outline-none focus:border-success-400"
              />
              <Button type="button" variant="outline" size="sm" disabled={adding || !newUrl.trim() || comps.length >= HARD_CAP} onClick={() => addByUrl()}>
                {adding ? <Loader2 className="size-3.5 animate-spin" /> : "Add"}
              </Button>
            </div>
            {overSoftCap && <p className="mt-2 text-xs text-warning-600">Tracking more than {SOFT_CAP} adds checks and uses more AI credits per run.</p>}
            <p className="mt-2 text-xs text-muted-foreground">We verify a new url is a real competitor before adding, so you don't spend credits on irrelevant questions. Manage the full list on the Competitors page.</p>
          </section>

          {/* What Klimb will check (auto, read-only) */}
          <div className="rounded-lg border border-success-300/40 bg-success-500/5 p-3 text-xs text-muted-foreground">
            <div className="mb-1.5 flex items-center gap-1.5 font-medium text-success-700"><Sparkles className="size-3.5" /> Klimb writes the questions for you</div>
            We cover the angles real buyers ask - {suggestedTopics.map((t) => ANGLE_LABEL[t] ?? t).join(", ")} - mostly without naming you (that is how we see if AI recommends you unprompted), plus a small reputation check (is it worth it, any complaints) so you catch issues to fix.
          </div>
        </div>

        {/* Sticky footer: cost + CTA */}
        <div className="absolute inset-x-0 bottom-0 border-t bg-background/95 px-4 pb-4 pt-3 backdrop-blur">
          {est ? (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Coins className="size-3.5" /> This run
              </div>
              <div className="flex items-stretch divide-x divide-border rounded-lg border bg-muted/30 text-center">
                <div className="flex-1 px-2 py-2"><div className="text-sm font-semibold text-foreground">~{est.checks}</div><div className="text-xs text-muted-foreground">checks</div></div>
                <div className="flex-1 px-2 py-2"><div className="text-sm font-semibold text-foreground">~{est.credits}</div><div className="text-xs text-muted-foreground">credits</div></div>
                <div className="flex-1 px-2 py-2"><div className="text-sm font-semibold text-foreground">{est.creditsLeft != null ? `~${est.creditsLeft}` : "-"}</div><div className="text-xs text-muted-foreground">credits left</div></div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">The weekly pass finishes anything that does not fit.</p>
            </div>
          ) : <p className="mb-3 text-xs text-muted-foreground">Estimating...</p>}
          <Button className="w-full gap-1.5" disabled={!!busy} onClick={run}>
            {busy === "gen" ? <><Loader2 className="size-4 animate-spin" /> Writing your questions...</> : busy === "run" ? <><Loader2 className="size-4 animate-spin" /> Running the test...</> : <><Play className="size-4" /> Run AI-citation test</>}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
