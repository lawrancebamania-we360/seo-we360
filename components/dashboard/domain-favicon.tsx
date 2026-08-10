"use client";

// Brand / competitor logo for an arbitrary domain, with a graceful fallback
// chain - the same "hand us a domain, get the company's logo" idea Gumshoe uses.
// We try each source in order and drop to the next on error:
//   1. Logo.dev  -> the REAL full company logo. Only used if NEXT_PUBLIC_LOGODEV_TOKEN
//                   is set (free publishable pk_ token, safe in the client). This is
//                   Clearbit's official successor - Clearbit's free logo API shut
//                   down Dec 2025. Set the env var and every row upgrades to full
//                   logos with zero code change.
//   2. DuckDuckGo icon svc   -> keyless favicon fallback. (Google's s2 service was
//                   dropped - it served generic globes for many domains.)
//   3. colored initial chip  -> deterministic, so a row is never blank.
// Worst case === a favicon; best case === real brand logos. Logo.dev-first,
// DuckDuckGo-fallback is the single logo chain used everywhere (competitor chips,
// scan results, onboarding) - route new logo UI through this component.
//
// Raw <img> is deliberate: next/image's optimizer is pointless for a sub-1KB icon
// and would need a `remotePatterns` entry per logo host. The scoped lint-disable
// below is the intended, documented exception.

import { useState } from "react";
import { cn } from "@/lib/utils";

// Publishable Logo.dev token (pk_...). Absent -> we simply skip source #1 and use
// the keyless favicon fallbacks. NEXT_PUBLIC_* is inlined into the client bundle.
const LOGODEV_TOKEN = process.env.NEXT_PUBLIC_LOGODEV_TOKEN;

/** Strip scheme / www / path so the logo services get a bare registrable domain. */
function cleanDomain(input: string): string {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/** Stable hue from the domain so a brand's fallback chip color never changes. */
function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// Logo sources, best first. `px` is the desired pixel size (retina-doubled).
// Source #1 (Logo.dev) is included only when a token is configured; fallback=404
// makes unknown domains error so the chain advances to a favicon rather than
// Logo.dev's own monogram.
const SOURCES: ((domain: string, px: number) => string)[] = [
  ...(LOGODEV_TOKEN
    ? [(d: string, px: number) => `https://img.logo.dev/${encodeURIComponent(d)}?token=${LOGODEV_TOKEN}&size=${Math.min(512, px)}&format=png&fallback=404`]
    : []),
  (d: string) => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(d)}.ico`,
];

export function DomainFavicon({
  domain,
  label,
  size = 20,
  rounded = "rounded",
  className,
}: {
  domain: string | null | undefined;
  /** Text to derive the fallback chip's letter + color from when there's no
   *  usable favicon - e.g. a company NAME when we have no domain for it. Defaults
   *  to the domain. Lets a name-only brand (an AI-named competitor) still read as
   *  itself instead of a "?". */
  label?: string;
  size?: number;
  /** Tailwind radius class for the icon/chip (e.g. "rounded", "rounded-md", "rounded-full"). */
  rounded?: string;
  className?: string;
}) {
  // Index into SOURCES; advances on each failed load. >= length -> initials chip.
  const [srcIndex, setSrcIndex] = useState(0);
  const clean = cleanDomain(domain ?? "");
  // Chip text prefers the real domain's first letter, but falls back to `label`
  // (a name) when we have no domain to fetch from.
  const chipText = clean || (label ?? "").trim();
  const letter = chipText.charAt(0).toUpperCase() || "?";

  if (!clean || srcIndex >= SOURCES.length) {
    const hue = hueFor(chipText || letter);
    return (
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          backgroundColor: `hsl(${hue} 55% 45%)`,
          fontSize: Math.max(9, Math.round(size * 0.5)),
        }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center font-semibold leading-none text-white",
          rounded,
          className,
        )}
      >
        {letter}
      </span>
    );
  }

  const px = Math.max(64, Math.round(size * 2));
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external brand logo; next/image optimizer adds nothing and would need a per-host remotePatterns entry
    <img
      // Re-key per source so a failed load doesn't stick when we advance the chain.
      key={srcIndex}
      src={SOURCES[srcIndex](clean, px)}
      width={size}
      height={size}
      loading="lazy"
      alt=""
      aria-hidden
      onError={() => setSrcIndex((i) => i + 1)}
      className={cn("inline-block shrink-0 bg-white object-contain", rounded, className)}
    />
  );
}
