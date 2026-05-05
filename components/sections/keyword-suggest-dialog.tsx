"use client";

import { useState, useTransition } from "react";
import { Sparkles, KeyRound, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Provider = "claude" | "openai";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  domain: string;
  industry: string;
  projectName?: string;
  supportsMultiLang?: boolean;
  onSuggested: (keywords: string[]) => void;
}

const STORAGE_KEY = "we360.keyword_suggest.key";
const STORAGE_PROVIDER_KEY = "we360.keyword_suggest.provider";

export function KeywordSuggestDialog({
  open, onOpenChange, domain, industry, projectName, supportsMultiLang, onSuggested,
}: Props) {
  const [provider, setProvider] = useState<Provider>(() => {
    if (typeof window === "undefined") return "claude";
    return (sessionStorage.getItem(STORAGE_PROVIDER_KEY) as Provider) || "claude";
  });
  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  });
  const [remember, setRemember] = useState(apiKey.length > 0);
  const [count, setCount] = useState(12);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim().length < 10) {
      toast.error("Paste a valid API key");
      return;
    }
    if (remember) {
      try {
        sessionStorage.setItem(STORAGE_KEY, apiKey);
        sessionStorage.setItem(STORAGE_PROVIDER_KEY, provider);
      } catch { /* ignore */ }
    } else {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch { /* ignore */ }
    }

    start(async () => {
      const t = toast.loading(`Asking ${provider === "claude" ? "Claude" : "OpenAI"} for ${count} keywords...`);
      try {
        const res = await fetch("/api/keywords/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider,
            apiKey: apiKey.trim(),
            domain,
            industry,
            projectName,
            supportsMultiLang: !!supportsMultiLang,
            count,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "unknown error" }));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { keywords: string[] };
        toast.success(
          <span className="inline-flex items-center gap-1">
            <Sparkles className="size-3 text-violet-500" />
            Got {body.keywords.length} keywords — added to the list.
          </span>,
          { id: t, duration: 4000 }
        );
        onSuggested(body.keywords);
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not generate keywords", { id: t });
      }
    });
  };

  const valid = domain.length >= 3 && industry.length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-emerald-500/20 text-violet-700 dark:text-violet-400">
              <Sparkles className="size-4" />
            </div>
            Find keywords with AI
          </DialogTitle>
          <DialogDescription>
            Uses your own Claude or OpenAI key to generate a mix of informational, commercial, and transactional keywords based on the project&apos;s domain + industry.
            The key is used for this request only — never stored on our servers.
          </DialogDescription>
        </DialogHeader>

        {!valid && (
          <div className="rounded-md border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 p-3 text-xs flex items-start gap-2">
            <AlertTriangle className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-amber-900 dark:text-amber-200">
              Fill in the <strong>Domain</strong> and <strong>Industry</strong> fields first — AI needs them for context.
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => v && setProvider(v as Provider)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="claude">Anthropic Claude (claude-opus-4-7)</SelectItem>
                <SelectItem value="openai">OpenAI (gpt-4o)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ks-key" className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" />
              API key
            </Label>
            <Input
              id="ks-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ks-count" className="text-xs">How many keywords</Label>
            <Input
              id="ks-count"
              type="number"
              min={5}
              max={30}
              value={count}
              onChange={(e) => setCount(Math.min(30, Math.max(5, parseInt(e.target.value) || 12)))}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-3.5"
            />
            Remember for this session (stored in browser only, wiped on tab close)
          </label>

          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
            <div><span className="text-muted-foreground">Domain:</span> <span className="font-medium">{domain || "—"}</span></div>
            <div><span className="text-muted-foreground">Industry:</span> <span className="font-medium">{industry || "—"}</span></div>
            {supportsMultiLang && (
              <div className="text-muted-foreground">Multi-language site</div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !valid || apiKey.length < 10} variant="brand">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Generate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
