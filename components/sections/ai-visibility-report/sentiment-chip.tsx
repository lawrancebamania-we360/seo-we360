"use client";

// Brand-sentiment tier chip (feature 2). Rendered on answer rows in the Answers
// tab and inside the evidence drawer. Kept context-free (no useEvidence import)
// so the drawer can use it without an import cycle.

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SENTIMENT_LABEL, type BrandSentiment } from "@/lib/ai-citation/trust";

export const SENTIMENT_TONE: Record<BrandSentiment, string> = {
  recommended: "bg-success-500/15 text-success-700 dark:text-success-400",
  with_caveats: "bg-warning-500/15 text-warning-700 dark:text-warning-400",
  dismissed: "bg-error-500/15 text-error-700 dark:text-error-400",
};

export function SentimentChip({ sentiment, mentioned, classifying, className }: {
  sentiment: BrandSentiment | null;
  mentioned: boolean;
  /** True while the lazy classification pass runs - unclassified chips shimmer. */
  classifying?: boolean;
  className?: string;
}) {
  // Sentiment only exists relative to a brand mention.
  if (!mentioned) return null;
  if (sentiment) {
    return (
      <span
        className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", SENTIMENT_TONE[sentiment], className)}
        title="How this answer talks about your brand, classified from the transcript."
      >
        {SENTIMENT_LABEL[sentiment]}
      </span>
    );
  }
  if (classifying) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground animate-pulse", className)}>
        <Loader2 className="size-3 animate-spin" /> Classifying...
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground/80", className)}
      title="This mention has not been classified yet. It happens automatically when an owner or admin opens the report.">
      Tone pending
    </span>
  );
}
