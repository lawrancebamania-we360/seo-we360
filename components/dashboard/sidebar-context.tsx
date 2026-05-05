"use client";

import { createContext, useContext, useEffect, useState } from "react";

const COOKIE_NAME = "we360.sidebar_collapsed";

interface Ctx {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarCtx = createContext<Ctx | null>(null);

export function SidebarProvider({ children, initialCollapsed = false }: { children: React.ReactNode; initialCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    try {
      const saved = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${COOKIE_NAME}=`))
        ?.split("=")[1];
      if (saved === "1") setCollapsed(true);
      else if (saved === "0") setCollapsed(false);
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed((cur) => {
      const next = !cur;
      try {
        document.cookie = `${COOKIE_NAME}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      } catch {}
      return next;
    });
  };

  return <SidebarCtx.Provider value={{ collapsed, toggle }}>{children}</SidebarCtx.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarCtx);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}
