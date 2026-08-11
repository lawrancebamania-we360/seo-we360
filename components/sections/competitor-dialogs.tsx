"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Trash2, Loader2, Globe, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CompanyLogo } from "@/components/dashboard/company-logo";
import { createCompetitor, deleteCompetitor } from "@/lib/actions/competitors";
import { EXAMPLE_DOMAIN } from "@/lib/example-placeholders";

// A brand target derived ENTIRELY from what the user typed — no fabricated
// "search" results. If the input resolves to a real domain we build the
// homepage URL, a display name from the second-level label, and let CompanyLogo
// fetch the real logo (Logo.dev → favicon → initial). Name-only input can't be
// tracked (we need a site), so Add stays disabled until a domain is present.
type Target = { name: string; domain: string; url: string };

function parseTarget(raw: string): Target | null {
  const q = raw.trim();
  if (!q || /\s/.test(q.replace(/^https?:\/\//i, ""))) return null; // a name with spaces isn't a site
  const candidate = /^https?:\/\//i.test(q) ? q : `https://${q}`;
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (!host.includes(".")) return null;
  const sld = host.split(".").slice(-2, -1)[0] ?? host.split(".")[0];
  const name = sld.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  return { name, domain: host, url: `https://${host}` };
}

export function NewCompetitorDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fetching, setFetching] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [pending, start] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending debounce on unmount (state changes happen in the change
  // handler / timeout callback, never synchronously inside an effect).
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Debounced brand "fetch": settle the derived target ~450ms after typing stops
  // (the logo itself loads over the network via CompanyLogo, so the spinner isn't
  // purely cosmetic — it covers the resolve + logo fetch).
  const onQuery = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value.trim()) {
      setFetching(false);
      setTarget(null);
      return;
    }
    setFetching(true);
    timerRef.current = setTimeout(() => {
      setTarget(parseTarget(value));
      setFetching(false);
    }, 450);
  };

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setQuery("");
    setTarget(null);
    setFetching(false);
  };

  const add = (chosen: Target) => {
    start(async () => {
      try {
        const result = await createCompetitor({
          project_id: projectId,
          name: chosen.name,
          url: chosen.url,
          da: null,
          traffic: null,
          notes: null,
        });
        // Honest hint when Apify isn't wired up: the audit still runs, but the
        // keyword-gap step is skipped.
        if (result && !result.apifyConfigured) {
          toast.success(`Added ${chosen.name}. Site audit running in background.`, {
            description:
              "Apify isn't configured — the keyword-gap step will be skipped. Add APIFY_TOKEN in Vercel env to enable it.",
          });
        } else {
          toast.success(`Added ${chosen.name} — running auto-analysis in background. Refresh in ~30s.`);
        }
        setOpen(false);
        reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add competitor");
      }
    });
  };

  const nameOnly = !!query.trim() && !fetching && !target;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="h-auto rounded-full border-dashed border-slate-300 bg-card px-[15px] py-2 text-[13.5px] font-semibold text-slate-500"
          >
            <Plus className="size-[15px]" />
            Add competitor
          </Button>
        }
      />
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[500px]">
        <div className="flex items-start justify-between gap-3 px-6 pb-1 pt-6">
          <div className="min-w-0">
            <DialogTitle className="font-heading text-lg font-bold text-foreground">Add a competitor</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-slate-400">
              Enter a competitor&rsquo;s website — we&rsquo;ll fetch their brand and start tracking their visibility.
            </DialogDescription>
          </div>
          <DialogClose
            render={
              <button
                type="button"
                aria-label="Close"
                className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-muted text-slate-500 transition-colors hover:bg-slate-150"
              />
            }
          >
            <XIcon className="size-4" />
          </DialogClose>
        </div>

        <form
          className="px-6 pb-6 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (target && !pending) add(target);
          }}
        >
          <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">Competitor URL or name</label>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3">
            <Globe className="size-4 shrink-0 text-slate-400" />
            <input
              autoFocus
              spellCheck={false}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={`e.g. ${EXAMPLE_DOMAIN}`}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-slate-400"
            />
            {fetching && <Loader2 className="size-4 shrink-0 animate-spin text-primary" />}
          </div>

          {fetching && (
            <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-slate-400">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              Fetching brand &amp; logo…
            </div>
          )}

          {!fetching && target && (
            <button
              type="button"
              onClick={() => add(target)}
              disabled={pending}
              className="mt-2 flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <CompanyLogo name={target.name} domain={target.domain} size={28} rounded="rounded-lg" className="shrink-0 ring-1 ring-border" />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-slate-800">{target.name}</span>
                <span className="block truncate font-mono text-[11.5px] text-slate-400">{target.domain}</span>
              </span>
            </button>
          )}

          {nameOnly && (
            <p className="mt-2.5 text-[12.5px] text-slate-400">
              Enter their website (e.g. {EXAMPLE_DOMAIN}) so we can track their visibility.
            </p>
          )}
        </form>

        <div className="flex items-center justify-end gap-2.5 border-t border-slate-150 px-6 py-3.5">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="brand" onClick={() => target && add(target)} disabled={!target || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Add competitor
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCompetitorButton({ competitorId, name }: { competitorId: string; name: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();

  const del = () => {
    start(async () => {
      try {
        await deleteCompetitor(competitorId);
        toast.success(`Removed ${name}`);
        setConfirmOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmOpen(true);
        }}
        aria-label="Delete competitor"
        title="Delete competitor"
        className="shrink-0 text-error-600 hover:bg-error-50 hover:text-error-700 dark:hover:bg-error-950/40 dark:hover:text-error-400"
      >
        <Trash2 className="size-3.5" />
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-error-100 text-error-600 dark:bg-error-950/40 dark:text-error-400">
              <Trash2 className="size-4" />
            </div>
            Remove {name}?
          </DialogTitle>
          <DialogDescription>
            Deletes this competitor and its analysis from the project. You can re-add them any time.
          </DialogDescription>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={del} disabled={pending} className="bg-error-600 text-white hover:bg-error-700">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
