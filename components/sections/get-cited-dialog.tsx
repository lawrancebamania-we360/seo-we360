"use client";

// One-action "get cited" dialog. Opens from a non-cited AI answer: Klimb works
// out the single best ON-SITE move (format + title, the AI deciding - not a
// picker), then "Generate draft" reuses the existing credits article generator
// to write it and saves a Blog Sprint draft. "Change move" re-rolls. Off-site
// placements (threads AI cites) live as separate Sources + Get-Cited items.

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Loader2, Lightbulb, Target, ArrowRight, Pencil, Coins } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { recommendGetCited, type GetCitedMove } from "@/lib/actions/ai-visibility";
import { createArticle } from "@/lib/actions/articles";

// Turn a raw provider error (e.g. `Claude API: 400 {"...credit balance too low..."}`)
// into something a marketer can act on, instead of dumping JSON in a toast.
function friendlyAiError(msg: string | undefined | null): string {
  const m = (msg ?? "").toLowerCase();
  if (/credit|billing|quota|insufficient|balance|out of/.test(m))
    return "Out of AI credits — top up the OpenAI or Anthropic account whose key is set in Vercel, then try again.";
  if (/no .*key configured|api[_\s-]?key|not set|unauthor|invalid.*key|401|403/.test(m))
    return "No working AI key — check the OpenAI / Anthropic keys in Vercel.";
  return msg || "Something went wrong.";
}

export function GetCitedDialog({ open, onOpenChange, projectId, question, persona }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  question: string;
  persona?: string | null;
}) {
  const router = useRouter();
  const [move, setMove] = useState<GetCitedMove | null>(null);
  const [loadingReco, setLoadingReco] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [avoid, setAvoid] = useState<string[]>([]);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const fetchReco = async (avoidList: string[]) => {
    setLoadingReco(true);
    const r = await recommendGetCited({ project_id: projectId, question, persona: persona ?? undefined, avoid: avoidList });
    setLoadingReco(false);
    if (r.ok && r.move) {
      setMove(r.move);
      setAvoid((a) => [...a, r.move!.title].slice(-8));
    } else {
      toast.error(friendlyAiError(r.error) ?? "Could not work out a move.");
    }
  };

  useEffect(() => {
    if (open && !move && !loadingReco) fetchReco([]);
    if (!open) { setMove(null); setAvoid([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const generate = async () => {
    if (!move) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/articles/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId, provider: "claude", targetKeyword: move.title,
          secondaryKeywords: [question.slice(0, 120)], mode: "full", pageType: move.pageType,
        }),
      });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        toast.error(data.out_of_credits ? "You're out of AI credits for this month. Upgrade to keep generating." : friendlyAiError(data.error));
        setGenerating(false);
        return;
      }
      await createArticle({
        project_id: projectId,
        title: data.title || move.title,
        target_keyword: move.title.slice(0, 120),
        content: data.content ?? null,
        meta_description: data.metaDescription ?? null,
        status: "draft",
      });
      if (!mountedRef.current) return;
      const left = typeof data.creditsLeft === "number" ? ` (about ${data.creditsLeft} credits left)` : "";
      toast.success(`Draft added to Blog Sprint${left}`);
      setGenerating(false);
      onOpenChange(false);
      router.push("/dashboard/sprint");
    } catch (e) {
      if (!mountedRef.current) return;
      setGenerating(false);
      toast.error(friendlyAiError(e instanceof Error ? e.message : "Generation failed."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-success-600" /> Get cited for this question</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground mb-1">The question your buyers ask</div>
            <div className="text-sm break-words">{question}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {persona && <Badge variant="outline" className="text-xs">{persona}</Badge>}
              <Badge className="bg-error-500/10 text-error-700 text-xs hover:bg-error-500/10">Not cited today</Badge>
            </div>
          </div>

          {loadingReco ? (
            <div className="flex items-center gap-2 rounded-xl border border-success-300/40 bg-success-500/5 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Working out the best move...
            </div>
          ) : move ? (
            <div className="rounded-xl border border-success-300/50 bg-success-500/5 p-3.5">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-success-700">
                <Lightbulb className="size-4" /> Klimb&apos;s recommended move
                <span className="ml-auto rounded-full border bg-background px-2 py-0.5 text-xs font-normal capitalize text-muted-foreground">{move.format}</span>
              </div>
              <div className="text-sm font-medium">{move.title}</div>
              {move.why && <div className="mt-1.5 flex gap-2 text-xs text-muted-foreground"><Target className="size-3.5 shrink-0 mt-0.5 text-success-600" />{move.why}</div>}
              <div className="mt-1.5 flex gap-2 text-xs text-muted-foreground"><ArrowRight className="size-3.5 shrink-0 mt-0.5 text-success-600" />We draft it and add it to Blog Sprint to publish.</div>
            </div>
          ) : null}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Coins className="size-3.5 shrink-0" /> Uses ~1 AI credit from your plan (no key needed) — we write it and save it to Blog Sprint. Takes about a minute.
          </p>

          <div className="flex gap-2">
            <Button className="flex-1 gap-1.5" disabled={!move || generating || loadingReco} onClick={generate}>
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
              {generating ? "Writing your draft..." : `Generate ${move?.pageType === "page" ? "page" : "blog"} draft`}
            </Button>
            <Button variant="outline" disabled={generating || loadingReco} onClick={() => fetchReco(avoid)}>Change move</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
