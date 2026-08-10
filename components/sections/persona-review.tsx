"use client";

// WS-4: "Review your personas". Surfaces the AI-inferred / user personas (from the
// ai_citation_personas table) with their illustrated avatar + description, and lets
// an owner/admin toggle, edit inline, or add one. Editing flips a persona to
// source='user' server-side so the edit survives a regenerate. Follows the "don't
// overwhelm" rule: shows 4, the rest behind "Show all". Wired into the AI-Visibility
// Setup tab; the same component will serve the onboarding personas step.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Users, Plus, Loader2, Pencil, Check, X, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PersonaAvatar } from "@/components/dashboard/persona-avatar";
import { updatePersona, togglePersona, addPersona } from "@/lib/actions/ai-visibility";
import { unlockPersonasAndExtend } from "@/lib/actions/onboarding-orchestrator";
import type { PersonaRow } from "@/lib/data/personas";

const VISIBLE = 4;

export function PersonaReview({
  projectId,
  personas,
  googleConnected,
  canManage,
}: {
  projectId: string;
  personas: PersonaRow[];
  /** Drives the locked-persona footer: no Google → "Connect to unlock"; connected
   *  with locked personas still present → the C5 "refresh + extend" offer. */
  googleConnected: boolean;
  canManage: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);

  // Nothing to show and can't add -> hide the whole card (members with no personas).
  if (!personas.length && !canManage) return null;

  // Gumshoe lock: 3-of-6 personas are locked for no-Google projects. Show the
  // unlocked ones normally; the locked ones as blurred teasers below.
  const unlocked = personas.filter((p) => !p.locked);
  const locked = personas.filter((p) => p.locked);
  const shown = showAll ? unlocked : unlocked.slice(0, VISIBLE);
  const activeCount = personas.filter((p) => p.active).length;

  // Personas card (comp lines 1485-1514): icon + title + active-count pill,
  // "Add persona" pill, then a responsive card grid with a toggle + Preset/Custom
  // label per persona. Card chrome mirrors the buyer-prompts card so the setup
  // drawer reads as one surface.
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(20,20,40,0.04)] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><Users className="size-4" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h3 className="text-[15.5px] font-bold text-foreground">Your personas</h3>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{activeCount} active</span>
            </div>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              Audience segments AI associates with your brand — how it describes your buyers. Toggle off any that don&apos;t fit; we build prompts around the active ones.
            </p>
          </div>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setAdding((a) => !a)}>
            <Plus className="size-3.5" /> Add persona
          </Button>
        )}
      </div>

      {adding && canManage && <AddPersona projectId={projectId} onDone={() => setAdding(false)} />}

      {!personas.length && !adding && (
        <p className="text-sm text-muted-foreground">No personas yet - they&apos;re inferred when you generate prompts.</p>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
        {shown.map((p) => <PersonaItem key={p.id} projectId={projectId} persona={p} canManage={canManage} />)}
      </div>

      {unlocked.length > VISIBLE && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="text-xs font-medium text-primary hover:underline">
          {showAll ? "Show fewer" : `Show all (${unlocked.length})`}
        </button>
      )}

      {locked.length > 0 && (
        <div className="space-y-2.5 border-t border-border/60 pt-3">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
            {locked.map((p) => <LockedPersonaCard key={p.id} persona={p} />)}
          </div>
          {googleConnected ? (
            canManage ? <UnlockOffer projectId={projectId} count={locked.length} /> : null
          ) : (
            <Link href="/dashboard/integrations?connect=google" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <Lock className="size-3.5" /> Connect Google to unlock these buyers
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// A blurred teaser for a locked persona — the label + description are hidden
// behind a "Locked" chip until the project connects Google (D5).
function LockedPersonaCard({ persona }: { persona: PersonaRow }) {
  return (
    <div className="relative overflow-hidden rounded-lg border p-3">
      <div className="flex gap-3 select-none opacity-70 blur-[3px]">
        <PersonaAvatar label={persona.label} size={36} className="mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-sm font-medium truncate">{persona.label}</div>
          {persona.description && <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{persona.description}</p>}
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/30">
        <span className="inline-flex items-center gap-1 rounded-full border bg-background/90 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <Lock className="size-3" /> Locked
        </span>
      </div>
    </div>
  );
}

// C5: once Google is connected, offer to unlock the remaining buyers + re-run the
// report with real search data — an explicit, credit-costed confirmation (never
// silent). Reuses regeneratePersonas + runAiVisibilityNow under the hood.
function UnlockOffer({ projectId, count }: { projectId: string; count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    const t = toast.loading("Refreshing your buyers + extending your report…");
    try {
      const r = await unlockPersonasAndExtend({ project_id: projectId });
      if (!r.ok) { toast.error(r.error ?? "Couldn't extend your report.", { id: t }); return; }
      toast.success("Done — your report now covers all your buyers.", { id: t });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't extend your report.", { id: t });
    }
  });
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
      <div className="text-sm font-medium">Google&apos;s connected — unlock your other {count} buyer{count === 1 ? "" : "s"}</div>
      <p className="text-xs text-muted-foreground leading-snug">
        Refresh your buyers with real search data and extend your AI report to cover them. Uses ~30 AI credits (a full re-scan).
      </p>
      <Button size="sm" variant="brand" onClick={run} disabled={pending} className="rounded-full">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Refresh + extend report
      </Button>
    </div>
  );
}

function PersonaItem({ projectId, persona, canManage }: { projectId: string; persona: PersonaRow; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(persona.label);
  const [desc, setDesc] = useState(persona.description ?? "");

  const toggle = (active: boolean) => start(async () => {
    const r = await togglePersona({ project_id: projectId, persona_id: persona.id, active });
    if (!r.ok) { toast.error(r.error ?? "Couldn't update"); return; }
    router.refresh();
  });
  const save = () => {
    if (!label.trim()) { toast.error("Persona needs a name."); return; }
    start(async () => {
      const r = await updatePersona({ project_id: projectId, persona_id: persona.id, label: label.trim(), description: desc.trim() });
      if (!r.ok) { toast.error(r.error ?? "Couldn't save"); return; }
      setEditing(false); router.refresh();
    });
  };

  const isCustom = persona.source === "user";
  return (
    <div className={cn("flex gap-3 rounded-xl border border-slate-200 bg-card p-3.5 transition-opacity dark:border-border", !persona.active && "opacity-60")}>
      <PersonaAvatar label={persona.label} size={36} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        {editing ? (
          <div className="space-y-1.5">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-sm" />
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="w-full rounded-md border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
            <div className="flex gap-1.5">
              <Button size="xs" onClick={save} disabled={pending}>{pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Save</Button>
              <Button size="xs" variant="ghost" onClick={() => { setEditing(false); setLabel(persona.label); setDesc(persona.description ?? ""); }}><X className="size-3" /></Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-foreground" title={persona.label}>{persona.label}</span>
              {!isCustom && <Lock className="size-3 shrink-0 text-slate-350" aria-label="Preset persona" />}
              {canManage && (
                <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-slate-300 transition-colors hover:text-foreground" aria-label="Edit persona"><Pencil className="size-3" /></button>
              )}
            </div>
            {persona.description && <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{persona.description}</p>}
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={persona.active} onCheckedChange={toggle} disabled={!canManage || pending} />
              <span className="text-[11.5px] font-semibold text-slate-350">{isCustom ? "Custom" : "Preset"}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AddPersona({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [desc, setDesc] = useState("");
  const save = () => {
    if (!label.trim()) { toast.error("Give the persona a name."); return; }
    start(async () => {
      const r = await addPersona({ project_id: projectId, label: label.trim(), description: desc.trim() || undefined });
      if (!r.ok) { toast.error(r.error ?? "Couldn't add"); return; }
      toast.success("Persona added.");
      onDone(); router.refresh();
    });
  };
  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 space-y-2.5">
      <div className="text-[13px] font-bold text-primary">New custom persona</div>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Persona name (e.g. Ops lead at a 200-person BPO)" className="h-9 bg-card text-sm" />
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="One line on who they are and what they want…" className="w-full rounded-md border border-border bg-card p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onDone}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={pending}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add persona</Button>
      </div>
    </div>
  );
}
