import * as React from "react";

/**
 * Sparkline — a tiny inline trend line (overview tiles, competitor rows).
 * Pure SVG; no axes. `color` takes any CSS color (default Success green).
 */
export function Sparkline({
  data,
  width = 120,
  height = 34,
  strokeWidth = 2,
  color = "var(--color-success)",
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
}) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const x = (i: number) => (data.length === 1 ? 0 : (i / (data.length - 1)) * width);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 6);
  const d = "M" + data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
      preserveAspectRatio="none"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
