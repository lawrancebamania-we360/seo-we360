"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Input } from "@/components/ui/input";

interface Props {
  placeholder?: string;
}

export function TaskSearch({ placeholder = "Search tasks..." }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(params.get("q") ?? "");

  // Debounce — push to URL 250ms after user stops typing
  useEffect(() => {
    const initial = params.get("q") ?? "";
    if (value === initial) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
  }, [value, params, router]);

  // Resync if URL changes externally (e.g. clear all filters)
  useEffect(() => {
    const urlQ = params.get("q") ?? "";
    if (urlQ !== value) setValue(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("q")]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="relative"
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-9 pr-9 w-full max-w-md"
      />
      <AnimatePresence>
        {value && (
          <motion.button
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            onClick={() => setValue("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
