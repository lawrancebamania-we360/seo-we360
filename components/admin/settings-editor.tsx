"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";

interface Settings {
  trial_enabled: boolean;
  trial_days: number;
  signup_open: boolean;
  maintenance_mode: boolean;
  internal_email_domains: string[];
  updated_at: string;
}

export function SettingsEditor({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [form, setForm] = useState({
    trial_enabled: settings.trial_enabled,
    trial_days: String(settings.trial_days),
    signup_open: settings.signup_open,
    maintenance_mode: settings.maintenance_mode,
    internal_email_domains: settings.internal_email_domains.join(", "),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trial = parseInt(form.trial_days);
    if (isNaN(trial) || trial < 0 || trial > 90) {
      toast.error("Trial days must be 0-90");
      return;
    }
    start(async () => {
      const t = toast.loading("Saving...");
      try {
        const res = await fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            trial_enabled: form.trial_enabled,
            trial_days: trial,
            signup_open: form.signup_open,
            maintenance_mode: form.maintenance_mode,
            internal_email_domains: form.internal_email_domains.split(",").map((s) => s.trim()).filter(Boolean),
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        toast.success("Settings saved", { id: t });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed", { id: t });
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card className="p-5 space-y-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Signup + trial</div>

        <label className="flex items-start gap-3 rounded-md border p-4 cursor-pointer">
          <Switch checked={form.signup_open} onCheckedChange={(v) => setForm({ ...form, signup_open: v })} />
          <div className="flex-1">
            <div className="font-medium text-sm">Public signup open</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              When off, /signup rejects new accounts. Existing users unaffected.
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3 rounded-md border p-4 cursor-pointer">
          <Switch checked={form.trial_enabled} onCheckedChange={(v) => setForm({ ...form, trial_enabled: v })} />
          <div className="flex-1">
            <div className="font-medium text-sm">15-day trial enabled</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              New signups start on the Trial plan (Agency entitlements) for the days below. When
              off, new signups go straight to Hobby.
            </div>
          </div>
        </label>

        <div className="space-y-1.5">
          <Label>Trial duration (days)</Label>
          <Input
            type="number"
            min={0}
            max={90}
            value={form.trial_days}
            onChange={(e) => setForm({ ...form, trial_days: e.target.value })}
            disabled={!form.trial_enabled}
          />
          <p className="text-xs text-muted-foreground">0-90. Takes effect on the next signup.</p>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Internal access</div>
        <div className="space-y-1.5">
          <Label>Email domains auto-assigned to Internal plan</Label>
          <Input
            value={form.internal_email_domains}
            onChange={(e) => setForm({ ...form, internal_email_domains: e.target.value })}
            placeholder="we360.ai, trusted-partner.com"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated list. Anyone signing up with one of these domains skips trial and gets
            unlimited Internal plan. Changes apply to future signups.
          </p>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Maintenance</div>
        <label className="flex items-start gap-3 rounded-md border p-4 cursor-pointer">
          <Switch checked={form.maintenance_mode} onCheckedChange={(v) => setForm({ ...form, maintenance_mode: v })} />
          <div className="flex-1">
            <div className="font-medium text-sm">Maintenance mode</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Displays a banner across the app. Doesn&apos;t block traffic — purely informational for now.
            </div>
          </div>
        </label>
      </Card>

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Clock className="size-3" />
          Last updated {format(new Date(settings.updated_at), "MMM d, yyyy 'at' h:mm a")}
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save settings
        </Button>
      </div>
    </form>
  );
}
