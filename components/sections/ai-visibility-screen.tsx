"use client";

// AI Visibility — UI v2 (presentational, mock data). Engine chips + key modal,
// hero band, and Overview / Breakdowns / Answers / Sources sub-tabs (theme
// chips, by-topic bars, model coverage, funnel matrix, 3-mode heatmap, answer
// cards, cited sources + outreach). Real runs + engine keys stitched later.

import * as React from "react";
import { CheckIcon, KeyIcon, LockIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Overline } from "@/components/ui/typography";
import { AiVisibilityHeroBand, type AiVisibilityHeroStat } from "@/components/ui/ai-visibility-hero-band";
import { HeatCell, heatTierFromPct } from "@/components/ui/heat-cell";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const ENGINES = [
  { name: "ChatGPT", provider: "OpenAI", state: "connected" },
  { name: "Claude", provider: "Anthropic", state: "add key" },
  { name: "Perplexity", provider: "Perplexity", state: "add key" },
  { name: "Google AI Overviews", provider: "Apify", state: "weekly" },
];
// Hero stat cluster — the comp's 2×2 (design lines 3515-3519). The ring shows
// the same score; the top-left cell repeats it, exactly like the comp.
const HERO_STATS: AiVisibilityHeroStat[] = [
  { label: "AI visibility", value: "59", suffix: "/100", sub: "directional, sampled" },
  { label: "Cited", value: "25%", sub: "AI used your site as a source" },
  { label: "Mentioned", value: "89%", sub: "AI named your brand" },
  { label: "Answers checked", value: "36", sub: "12 prompts, sampled" },
];
const THEMES = [["online booking", true], ["tandem jumps", true], ["near Delhi", true], ["safety record", true], ["premium pricing", false], ["limited dates", false]] as const;
const BY_TOPIC = [["Online booking", 100], ["Pricing & cost", 100], ["Skydiving in India", 100], ["Safety & reputation", 100], ["Best places to jump", 83], ["Tandem vs solo", 67], ["First-time jumps", 67]] as const;
const MODELS = [["ChatGPT", "GPT-4o", 89, true], ["Claude", "Add key to compare", 0, false], ["Perplexity", "Add key to compare", 0, false], ["Google AI Overviews", "Runs weekly", 0, false]] as const;
const FUNNEL_COLS = ["Awareness", "Consideration", "Decision", "Trust"];
const FUNNEL = [
  ["Local Adventure Seeker", [83, null, null, null]], ["Group Travel Organizer", [100, null, null, null]],
  ["Travel Blogger", [67, 100, null, null]], ["Thrill-seeker", [100, 33, null, null]],
  ["Price-Conscious Tourist", [100, null, null, null]], ["Reputation Checker", [null, null, null, 100]],
] as const;
const HEAT_BRANDS = ["Skyhigh", "Skydive India", "Flying Fox", "Jumpin Heights", "Skyriders"];
const HEAT_PERSONAS = ["Local Seeker", "Group Organizer", "Travel Blogger", "Thrill-seeker", "Price Tourist"];
const ANSWERS = [
  { model: "ChatGPT", persona: "Local Adventure Seeker", rank: 1, cited: true, rec: true, q: "any skydiving providers in India with online booking?", a: "Several reputable providers offer online booking — Skyhigh India (Narnaul, near Delhi) operates India's only dedicated drop zone…" },
  { model: "ChatGPT", persona: "Price-Conscious Tourist", rank: 0, cited: false, rec: false, q: "how much does tandem skydiving cost in India?", a: "Tandem skydiving in India typically ranges from ₹27,000 to ₹40,000 depending on location and media add-ons…" },
];
const SOURCES = [["skydiveinasia.com", 37, false], ["skydiveguides.com", 24, false], ["skyhighindia.com (you)", 19, true], ["skydives.in", 16, false], ["reddit.com", 8, false]] as const;

function funnelTint(v: number | null) {
  if (v == null) return { bg: "var(--color-slate-100)", fg: "var(--color-slate-300)", t: "–" };
  const tier = heatTierFromPct(v);
  return { bg: `var(--heat-${tier}-bg)`, fg: `var(--heat-${tier}-fg)`, t: v + "%" };
}

