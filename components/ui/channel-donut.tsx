import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * ChannelDonut — a multi-segment donut (traffic-source mix). A multi-stop
 * `conic-gradient`: each segment gets an arc proportional to its value, an inner
 * `bg-card` disc punches the hole, and center content (a total + label) sits in
 * the middle. Colors come from the caller (pass the `--chart-1..5` tokens), so
 * this stays token-driven. A zero total renders the neutral track.
 */
export type DonutSegment = { label: string; value: number; color: string };

export function ChannelDonut({
  segments,
  size = 120,
  thickness = 16,
  centerValue,
  centerSub,
  className,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerValue: React.ReactNode;
  centerSub?: React.ReactNode;
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);

  let acc = 0;
  const stops: string[] = [];
  if (total > 0) {
    for (const seg of segments) {
      const start = (acc / total) * 360;
      acc += seg.value;
      const end = (acc / total) * 360;
      stops.push(`${seg.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`);
    }
  }
  const background = total > 0 ? `conic-gradient(${stops.join(", ")})` : "var(--color-slate-200)";

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Traffic sources breakdown"
    >
      <div className="size-full rounded-full" style={{ background }} />
      <div className="absolute rounded-full bg-card" style={{ inset: thickness }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-mono text-lg font-bold leading-none tabular-nums text-foreground">{centerValue}</div>
        {centerSub != null && (
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">{centerSub}</div>
        )}
      </div>
    </div>
  );
}
