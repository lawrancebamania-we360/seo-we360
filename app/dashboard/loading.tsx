"use client";

import { motion } from "motion/react";

export default function DashboardLoading() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60svh]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-center gap-4"
      >
        {/* Triple-ring spinner */}
        <div className="relative size-16">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
            className="absolute inset-0"
          >
            <svg viewBox="0 0 64 64" className="w-full h-full">
              <circle cx="32" cy="32" r="28" fill="none" strokeOpacity="0.15" stroke="currentColor" strokeWidth="4" />
              <path
                d="M32 4 a28 28 0 0 1 28 28"
                fill="none"
                stroke="url(#klimbGradient)"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="klimbGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </motion.div>
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 1.8, ease: "linear" }}
            className="absolute inset-2"
          >
            <svg viewBox="0 0 48 48" className="w-full h-full">
              <circle cx="24" cy="24" r="20" fill="none" strokeOpacity="0.1" stroke="currentColor" strokeWidth="3" />
              <path
                d="M24 4 a20 20 0 0 1 0 40"
                fill="none"
                stroke="url(#klimbGradient2)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="klimbGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
          </motion.div>
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.span
              animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
              className="font-bold text-sm bg-gradient-to-br from-[#5B45E0] via-[#7B62FF] to-[#5B45E0] bg-clip-text text-transparent"
            >
              W
            </motion.span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <motion.span
            className="text-sm font-medium text-foreground"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          >
            Loading...
          </motion.span>
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            {["SEO", "·", "we360.ai"].map((w, i) => (
              <motion.span
                key={i}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.6,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
              >
                {w}
              </motion.span>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