export function AiVisibilityScreen() {
  const [tab, setTab] = React.useState<"overview" | "breakdowns" | "answers" | "sources">("overview");
  const [keyOpen, setKeyOpen] = React.useState<string | null>(null);
  const TABS = [["overview", "Overview"], ["breakdowns", "Breakdowns"], ["answers", "Sample answers"], ["sources", "Citation sources"]] as const;

  // Per-engine copy for the key modal (comp 1537-1542): provider subtitle,
  // mono-input placeholder, and an honest note (Google AI is a managed weekly
  // pass, so it needs no key).
  const keyMeta = React.useMemo(() => {
    const e = ENGINES.find((x) => x.name === keyOpen);
    const placeholder = keyOpen === "ChatGPT" ? "sk-…" : keyOpen === "Claude" ? "sk-ant-api03-…" : keyOpen === "Perplexity" ? "pplx-…" : "Managed via Apify — no key needed";
    const note = keyOpen === "Google AI Overviews"
      ? "Google AI Overviews run on a weekly managed pass — no key required."
      : `Paste your ${e?.provider ?? ""} key so we can run citation tests on ${keyOpen}. Used only for your checks.`;
    return { provider: e?.provider ?? "", placeholder, note };
  }, [keyOpen]);

  return (
    <div className="space-y-6 p-6 lg:px-10 lg:pt-8">
      <div>
        <h1 className="font-heading text-4xl leading-tight font-bold tracking-tight text-foreground sm:text-5xl">AI Visibility</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">See whether ChatGPT, Claude, Perplexity and Google AI recommend you for the questions your buyers ask.</p>
      </div>

      {/* Engine chips (comp lines 1284-1285) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">Engines:</span>
        {ENGINES.map((e) => {
          const on = e.state === "connected";
          return (
            <button key={e.name} onClick={() => setKeyOpen(e.name)}
              className={cn("inline-flex items-center gap-2 rounded-full border px-[13px] py-1.5 text-[13px] font-semibold transition-colors", on ? "border-success/25 bg-success/10 text-success-strong" : "border-border bg-card text-muted-foreground hover:bg-muted")}>
              <span className={cn("size-2 rounded-full", on ? "bg-success" : "bg-slate-300")} />
              {e.name}
              <span className={cn("text-xs font-medium", e.state === "add key" ? "text-primary" : "text-muted-foreground")}>{on ? "connected" : e.state}</span>
            </button>
          );
        })}
      </div>

      {/* Brand-visibility hero band (comp lines 1314-1326) */}
      <AiVisibilityHeroBand
        score={59}
        headline="You're mentioned often, but rarely cited."
        detail={<>AI names <strong className="font-bold text-white">Skyhigh India</strong> in 89% of answers but only pulls your site as a source 25% of the time — that gap is your opportunity.</>}
        stats={HERO_STATS}
      />

      {/* Sub-tabs (comp line 1295) */}
      <div className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-1">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-[10px] px-[18px] py-[9px] text-sm font-semibold transition-all", tab === k ? "bg-card text-foreground shadow-[0_1px_3px_rgba(20,20,40,0.12)]" : "text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-6">
            <Overline className="mb-3">Themes AI associates with you</Overline>
            <div className="flex flex-wrap gap-2">
              {THEMES.map(([t, pos]) => (
                <span key={t} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", pos ? "bg-success/10 text-success-strong" : "bg-error/10 text-error-strong")}>
                  <span className={cn("size-1.5 rounded-full", pos ? "bg-success" : "bg-error")} />{t}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-6">
              <Overline className="mb-4">Coverage by topic</Overline>
              <div className="space-y-3">
                {BY_TOPIC.map(([label, pct]) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-sm text-foreground">{label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-success to-success-700" style={{ width: `${pct}%` }} /></div>
                    <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <Overline className="mb-4">Model coverage</Overline>
              <div className="space-y-3">
                {MODELS.map(([name, sub, pct, on]) => (
                  <div key={name} className={cn("flex items-center gap-3", !on && "opacity-55")}>
                    <div className="w-40 shrink-0"><div className="text-sm font-semibold text-foreground">{name}</div><div className="text-[0.6875rem] text-muted-foreground">{sub}</div></div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">{on && <div className="h-full rounded-full bg-gradient-to-r from-success to-success-700" style={{ width: `${pct}%` }} />}</div>
                    <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{on ? pct + "%" : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card p-6">
            <Overline className="mb-4">Persona × funnel stage</Overline>
            <div className="grid min-w-[640px] gap-2" style={{ gridTemplateColumns: `minmax(160px,1.3fr) repeat(4,1fr)` }}>
              <div />
              {FUNNEL_COLS.map((c) => <Overline key={c} className="text-center">{c}</Overline>)}
              {FUNNEL.map(([persona, cells]) => (
                <React.Fragment key={persona}>
                  <span className="flex items-center text-sm font-medium text-foreground">{persona}</span>
                  {cells.map((v, i) => { const t = funnelTint(v); return <span key={i} className="flex items-center justify-center rounded-lg py-3.5 text-sm font-bold" style={{ backgroundColor: t.bg, color: t.fg }}>{t.t}</span>; })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "breakdowns" && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card p-6">
          <Overline className="mb-4">Persona × competitor heatmap</Overline>
          <div className="grid min-w-[720px] gap-2" style={{ gridTemplateColumns: `minmax(150px,1.3fr) repeat(${HEAT_BRANDS.length},1fr)` }}>
            <div />
            {HEAT_BRANDS.map((b) => <Overline key={b} className="text-center">{b}</Overline>)}
            {HEAT_PERSONAS.map((p, r) => (
              <React.Fragment key={p}>
                <span className="flex items-center text-sm font-medium text-foreground">{p}</span>
                {HEAT_BRANDS.map((_, c) => { const pct = Math.round(((((r + 2) * (c + 3) * 7) % 15) + 1) / 20 * 100); return <HeatCell key={c} pct={pct} className="flex-col gap-0.5 py-3"><span className="text-sm font-extrabold">{pct}%</span></HeatCell>; })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {tab === "answers" && (
        <div className="space-y-3">
          {ANSWERS.map((a, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                {[a.model, a.persona].map((p) => <span key={p} className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-slate-600">{p}</span>)}
                {a.rank > 0 ? <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success-strong">Mentioned #{a.rank}</span> : <span className="rounded-full bg-error/10 px-2.5 py-1 text-xs font-semibold text-error-strong">Not mentioned</span>}
                {a.cited && <span className="rounded-full bg-ember-50 px-2.5 py-1 text-xs font-semibold text-ember-700">Cited</span>}
                {a.rec && <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success-strong">Recommended</span>}
              </div>
              <div className="mt-3 text-sm font-semibold text-foreground">{a.q}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{a.a}</p>
              {!a.cited && <button className="mt-3 inline-flex items-center gap-1 rounded-lg bg-ember-50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-ember-100">Get cited</button>}
            </div>
          ))}
        </div>
      )}

      {tab === "sources" && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <Overline className="mb-4">Domains AI cites</Overline>
          <div className="space-y-3">
            {SOURCES.map(([d, c, you]) => (
              <div key={d} className="flex items-center gap-3">
                <span className={cn("w-56 shrink-0 truncate text-sm", you ? "font-bold text-ember-700" : "font-medium text-foreground")}>{d}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(c / 37) * 100}%`, backgroundColor: you ? "var(--color-warning)" : "var(--color-violet-chart)" }} /></div>
                <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API key modal (comp lines 1532-1550): engine logo + Connect {name} +
          "{provider} API key" subtitle, a mono key input with a per-engine
          placeholder, the encryption reassurance, then Cancel / Save & connect. */}
      <Dialog open={!!keyOpen} onOpenChange={() => setKeyOpen(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary"><KeyIcon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[17px] leading-tight">Connect {keyOpen}</DialogTitle>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">{keyMeta.provider} API key</p>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">{keyMeta.note}</p>
            <div className="space-y-1.5">
              <label className="block text-[12.5px] font-semibold text-slate-600">API key</label>
              <Input className="bg-slate-50 font-mono text-[13.5px]" placeholder={keyMeta.placeholder} spellCheck={false} />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><LockIcon className="size-3.5 shrink-0" /> Encrypted at rest · never shared</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyOpen(null)}>Cancel</Button>
            <Button variant="brand" onClick={() => setKeyOpen(null)}><CheckIcon /> Save &amp; connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
