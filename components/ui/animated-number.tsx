"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";

// Counts from 0 up to the target value when the element scrolls into view.
// Respects prefers-reduced-motion by rendering the final value immediately.
//
// Usage:
//   <AnimatedNumber value={1482} />
//   <AnimatedNumber value={42.5} decimals={1} prefix="$" />

interface Props {
  value: number;
  duration?: number;          // ms; default 900
  decimals?: number;          // fractional digits
  prefix?: string;            // e.g. "$"
  suffix?: string;            // e.g. "%"
  className?: string;
  format?: (n: number) => string;   // full override
}

export function AnimatedNumber({
  value, duration = 900, decimals = 0, prefix = "", suffix = "", className, format,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const reduce = useReducedMotion();
  const [displayed, setDisplayed] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView || reduce) {
      setDisplayed(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic — matches BRAND_GUIDELINES motion curve
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplayed(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduce]);

  const formatted = format
    ? format(displayed)
    : displayed.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <span ref={ref} className={className}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
