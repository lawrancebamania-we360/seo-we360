import * as React from "react";

import { cn } from "@/lib/utils";

// AI Visibility "brand-visibility hero" band — the ember gradient panel from the
// SEO Blog Board v2 comp (lines 1314–1326): a score ring on the left, a headline
// + descriptive line, and a 2×2 stat cluster on the right split by hairline
// dividers. Pixel-matched to the design; lives in components/ui because the exact
// ember hexes (gradient + inner ring disc) are allowed here and banned in
// sections. Purely presentational — the parent owns all data and the
// click-through wiring (each stat takes an optional onClick).

const EMBER = "linear-gradient(150deg,#f0774f 0%,#dd4424 55%,#b8300f 100%)";
const EMBER_SHADOW = "0 14px 34px -16px rgba(221,68,36,.5)";
const RING_DISC = "linear-gradient(150deg,#e8623c,#c4361a)";

export type AiVisibilityHeroStat = {
  label: string;
  value: string;
  suffix?: string;
  sub: string;
  onClick?: () => void;
  title?: string;
};

/** Optional trend chip beside the score label (comp: a peach ▾12 delta). */
export type AiVisibilityHeroDelta = { value: string; direction: "up" | "down" };

export function AiVisibilityHeroBand({
  score,
  scoreLabel = "AI Visibility score",
  delta,
  headline,
  detail,
  stats,
}: {
  score: number;
  /** Mono uppercase label over the score copy. Comp uses "AI VISIBILITY (DIRECTIONAL)". */
  scoreLabel?: string;
  delta?: AiVisibilityHeroDelta;
  headline: string;
  detail: React.ReactNode;
  stats: AiVisibilityHeroStat[];
}) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div
      className="flex flex-wrap overflow-hidden rounded-2xl text-white"
      style={{ background: EMBER, boxShadow: EMBER_SHADOW }}
    >
      {/* Left: score ring + copy */}
      <div className="flex min-w-0 flex-[1_1_320px] items-center gap-6 p-7">
        <span
          className="relative size-[120px] flex-none rounded-full"
          style={{
            background: `conic-gradient(#fff ${(pct * 3.6).toFixed(1)}deg, rgba(255,255,255,.24) 0deg)`,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,.35)",
          }}
        >
          <span
            className="absolute inset-3 flex flex-col items-center justify-center rounded-full"
            style={{ background: RING_DISC }}
          >
            <span className="font-mono text-[32px] font-medium leading-none tracking-tight text-white tabular-nums">{score}</span>
            <span className="text-[11.5px] font-semibold text-white/70">/100</span>
          </span>
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-white/80">{scoreLabel}</span>
            {delta ? (
              <span
                className="inline-flex items-center gap-0.5 text-[12px] font-bold tabular-nums"
                style={{ color: delta.direction === "down" ? "#ffe0d6" : "#eafff2" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" aria-hidden>
                  <path d={delta.direction === "down" ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6"} />
                </svg>
                {delta.value}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 mb-1 text-[15px] font-semibold text-white">{headline}</div>
          <p className="text-[13px] leading-relaxed text-white/90">{detail}</p>
        </div>
      </div>

      {/* Right: 2×2 stat cluster */}
      <div className="grid flex-[1_1_300px] grid-cols-2 border-white/20 sm:border-l">
        {stats.map((s, i) => {
          const body = (
            <>
              <div className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-white/80">{s.label}</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-mono text-[26px] font-medium leading-none tracking-tight text-white tabular-nums">{s.value}</span>
                {s.suffix ? <span className="text-[13px] font-semibold text-white/60">{s.suffix}</span> : null}
              </div>
              <div className="mt-1 text-[11.5px] text-white/75">{s.sub}</div>
            </>
          );
          const base = cn("px-[22px] py-[18px] text-left border-white/20 border-b", i % 2 === 1 && "border-l");
          return s.onClick ? (
            <button key={i} type="button" onClick={s.onClick} title={s.title} className={cn(base, "cursor-pointer transition-colors hover:bg-white/5")}>
              {body}
            </button>
          ) : (
            <div key={i} className={base}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
