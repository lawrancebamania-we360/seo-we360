"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  CheckCircle2, AlertCircle, XCircle, ExternalLink, Info, Loader2, KeyRound, Save,
  Telescope, Calendar, DollarSign,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveIntegrationConfig } from "@/lib/actions/integrations";
import type { IntegrationInfo } from "@/lib/data/integrations";

const STATUS_META = {
  connected: {
    label: "Connected",
    className: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900",
    icon: CheckCircle2,
  },
  setup_required: {
    label: "Setup required",
    className: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900",
    icon: AlertCircle,
  },
  error: {
    label: "Error",
    className: "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900",
    icon: XCircle,
  },
  disabled: {
    label: "Disabled",
    className: "text-zinc-600 bg-zinc-100 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800",
    icon: XCircle,
  },
} as const;

export function IntegrationsGrid({ integrations }: { integrations: IntegrationInfo[] }) {
  const [active, setActive] = useState<IntegrationInfo | null>(null);
  const [scopeActive, setScopeActive] = useState<IntegrationInfo | null>(null);
  const searchParams = useSearchParams();

  // Auto-open the integration modal when arriving with ?connect=ga4 / ?connect=gsc etc.
  useEffect(() => {
    const provider = searchParams.get("connect");
    if (!provider) return;
    const match = integrations.find((it) => it.provider === provider);
    if (match) setActive(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("connect"), integrations]);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((it, i) => {
          const s = STATUS_META[it.status];
          const Icon = s.icon;
          return (
            <motion.div
              key={it.provider}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="p-5 space-y-3 h-full flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("flex size-11 items-center justify-center rounded-xl text-xl", it.iconBg)}>
                      {it.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{it.name}</div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <Badge className={cn("text-[10px] gap-1", s.className)}>
                          <Icon className="size-3" />
                          {s.label}
                        </Badge>
                        {it.byok && <Badge variant="outline" className="text-[10px]">BYOK</Badge>}
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                  {it.description}
                </p>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button variant="outline" size="xs" onClick={() => setActive(it)} className="flex-1">
                    {it.byok ? <Info className="size-3" /> : <KeyRound className="size-3" />}
                    {it.byok ? "How it works" : it.status === "connected" ? "Manage keys" : "Connect"}
                  </Button>
                  {it.scope && it.scope.length > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setScopeActive(it)}
                      title={`${it.scope.length} capabilities unlocked`}
                      className="gap-1"
                    >
                      <Telescope className="size-3" />
                      <span className="tabular-nums text-[10px] text-muted-foreground">{it.scope.length}</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    render={<a href={it.docsUrl} target="_blank" rel="noreferrer" aria-label="Docs" />}
                  >
                    <ExternalLink className="size-3" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <IntegrationModal integration={active} onClose={() => setActive(null)} />
      <ScopeModal integration={scopeActive} onClose={() => setScopeActive(null)} />
    </>
  );
}

const CADENCE_COLOR: Record<string, string> = {
  "on-kickoff": "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
  "weekly": "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  "monthly": "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  "quarterly": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  "per-request": "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800",
  "on-demand": "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800",
};

function ScopeModal({
  integration,
  onClose,
}: {
  integration: IntegrationInfo | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={integration !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto we360-scroll">
        {integration && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className={cn("flex size-11 items-center justify-center rounded-xl text-xl", integration.iconBg)}>
                  {integration.icon}
                </div>
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    <Telescope className="size-4 text-violet-500" />
                    {integration.name} — Scope
                  </DialogTitle>
                  <DialogDescription className="mt-1">
                    {integration.scope.length} {integration.scope.length === 1 ? "capability" : "capabilities"} unlocked when connected
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-2.5">
              {integration.scope.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-lg border bg-muted/20 p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm leading-snug flex-1">{s.title}</div>
                    <Badge className={cn("text-[9px] gap-1 shrink-0 border", CADENCE_COLOR[s.cadence] ?? CADENCE_COLOR["per-request"])}>
                      <Calendar className="size-2.5" />
                      {s.cadence}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{s.description}</div>
                  {s.costEstimate && (
                    <div className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                      <DollarSign className="size-2.5" />
                      {s.costEstimate}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            <div className="pt-3 border-t flex justify-end gap-2">
              {integration.status !== "connected" && (
                <Badge className="text-[10px] gap-1 mr-auto bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900 border">
                  <AlertCircle className="size-3" />
                  Not connected yet
                </Badge>
              )}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IntegrationModal({
  integration,
  onClose,
}: {
  integration: IntegrationInfo | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={integration !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto we360-scroll">
        {integration && <IntegrationModalContent integration={integration} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function IntegrationModalContent({
  integration,
  onClose,
}: {
  integration: IntegrationInfo;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [config, setConfig] = useState<Record<string, string>>({
    ...integration.config,
  });
  const changed = integration.fields.some(
    (f) => (config[f.key] ?? "") !== (integration.config[f.key] ?? "")
  );

  const save = () => {
    start(async () => {
      try {
        await saveIntegrationConfig(integration.provider, config);
        toast.success(`${integration.name} credentials saved`);
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3 mb-2">
          <div className={cn("flex size-11 items-center justify-center rounded-xl text-xl", integration.iconBg)}>
            {integration.icon}
          </div>
          <div>
            <DialogTitle>{integration.name}</DialogTitle>
            <Badge className={cn("text-[10px] gap-1 mt-1", STATUS_META[integration.status].className)}>
              {STATUS_META[integration.status].label}
            </Badge>
          </div>
        </div>
        <DialogDescription>{integration.description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {integration.byok && (
          <div className="rounded-md border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 p-3 text-xs">
            <div className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Bring your own key</div>
            <p className="text-amber-900 dark:text-amber-200 leading-relaxed">
              We don&apos;t store AI provider keys. Paste your key when you click <strong>Generate article</strong>.
              Opt into remembering it in your browser&apos;s sessionStorage (wiped on tab close).
            </p>
          </div>
        )}

        {integration.fields.length > 0 && (
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Configuration
            </div>
            {integration.fields.map((field) => {
              const envActive = field.envVar && !!process.env[field.envVar];
              return (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>{field.label}</Label>
                    {envActive && <Badge variant="outline" className="text-[9px]">via env</Badge>}
                  </div>
                  {field.type === "textarea" ? (
                    <Textarea
                      value={config[field.key] ?? ""}
                      onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      rows={4}
                      className="font-mono text-xs"
                    />
                  ) : (
                    <Input
                      type={field.type ?? "text"}
                      value={config[field.key] ?? ""}
                      onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                    />
                  )}
                  {field.envVar && (
                    <div className="text-[10px] text-muted-foreground">
                      Also loadable from <code className="font-mono">{field.envVar}</code> env var (env takes precedence if set).
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            {integration.byok ? "How it works" : "How to get your credentials"}
          </div>
          <ol className="space-y-2 text-sm">
            {integration.howToConnect.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex-shrink-0 size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold inline-flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-foreground/90 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <a
          href={integration.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="size-3" />
          Official documentation
        </a>

        {integration.fields.length > 0 && (
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={pending || !changed}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              <Save className="size-3.5" />
              Save credentials
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
