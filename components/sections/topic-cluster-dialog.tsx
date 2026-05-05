"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, KeyRound, Loader2, Target, Network, CheckCircle2,
  ArrowRight, Link2, TrendingUp, Layers, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TopicClusterPlan } from "@/lib/seo-skills/topic-cluster";

type Provider = "claude" | "openai";

const STORAGE_KEY = "we360.topic_cluster.key";
const STORAGE_PROVIDER_KEY = "we360.topic_cluster.provider";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  projectName: string;
}

const INTENT_COLOR: Record<string, string> = {
  informational: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  commercial: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
  transactional: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  navigational: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/20",
};
const KD_COLOR: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  high: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
};

export function TopicClusterDialog({ open, onOpenChange, projectId, projectName }: Props) {
  const router = useRouter();

  // Form state
  const [provider, setProvider] = useState<Provider>(() => {
    if (typeof window === "undefined") return "claude";
    return (sessionStorage.getItem(STORAGE_PROVIDER_KEY) as Provider) || "claude";
  });
  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  });
  const [remember, setRemember] = useState(apiKey.length > 0);
  const [seedKeyword, setSeedKeyword] = useState("");

  // Result state
  const [plan, setPlan] = useState<TopicClusterPlan | null>(null);
  const [clusterId, setClusterId] = useState<string | null>(null);

  const [generating, startGenerate] = useTransition();
  const [creating, startCreate] = useTransition();

  const reset = () => {
    setSeedKeyword("");
    setPlan(null);
    setClusterId(null);
  };

  const close = (v: boolean) => {
    if (!generating && !creating) {
      if (!v) reset();
      onOpenChange(v);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim().length < 10) {
      toast.error("Paste a valid API key");
      return;
    }
    if (seedKeyword.trim().length < 2) {
      toast.error("Enter a seed keyword");
      return;
    }

    if (remember) {
      try {
        sessionStorage.setItem(STORAGE_KEY, apiKey);
        sessionStorage.setItem(STORAGE_PROVIDER_KEY, provider);
      } catch { /* ignore */ }
    } else {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }

    startGenerate(async () => {
      const t = toast.loading(`Asking ${provider === "claude" ? "Claude" : "OpenAI"} to plan the cluster...`);
      try {
        const res = await fetch("/api/topic-cluster/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider,
            apiKey: apiKey.trim(),
            seedKeyword: seedKeyword.trim(),
            projectId,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "unknown error" }));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { cluster_id: string; plan: TopicClusterPlan };
        setPlan(body.plan);
        setClusterId(body.cluster_id);
        toast.success(
          <span className="inline-flex items-center gap-1.5">
            <Network className="size-3.5 text-violet-500" />
            Cluster built — {body.plan.spokes.length} spokes planned.
          </span>,
          { id: t, duration: 4000 }
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not build cluster", { id: t });
      }
    });
  };

  const createTasks = () => {
    if (!clusterId || !plan) return;
    const newCount = plan.coverage.new_content;
    if (newCount === 0) {
      toast.info("Every spoke is already covered by an existing article.");
      return;
    }

    startCreate(async () => {
      const t = toast.loading(`Creating ${newCount} blog task${newCount === 1 ? "" : "s"}...`);
      try {
        const res = await fetch(`/api/topic-cluster/${clusterId}/create-tasks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "unknown error" }));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { tasks_created: number };
        toast.success(
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            {body.tasks_created} task{body.tasks_created === 1 ? "" : "s"} added to Blog Sprint.
          </span>,
          { id: t, duration: 4000 }
        );
        onOpenChange(false);
        reset();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create tasks", { id: t });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl max-h-[92svh] overflow-y-auto we360-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-emerald-500/20 text-violet-700 dark:text-violet-400">
              <Network className="size-4" />
            </div>
            Plan a topic cluster
          </DialogTitle>
          <DialogDescription>
            Generate a pillar-and-spoke content plan for <strong>{projectName}</strong>.
            One pillar article + 8–12 spokes with interlinking plan, coverage scorecard, and
            priority-ordered roadmap. Uses your own Claude or OpenAI key — never stored.
          </DialogDescription>
        </DialogHeader>

        {!plan ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tc-seed">
                <span className="inline-flex items-center gap-1.5">
                  <Target className="size-3.5" />
                  Seed keyword<span className="text-rose-600">*</span>
                </span>
              </Label>
              <Input
                id="tc-seed"
                value={seedKeyword}
                onChange={(e) => setSeedKeyword(e.target.value)}
                placeholder="e.g. tandem skydiving"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Pick a broad seed — narrow terms produce thin clusters.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => v && setProvider(v as Provider)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude">Anthropic Claude (claude-opus-4-7)</SelectItem>
                  <SelectItem value="openai">OpenAI (gpt-4o)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tc-key" className="flex items-center gap-1.5">
                <KeyRound className="size-3.5" />
                API key
              </Label>
              <Input
                id="tc-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
                autoComplete="off"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-3.5"
              />
              Remember key for this session (wiped on tab close)
            </label>

            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1.5">
              <div className="font-medium inline-flex items-center gap-1.5">
                <Sparkles className="size-3 text-violet-500" />
                What you&apos;ll get
              </div>
              <ul className="text-muted-foreground space-y-0.5 pl-4 list-disc">
                <li>1 pillar article spec with H2 outline + word target</li>
                <li>8–12 spoke articles, each with intent, KD, outline, rationale</li>
                <li>Interlinking plan (anchor text + reasoning)</li>
                <li>Coverage scorecard against your existing articles</li>
                <li>Priority-ordered roadmap (quick wins first)</li>
                <li>~$0.05 Claude / ~$0.03 OpenAI</li>
              </ul>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" disabled={generating || apiKey.length < 10 || seedKeyword.trim().length < 2} variant="brand">
                {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Network className="size-3.5" />}
                {generating ? "Building cluster..." : "Plan cluster"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <PlanPreview
            plan={plan}
            onReset={reset}
            onCreateTasks={createTasks}
            creating={creating}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlanPreview({
  plan, onReset, onCreateTasks, creating,
}: {
  plan: TopicClusterPlan;
  onReset: () => void;
  onCreateTasks: () => void;
  creating: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Coverage scorecard */}
      <div className="grid grid-cols-3 gap-3">
        <ScorecardCell label="Total spokes" value={plan.coverage.total_spokes} icon={Layers} tone="violet" />
        <ScorecardCell label="New content" value={plan.coverage.new_content} icon={FileText} tone="emerald" />
        <ScorecardCell label="Already covered" value={plan.coverage.already_covered} icon={CheckCircle2} tone="sky" />
      </div>

      {/* Pillar card */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border bg-gradient-to-br from-violet-500/5 to-emerald-500/5 p-4 space-y-2"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
              <Target className="size-3" />
              Pillar
            </div>
            <div className="font-bold text-base leading-snug">{plan.pillar.title}</div>
            <div className="text-xs text-muted-foreground">
              {plan.pillar.summary}
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
            {plan.pillar.word_count_target}w target
          </Badge>
        </div>
        {plan.pillar.h2_outline.length > 0 && (
          <ul className="text-xs text-muted-foreground list-disc pl-5 pt-1 space-y-0.5">
            {plan.pillar.h2_outline.slice(0, 6).map((h, i) => (
              <li key={i} className="truncate">{h}</li>
            ))}
            {plan.pillar.h2_outline.length > 6 && (
              <li className="list-none text-[10px]">+{plan.pillar.h2_outline.length - 6} more H2s</li>
            )}
          </ul>
        )}
      </motion.div>

      {/* Spokes list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
            <Network className="size-3" />
            Spokes ({plan.spokes.length}) — roadmap order
          </div>
          <div className="text-[10px] text-muted-foreground">
            <TrendingUp className="size-2.5 inline mr-1" />
            Low KD first
          </div>
        </div>

        <div className="space-y-1.5 max-h-80 overflow-y-auto we360-scroll pr-1">
          {plan.spokes.map((s, i) => {
            const isCovered = !!s.already_covered_by;
            return (
              <motion.div
                key={`${s.title}-${i}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={cn(
                  "rounded-md border p-2.5 text-xs",
                  isCovered ? "bg-muted/50 opacity-70" : "bg-background"
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold tabular-nums shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold leading-snug min-w-0 flex-1 text-foreground">
                        {s.title}
                        {isCovered && (
                          <span className="ml-2 text-[9px] font-normal text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-0.5">
                            <CheckCircle2 className="size-2.5" />
                            Already covered
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge className={cn("text-[9px] h-4 border", INTENT_COLOR[s.intent])}>
                          {s.intent}
                        </Badge>
                        <Badge className={cn("text-[9px] h-4 border uppercase", KD_COLOR[s.kd_estimate])}>
                          KD {s.kd_estimate}
                        </Badge>
                      </div>
                    </div>
                    {s.target_keyword && (
                      <div className="text-muted-foreground">
                        Target: <span className="font-mono">{s.target_keyword}</span>
                        <span className="mx-1">·</span>
                        <span className="tabular-nums">{s.word_count_target}w</span>
                      </div>
                    )}
                    {s.reason && <div className="text-muted-foreground italic">{s.reason}</div>}
                    {isCovered && s.already_covered_by && (
                      <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        <Link2 className="size-2.5" />
                        Covered by: {s.already_covered_by.title}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Interlinking summary */}
      {plan.interlinking.length > 0 && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
            <Link2 className="size-3" />
            Interlinking plan
          </div>
          <div className="text-xs text-muted-foreground">
            {plan.interlinking.length} link rule{plan.interlinking.length === 1 ? "" : "s"} defined —
            saved with the cluster so you can reference when writing.
          </div>
        </div>
      )}

      <DialogFooter className="gap-2 pt-3 border-t">
        <div className="flex-1 text-xs text-muted-foreground self-center">
          ~${plan.cost_estimate_usd.toFixed(3)} spent · Cluster saved to your project
        </div>
        <Button type="button" variant="outline" onClick={onReset} disabled={creating}>
          New cluster
        </Button>
        <Button
          type="button"
          variant="brand"
          onClick={onCreateTasks}
          disabled={creating || plan.coverage.new_content === 0}
        >
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
          {creating
            ? "Creating tasks..."
            : plan.coverage.new_content === 0
            ? "All spokes already covered"
            : `Create ${plan.coverage.new_content} blog task${plan.coverage.new_content === 1 ? "" : "s"}`}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ScorecardCell({
  label, value, icon: Icon, tone,
}: {
  label: string; value: number; icon: typeof Target;
  tone: "violet" | "emerald" | "sky";
}) {
  const toneClass = {
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    sky: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  }[tone];
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-1">
      <div className={cn("inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold rounded-full px-1.5 py-0.5", toneClass)}>
        <Icon className="size-2.5" />
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
