import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Brand type system (see UI_REVAMP_PLAN.md §2).
 *   Display / headings → Space Grotesk  (font-heading)
 *   Body / UI          → IBM Plex Sans  (font-sans, inherited)
 *   Numbers / labels   → IBM Plex Mono  (font-mono)
 *
 * Use these instead of ad-hoc `text-2xl font-bold` / `uppercase tracking-*`
 * so every heading, label and metric stays on the scale.
 */

function H1({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      className={cn(
        "font-heading text-4xl leading-[1.05] font-bold tracking-[-0.02em] text-foreground text-balance sm:text-5xl",
        className
      )}
      {...props}
    />
  )
}

function H2({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "font-heading text-3xl leading-[1.15] font-semibold tracking-[-0.015em] text-foreground",
        className
      )}
      {...props}
    />
  )
}

function H3({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "font-heading text-2xl leading-[1.25] font-semibold tracking-[-0.01em] text-foreground",
        className
      )}
      {...props}
    />
  )
}

function H4({ className, ...props }: React.ComponentProps<"h4">) {
  return (
    <h4
      className={cn(
        "font-heading text-lg leading-snug font-semibold tracking-[-0.005em] text-foreground",
        className
      )}
      {...props}
    />
  )
}

function Lead({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-lg leading-relaxed text-muted-foreground text-pretty", className)}
      {...props}
    />
  )
}

function Text({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm leading-relaxed text-foreground", className)} {...props} />
}

function Small({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-xs text-muted-foreground", className)} {...props} />
}

/**
 * Overline / eyebrow label — Mono 12, uppercase, wide tracking, Slate 400.
 * Replaces the ~131 inline `uppercase tracking-*` label usages.
 */
function Overline({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "font-mono text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase",
        className
      )}
      {...props}
    />
  )
}

/**
 * Metric — the number in a stat. Mono + tabular figures so columns align and
 * digits don't jitter when values animate. Size via className (default 30px).
 */
function Metric({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="metric"
      className={cn(
        "font-mono text-3xl leading-none font-medium tabular-nums text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { H1, H2, H3, H4, Lead, Text, Small, Overline, Metric }
