"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { HealthSnapshot } from "@/lib/data/health";

export function HealthCard({ health, collapsed }: { health: HealthSnapshot; collapsed: boolean }) {
  const score = health.score;
  const tone =
    score == null ? "muted" : score >= 75 ? "emerald" : score >= 50 ? "amber" : "rose";

  const toneClass = {
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400",
    rose: "from-rose-500/10 to-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-400",
    muted: "from-muted to-muted/50 border-border text-muted-foreground",
  }[tone];

  const shadowClass = {
    emerald: "shadow-[0_4px_20px_-8px_rgb(16_185_129/0.3)]",
    amber: "shadow-[0_4px_20px_-8px_rgb(245_158_11/0.3)]",
    rose: "shadow-[0_4px_20px_-8px_rgb(244_63_94/0.3)]",
    muted: "",
  }[tone];

  if (collapsed) {
    return (
      <Link
        href="/dashboard/overview"
        title={`Overall health: ${score ?? "—"}/100`}
        className={cn(
          "flex size-10 items-center justify-center rounded-lg border bg-gradient-to-br transition-all hover:scale-105",
          toneClass,
          shadowClass
        )}
      >
        <span className="text-xs font-bold tabular-nums">{score ?? "—"}</span>
      </Link>
    );
  }

  return (
    <Link href="/dashboard/overview" className="block">
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={cn(
          "rounded-lg border bg-gradient-to-br px-3 py-2.5 transition-all hover:scale-[1.02] hover:shadow-lg",
          toneClass,
          shadowClass
        )}
      >
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80">
            Overall health
          </span>
          {health.trend === "up" && <TrendingUp className="size-3" />}
          {health.trend === "down" && <TrendingDown className="size-3" />}
          {health.trend === "stable" && <Minus className="size-3 opacity-50" />}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold tabular-nums leading-none">{score ?? "—"}</span>
          <span className="text-[10px] opacity-70">/100</span>
        </div>
        <div className="text-[10px] opacity-70 mt-0.5">
          {health.lastAudited
            ? `Last audit: ${formatDistanceToNow(new Date(health.lastAudited), { addSuffix: true })}`
            : "No audit yet"}
        </div>
      </motion.div>
    </Link>
  );
}
