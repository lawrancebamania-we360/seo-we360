"use client";

// "Connect with Google" card for the Integrations page. One global OAuth grant
// (GA4 + GSC), then pick which property + site the active project reads. Replaces
// the paste-a-service-account-JSON flow and the Composio broker.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plug, RefreshCw, Unlink, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listAvailableProperties,
  saveProjectProperties,
  disconnectGoogle,
} from "@/lib/actions/google-onboarding";
import type { Ga4PropertyOption, GscSiteOption } from "@/lib/google/list-properties";

interface Props {
  connected: boolean;
  email: string | null;
  currentGa4: string | null;
  currentGsc: string | null;
  activeProjectName: string | null;
}

const selectClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";

export function GoogleConnectCard({ connected, email, currentGa4, currentGsc, activeProjectName }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [ga4, setGa4] = useState<Ga4PropertyOption[]>([]);
  const [gsc, setGsc] = useState<GscSiteOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selGa4, setSelGa4] = useState(currentGa4 ?? "");
  const [selGsc, setSelGsc] = useState(currentGsc ?? "");
  const [saving, startSaving] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const toastedFor = useRef<string | null>(null);

  // Turn the ?google=<status> flag from the OAuth callback into a toast, once.
  useEffect(() => {
    const status = searchParams.get("google");
    if (!status || toastedFor.current === status) return;
    toastedFor.current = status;
    if (status === "connected") toast.success("Google connected");
    else if (status.startsWith("error:")) toast.error(`Google connect failed: ${decodeURIComponent(status.slice(6))}`);
    // Strip the param so a refresh doesn't re-toast.
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("google");
    router.replace(sp.toString() ? `/dashboard/integrations?${sp}` : "/dashboard/integrations");
  }, [searchParams, router]);

  const loadProps = () => {
    setLoading(true);
    setLoadError(null);
    listAvailableProperties()
      .then((res) => {
        setGa4(res.ga4);
        setGsc(res.gsc);
        setLoadError(res.error);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  // Auto-load the pickable properties once when connected.
  useEffect(() => {
    if (connected) loadProps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const save = () => {
    startSaving(async () => {
      try {
        await saveProjectProperties({ ga4PropertyId: selGa4 || undefined, gscSiteUrl: selGsc || undefined });
        toast.success("Saved to " + (activeProjectName ?? "project"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const disconnect = () => {
    startDisconnect(async () => {
      try {
        await disconnectGoogle();
        toast.success("Google disconnected");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Disconnect failed");
      }
    });
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-500/15 text-blue-700 dark:text-blue-300">
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
              <path fill="currentColor" d="M12 11v2h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l1.6-1.6C16.7 3.9 14.6 3 12 3 7 3 3 7 3 12s4 9 9 9c5.2 0 8.6-3.7 8.6-8.8 0-.6-.1-1-.2-1.2H12Z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-semibold text-foreground">Google Analytics + Search Console</h3>
              {connected ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
                  Not connected
                </span>
              )}
            </div>
            <p className="mt-0.5 max-w-xl text-[13px] text-muted-foreground">
              Connect once with Google — reads GA4 + GSC as your account, so no service-account email needs adding to each property.
              {connected && email ? <> Connected as <span className="font-medium text-foreground">{email}</span>.</> : null}
            </p>
          </div>
        </div>

        {!connected ? (
          <a href="/api/oauth/google/start" className={cn(buttonVariants(), "gap-2")}>
            <Plug className="size-4" /> Connect with Google
          </a>
        ) : (
          <div className="flex items-center gap-2">
            <a
              href="/api/oauth/google/start"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <RefreshCw className="size-3.5" /> Reconnect
            </a>
            <Button variant="outline" size="sm" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="size-3.5 animate-spin" /> : <Unlink className="size-3.5" />} Disconnect
            </Button>
          </div>
        )}
      </div>

      {connected && (
        <div className="mt-5 border-t border-border pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-foreground">
              Assign to <span className="text-primary">{activeProjectName ?? "active project"}</span>
            </p>
            <Button variant="ghost" size="sm" onClick={loadProps} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh list
            </Button>
          </div>

          {loadError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400">
              Couldn&apos;t list properties: {loadError}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  GA4 property
                </label>
                <select
                  className={selectClass}
                  value={selGa4}
                  onChange={(e) => setSelGa4(e.target.value)}
                  disabled={loading}
                >
                  <option value="">— select a property —</option>
                  {ga4.map((p) => (
                    <option key={p.propertyId} value={p.propertyId}>
                      {p.displayName} ({p.propertyId}){p.account ? ` · ${p.account}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  GSC site
                </label>
                <select
                  className={selectClass}
                  value={selGsc}
                  onChange={(e) => setSelGsc(e.target.value)}
                  disabled={loading}
                >
                  <option value="">— select a site —</option>
                  {gsc.map((s) => (
                    <option key={s.siteUrl} value={s.siteUrl}>
                      {s.siteUrl}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={save} disabled={saving || (!selGa4 && !selGsc)} size="sm">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save selection
            </Button>
            {(currentGa4 || currentGsc) && (
              <span className={cn("text-[12px] text-muted-foreground")}>
                Current: GA4 {currentGa4 ?? "—"} · GSC {currentGsc ?? "—"}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
