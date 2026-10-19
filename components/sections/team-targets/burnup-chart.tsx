// Team Targets: the burn-up. Cumulative team completion (purple, verified only)
// against the ideal pace line (dashed). Both are % of the full-period goal, so
// unlike units stay comparable. Plain inline SVG so it themes and scales on a
// phone. Done is plotted by the date work was logged, so past points can rise
// as links get verified.

import { Card } from "@/components/ui/card";
import type { BurnupPoint } from "@/lib/team-targets/types";

const W = 720, H = 260, PAD_L = 36, PAD_R = 16, PAD_T = 16, PAD_B = 28;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDay(iso: string): string { const [, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${d}`; }

export function BurnupChart({ points, title }: { points: BurnupPoint[]; title: string }) {
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = points.length;
  const x = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD_T + (1 - Math.min(1, Math.max(0, v))) * plotH;

  const line = (sel: (p: BurnupPoint) => number) => points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(sel(p)).toFixed(1)}`).join(" ");
  const donePath = line((p) => p.done);
  const idealPath = line((p) => p.ideal);
  const areaPath = n ? `${donePath} L ${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z` : "";

  const last = points[n - 1];
  // ~5 evenly spaced x labels.
  const tickIdx = n <= 1 ? [0] : Array.from(new Set([0, Math.round((n - 1) * 0.25), Math.round((n - 1) * 0.5), Math.round((n - 1) * 0.75), n - 1]));

  return (
    <Card className="gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-[11.5px] text-muted-foreground">Cumulative completion vs where we should be</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 rounded bg-[#5B45E0] dark:bg-[#7B62FF]" /> Done</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-0 w-4 border-t border-dashed border-muted-foreground" /> Ideal</span>
        </div>
      </div>

      {n === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">No working days in this range.</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Burn-up: done ${Math.round((last?.done ?? 0) * 100)}%, ideal ${Math.round((last?.ideal ?? 0) * 100)}%`}>
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <g key={g}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(g)} y2={y(g)} className="stroke-border" strokeWidth={1} opacity={0.5} />
              <text x={PAD_L - 6} y={y(g) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={9}>{Math.round(g * 100)}</text>
            </g>
          ))}
          {areaPath && <path d={areaPath} className="fill-[#5B45E0]/10 dark:fill-[#7B62FF]/15" />}
          <path d={idealPath} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.7} />
          <path d={donePath} fill="none" className="stroke-[#5B45E0] dark:stroke-[#7B62FF]" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {last && <circle cx={x(n - 1)} cy={y(last.done)} r={3.5} className="fill-[#5B45E0] dark:fill-[#7B62FF]" />}
          {tickIdx.map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-muted-foreground" fontSize={9}>
              {shortDay(points[i].date)}
            </text>
          ))}
        </svg>
      )}
    </Card>
  );
}
