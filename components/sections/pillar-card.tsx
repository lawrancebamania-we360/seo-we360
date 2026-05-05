"use client";

import Link from "next/link";
import { useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { ArrowUpRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PILLAR_META, pillarColor, pillarGradient, pillarRing, type PillarKey } from "@/lib/ui-helpers";

interface Props {
  pillar: PillarKey;
  score: number;
  previousScore?: number | null;
  topIssues: string[];
  href: string;
  index?: number;
}

export function PillarCard({ pillar, score, previousScore, topIssues, href, index = 0 }: Props) {
  const meta = PILLAR_META[pillar];
  const delta = previousScore != null ? score - previousScore : null;
  const trend = delta == null ? "new" : delta > 0 ? "up" : delta < 0 ? "down" : "stable";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link href={href} className="group block">
        <Card
          className={cn(
            "relative overflow-hidden p-5 transition-all hover:shadow-md ring-1 ring-inset",
            pillarRing(score)
          )}
        >
          <div
            className={cn(
              "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70",
              pillarGradient(score)
            )}
          />
          <div className="relative space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {meta.label}
                </div>
                <div className="text-base font-semibold mt-0.5">{meta.name}</div>
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>

            <div className="flex items-baseline gap-2">
              <AnimatedScore score={score} className={cn("text-4xl font-semibold tabular-nums", pillarColor(score))} />
              <span className="text-sm text-muted-foreground">/ 100</span>
              {delta != null && (
                <span
                  className={cn(
                    "ml-auto inline-flex items-center gap-0.5 text-xs tabular-nums",
                    trend === "up" && "text-emerald-600 dark:text-emerald-400",
                    trend === "down" && "text-rose-600 dark:text-rose-400",
                    trend === "stable" && "text-zinc-500 dark:text-zinc-400"
                  )}
                >
                  {trend === "up" && <TrendingUp className="size-3" />}
                  {trend === "down" && <TrendingDown className="size-3" />}
                  {trend === "stable" && <Minus className="size-3" />}
                  {delta > 0 ? "+" : ""}
                  {delta}
                </span>
              )}
            </div>

            {topIssues.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Top issues
                </div>
                <ul className="space-y-0.5">
                  {topIssues.slice(0, 2).map((issue, i) => (
                    <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
                      <span className="text-muted-foreground mt-[2px]">·</span>
                      <span className="line-clamp-2">{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}

function AnimatedScore({ score, className }: { score: number; className?: string }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));

  useEffect(() => {
    const controls = animate(count, score, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
    });
    return controls.stop;
  }, [score, count]);

  return <motion.span className={className}>{rounded}</motion.span>;
}
