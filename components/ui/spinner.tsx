"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  className?: string;
  label?: string;
}

export function Spinner({ size = 20, className, label }: Props) {
  return (
    <div className={cn("inline-flex items-center gap-2 text-muted-foreground", className)} role="status" aria-label={label ?? "Loading"}>
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
        style={{ width: size, height: size }}
        className="inline-block"
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </motion.span>
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function PulseDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-current"
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}
