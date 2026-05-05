"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ShieldCheck, Sparkles, TrendingUp, AlertTriangle, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EeatAnalyzeDialog } from "./eeat-analyze-dialog";
import { formatDistanceToNow } from "date-fns";

export interface EeatReport {
  id: string;
  overall_score: number;
  experience_score: number;
  expertise_score: number;
  authoritativeness_score: number;
  trust_score: number;
  strengths: Array<{ signal: string; evidence: string }>;
  weaknesses: Array<{ signal: string; impact: string; fix: string }>;
  recommendations: Array<{ priority: "high" | "medium" | "low"; action: string; reason: string }>;
  provider: string;
  created_at: string;
}

interface Props {
  projectId: string;
  projectName: string;
  latestReport: EeatReport | null;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-sky-600 dark:text-sky-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function scoreBar(score: number): string {
  if (score >= 80) return "bg-gradient-to-r from-emerald-500 to-green-500";
  if (score >= 60) return "bg-gradient-to-r from-sky-500 to-cyan-500";
  if (score >= 40) return "bg-gradient-to-r from-amber-500 to-yellow-500";
  return "bg-gradient-to-r from-rose-500 to-red-500";
}

export function EeatCard({ projectId, projectName, latestReport }: Props) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!latestReport) {
    return (
      <>
        <Card className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-sky-500/20 text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <div className="font-semibold text-sm">E-E-A-T signals</div>
                <div className="text-xs text-muted-foreground">Google quality rater rubric</div>
              </div>
            </div>
            <Badge variant="outline" className="text-[9px]">BYOK</Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Use your own Claude or OpenAI key to analyze Experience, Expertise, Authoritativeness,
            and Trust signals on key pages. Gets you a 0-100 score + specific fixes.
          </p>
          <Button variant="brand" size="sm" onClick={() => setOpen(true)} className="w-full">
            <Sparkles className="size-3.5" />
            Analyze with AI
          </Button>
        </Card>
        <EeatAnalyzeDialog
          open={open}
          onOpenChange={setOpen}
          projectId={projectId}
          projectName={projectName}
          onAnalyzed={() => window.location.reload()}
        />
      </>
    );
  }

  const r = latestReport;
  const dims = [
    { key: "experience", label: "Experience", score: r.experience_score },
    { key: "expertise", label: "Expertise", score: r.expertise_score },
    { key: "authoritativeness", label: "Authority", score: r.authoritativeness_score },
    { key: "trust", label: "Trust", score: r.trust_score },
  ];
  const topRec = [...r.recommendations].sort((a, b) => {
    const weight = { high: 3, medium: 2, low: 1 } as const;
    return weight[b.priority] - weight[a.priority];
  })[0];

  return (
    <>
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-sky-500/20 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <div className="font-semibold text-sm">E-E-A-T signals</div>
              <div className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })} · {r.provider}
              </div>
            </div>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${scoreColor(r.overall_score)}`}>
            {r.overall_score}
            <span className="text-xs text-muted-foreground font-normal ml-0.5">/100</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {dims.map((d) => (
            <motion.div key={d.key} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 truncate">{d.label}</div>
              <div className={`text-lg font-semibold tabular-nums ${scoreColor(d.score)}`}>{d.score}</div>
              <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
                <div className={`h-full rounded-full ${scoreBar(d.score)} transition-[width] duration-700`} style={{ width: `${d.score}%` }} />
              </div>
            </motion.div>
          ))}
        </div>

        {topRec && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1">
              <TrendingUp className="size-2.5" />
              Top recommendation
            </div>
            <div className="text-sm font-medium leading-snug">{topRec.action}</div>
            <div className="text-xs text-muted-foreground leading-relaxed">{topRec.reason}</div>
          </div>
        )}

        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-3 border-t pt-3"
          >
            {r.weaknesses.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="size-2.5" />
                  Weaknesses ({r.weaknesses.length})
                </div>
                <ul className="space-y-1">
                  {r.weaknesses.slice(0, 4).map((w, i) => (
                    <li key={i} className="text-xs">
                      <div className="font-medium">{w.signal}</div>
                      <div className="text-muted-foreground leading-relaxed">→ {w.fix}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.strengths.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600 dark:text-emerald-400">
                  Strengths ({r.strengths.length})
                </div>
                <ul className="space-y-1">
                  {r.strengths.slice(0, 4).map((s, i) => (
                    <li key={i} className="text-xs">
                      <span className="font-medium">{s.signal}</span>
                      <span className="text-muted-foreground"> — {s.evidence}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => setExpanded((x) => !x)} className="flex-1">
            <ChevronRight className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
            {expanded ? "Hide details" : "View details"}
          </Button>
          <Button size="sm" variant="brand" onClick={() => setOpen(true)}>
            <Sparkles className="size-3.5" />
            Re-analyze
          </Button>
        </div>
      </Card>

      <EeatAnalyzeDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        projectName={projectName}
        onAnalyzed={() => window.location.reload()}
      />
    </>
  );
}
