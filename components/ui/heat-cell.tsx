import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Heat / performance scale — the one place a red→green ramp is allowed,
 * because the color IS the data. Fills are muted so a full grid stays calm;
 * only the number is crisp (Mono). Always pair with a text label elsewhere.
 */
export type HeatTier = "none" | "verylow" | "low" | "mid" | "high" | "veryhigh"

export const heatVars: Record<HeatTier, { bg: string; fg: string; label: string }> = {
  none: { bg: "var(--heat-none-bg)", fg: "var(--heat-none-fg)", label: "None" },
  verylow: { bg: "var(--heat-verylow-bg)", fg: "var(--heat-verylow-fg)", label: "Very low" },
  low: { bg: "var(--heat-low-bg)", fg: "var(--heat-low-fg)", label: "Low" },
  mid: { bg: "var(--heat-mid-bg)", fg: "var(--heat-mid-fg)", label: "Mid" },
  high: { bg: "var(--heat-high-bg)", fg: "var(--heat-high-fg)", label: "High" },
  veryhigh: { bg: "var(--heat-veryhigh-bg)", fg: "var(--heat-veryhigh-fg)", label: "Very high" },
}

export function heatTierFromPct(pct: number | null | undefined): HeatTier {
  if (pct == null) return "none"
  if (pct <= 0) return "none"
  if (pct <= 20) return "verylow"
  if (pct <= 40) return "low"
  if (pct <= 55) return "mid"
  if (pct <= 70) return "high"
  return "veryhigh"
}

function heatStyle(tier: HeatTier): React.CSSProperties {
  return { backgroundColor: heatVars[tier].bg, color: heatVars[tier].fg }
}

/** A single heatmap cell. Pass a pct (0-100) or an explicit tier. */
function HeatCell({
  pct,
  tier,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & { pct?: number | null; tier?: HeatTier }) {
  const resolved = tier ?? heatTierFromPct(pct)
  return (
    <div
      data-slot="heat-cell"
      data-tier={resolved}
      className={cn(
        "flex items-center justify-center rounded-lg px-2 py-1.5 font-mono text-sm font-medium tabular-nums",
        className
      )}
      style={heatStyle(resolved)}
      {...props}
    >
      {children ?? (pct != null ? `${Math.round(pct)}%` : "—")}
    </div>
  )
}

const SCALE_ORDER: HeatTier[] = ["none", "verylow", "low", "mid", "high", "veryhigh"]

/** The 6-step legend. */
function PerformanceScale({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="performance-scale"
      className={cn("flex flex-wrap gap-2", className)}
      {...props}
    >
      {SCALE_ORDER.map((tier) => (
        <span
          key={tier}
          className="rounded-md px-2 py-1 text-xs font-medium"
          style={heatStyle(tier)}
        >
          {heatVars[tier].label}
        </span>
      ))}
    </div>
  )
}

export { HeatCell, PerformanceScale }
