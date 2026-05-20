"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";

// Global loading indicator.
//
// A counter-based context: any number of operations can be "in flight" at
// once; the top progress bar shows while the counter is > 0. Use the
// `useGlobalLoading` hook anywhere — its `run()` wraps a promise so the bar
// shows for the duration of any server action / fetch that has a delay
// (e.g. changing a task owner in Blog Sprint).

interface GlobalLoadingCtx {
  active: boolean;
  begin: () => void;
  end: () => void;
}

const Ctx = createContext<GlobalLoadingCtx | null>(null);

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const begin = useCallback(() => setCount((c) => c + 1), []);
  const end = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);
  return (
    <Ctx.Provider value={{ active: count > 0, begin, end }}>
      {children}
    </Ctx.Provider>
  );
}

// Hook for triggering the global loader. `run(promise)` shows the bar for
// the lifetime of the promise and always clears it (even on rejection).
// `begin`/`end` are exposed for manual control when a promise isn't handy.
export function useGlobalLoading() {
  const ctx = useContext(Ctx);
  const begin = ctx?.begin ?? (() => {});
  const end = ctx?.end ?? (() => {});
  const run = useCallback(
    async <T,>(p: Promise<T>): Promise<T> => {
      begin();
      try {
        return await p;
      } finally {
        end();
      }
    },
    [begin, end],
  );
  return { active: ctx?.active ?? false, begin, end, run };
}

// The visible bar — a thin sliding segment pinned to the very top of the
// viewport, above all dashboard chrome. Indeterminate (we don't know how
// long a server action takes) so it just slides until the work finishes.
export function GlobalLoadingBar() {
  const ctx = useContext(Ctx);
  const active = ctx?.active ?? false;
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[200] h-[3px] overflow-hidden pointer-events-none"
    >
      <AnimatePresence>
        {active && (
          <motion.div
            key="bar"
            className="h-full w-1/3 rounded-full bg-[#5B45E0] shadow-[0_0_8px_rgba(91,69,224,0.6)]"
            initial={{ x: "-110%" }}
            animate={{ x: "420%" }}
            exit={{ opacity: 0 }}
            transition={{
              x: { repeat: Infinity, duration: 1.05, ease: "easeInOut" },
              opacity: { duration: 0.2 },
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
