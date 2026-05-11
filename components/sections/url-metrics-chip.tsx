"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getDataBackingForUrl } from "@/lib/actions/url-metrics";
import type { UrlMetric } from "@/lib/types/url-metrics";

// Tiny inline chip for the Web Tasks list — shows the URL's 90d clicks +
// impressions + position so admins can scan the list and see which pages
// are pulling weight. Lazy-fetches on mount per URL, so a long list does
// N parallel light queries (cheap; the view is paginated upstream).

interface Props {
  url: string;
  className?: string;
}

export function UrlMetricsChip({ url, className }: Props) {
  const [m, setM] = useState<UrlMetric | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDataBackingForUrl(url, "90d")
      .then((res) => { if (!cancelled) setM(res); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);

  if (loading || !m) return null;
  if (m.gsc_impressions === 0 && m.ga_sessions === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-[#5B45E0]/20 bg-[#5B45E0]/5 px-1.5 py-0.5 text-[10px] tabular-nums font-medium text-[#5B45E0] dark:text-[#7B62FF]",
              className,
            )}
          >
            <TrendingUp className="size-2.5" />
            {m.gsc_impressions.toLocaleString()}i · {m.gsc_clicks}c · pos {m.gsc_position.toFixed(0)}
          </div>
        }
      />
      <TooltipContent side="top">
        <div className="text-[11px] space-y-0.5">
          <div className="font-medium">Last 90d</div>
          <div>{m.gsc_impressions.toLocaleString()} impressions · {m.gsc_clicks.toLocaleString()} clicks</div>
          <div>CTR {(m.gsc_ctr * 100).toFixed(2)}% · avg position {m.gsc_position.toFixed(1)}</div>
          <div className="border-t border-border/30 pt-0.5 mt-0.5">{m.ga_sessions.toLocaleString()} sessions · {(m.ga_engagement_rate * 100).toFixed(0)}% engaged</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
