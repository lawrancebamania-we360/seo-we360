import { ShieldCheck, Lock, Award, EyeOff } from "lucide-react";
import { BrandMark } from "./brand-mark";

// Single-panel sign-in shell. Internal dashboard — no signup toggle, no promo.
// The right panel shows trust badges so the empty space feels intentional.

const BADGES = [
  { icon: ShieldCheck, label: "Internal access only",    sub: "@we360.ai Google accounts" },
  { icon: Lock,        label: "Encrypted end-to-end",     sub: "TLS 1.3 · AES-256 at rest" },
  { icon: Award,       label: "Supabase + Vercel backed", sub: "SOC 2 infrastructure" },
  { icon: EyeOff,      label: "BYOK AI keys",             sub: "Never stored server-side" },
];

interface Props {
  mode?: "signin";
  children: React.ReactNode;
}

export function AuthShell({ children }: Props) {
  return (
    <div className="min-h-svh relative overflow-hidden bg-[#F8FAFC] dark:bg-[#070127]">
      {/* Ambient brand-colored wash */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 size-[520px] rounded-full bg-[#7B62FF]/15 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 size-[520px] rounded-full bg-[#5B45E0]/15 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 size-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FEB800]/10 blur-3xl" />
      </div>

      <div className="relative z-10 grid min-h-svh lg:grid-cols-2">
        {/* FORM PANEL */}
        <div className="flex flex-col items-center justify-center p-6 md:p-10 order-2 lg:order-1">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <BrandMark />
            </div>
            {children}
          </div>
        </div>

        {/* PROMO PANEL */}
        <aside className="relative hidden lg:flex lg:items-center lg:justify-center text-white overflow-hidden order-1 lg:order-2">
          <div className="absolute inset-4 rounded-3xl bg-gradient-to-br from-[#5B45E0] via-[#7B62FF] to-[#5B45E0] shadow-2xl shadow-[#5B45E0]/30" />
          <div className="absolute inset-4 rounded-3xl bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.08),transparent_50%)]" />

          <div className="relative z-10 flex flex-col items-center text-center p-10 max-w-md space-y-8">
            <div className="space-y-4">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                we360.ai SEO
              </h2>
              <p className="text-white/80 text-base leading-relaxed">
                Internal 5-pillar SEO command dashboard — SEO · AEO · GEO · SXO · AIO — for the
                we360.ai team only.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-5 pt-6 w-full">
              {BADGES.map((b) => (
                <div key={b.label} className="flex flex-col items-center gap-2 text-center">
                  <div className="flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur ring-1 ring-white/20">
                    <b.icon className="size-4" />
                  </div>
                  <div className="text-xs font-semibold leading-snug">{b.label}</div>
                  <div className="text-[10px] text-white/70 leading-snug -mt-1">{b.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export type AuthShellMode = "signin";
