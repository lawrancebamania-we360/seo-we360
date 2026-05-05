"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2, Save, KeyRound, LogOut, User, Pencil, X, CheckCircle2,
  Download, Trash2, AlertTriangle, Shield, Sparkles,
} from "lucide-react";
import { AiModelPicker } from "@/components/sections/ai-model-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { updateProfileName, updatePassword } from "@/lib/actions/profile";
import { signOutAction } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";

export function ProfileForm({ profile }: { profile: Profile & { preferred_ai_model?: string } }) {
  return (
    <div className="space-y-6">
      <AccountCard profile={profile} />
      <AiModelPreferenceCard
        current={(profile.preferred_ai_model as "sonnet" | "opus" | "gpt-4o" | "gpt-4o-mini" | undefined) ?? "sonnet"}
      />
      <PasswordCard />
      <DataRightsCard email={profile.email} />
      <SignOutCard />
      <DangerZoneCard email={profile.email} role={profile.role} />
    </div>
  );
}

function AiModelPreferenceCard({ current }: { current: "sonnet" | "opus" | "gpt-4o" | "gpt-4o-mini" }) {
  const [model, setModel] = useState(current);
  const [pending, start] = useTransition();

  const save = () => {
    if (model === current) return;
    start(async () => {
      const t = toast.loading("Saving preference...");
      try {
        const res = await fetch("/api/profile/preferences", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ preferred_ai_model: model }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        toast.success("Default AI model updated", { id: t });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed", { id: t });
      }
    });
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-violet-500" />
        <div>
          <div className="font-semibold">Default AI model</div>
          <div className="text-sm text-muted-foreground">Used when you don&apos;t pick one explicitly in an AI task.</div>
        </div>
      </div>
      <AiModelPicker value={model} onChange={setModel} />
      {model !== current && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save
          </Button>
        </div>
      )}
    </Card>
  );
}

function AccountCard({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [pending, start] = useTransition();
  const changed = name.trim() !== profile.name && name.trim().length > 0;

  const cancel = () => {
    setName(profile.name);
    setEditing(false);
  };

  const save = () => {
    if (!changed) return;
    start(async () => {
      try {
        await updateProfileName(name.trim());
        toast.success("Username updated");
        setEditing(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <div>
            <div className="font-semibold">Account</div>
            <div className="text-sm text-muted-foreground">Your display name. Email is managed by Supabase Auth.</div>
          </div>
        </div>
        {!editing && (
          <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3" />
            Edit
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Username</Label>
        {editing ? (
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={pending} />
        ) : (
          <div className="h-9 px-3 flex items-center rounded-lg border border-input bg-muted/30 text-sm">
            {profile.name}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Email</Label>
        <div className="h-9 px-3 flex items-center rounded-lg border border-input bg-muted/30 text-sm text-muted-foreground">
          {profile.email}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Role</Label>
        <div>
          <Badge variant="secondary" className="capitalize">{profile.role.replace("_", " ")}</Badge>
        </div>
      </div>

      {editing && (
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={cancel} disabled={pending}>
            <X className="size-3.5" />
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={pending || !changed}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save
          </Button>
        </div>
      )}
    </Card>
  );
}

function PasswordCard() {
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pending, start] = useTransition();

  const valid = pw.length >= 8 && pw === pw2;
  const match = pw.length === 0 || pw === pw2;

  const cancel = () => {
    setPw("");
    setPw2("");
    setEditing(false);
  };

  const save = () => {
    if (!valid) return;
    start(async () => {
      try {
        await updatePassword(pw);
        toast.success("Password updated");
        cancel();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <Card id="password" className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <div>
            <div className="font-semibold">Password</div>
            <div className="text-sm text-muted-foreground">
              Or sign in with Google — no password needed once you do that at least once.
            </div>
          </div>
        </div>
        {!editing && (
          <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3" />
            Change
          </Button>
        )}
      </div>

      {editing && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Min. 8 characters"
                autoFocus
                disabled={pending}
              />
              {pw.length > 0 && pw.length < 8 && (
                <div className="text-xs text-rose-600">At least 8 characters required.</div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Confirm</Label>
              <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} disabled={pending} />
              {!match && pw2.length > 0 && (
                <div className="text-xs text-rose-600">Passwords don&apos;t match.</div>
              )}
              {match && valid && (
                <div className="text-xs text-emerald-600 inline-flex items-center gap-1">
                  <CheckCircle2 className="size-3" />
                  Ready to save
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={cancel} disabled={pending}>
              <X className="size-3.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={pending || !valid}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Update password
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function SignOutCard() {
  return (
    <Card className="p-5 flex items-center justify-between">
      <div>
        <div className="font-semibold">Sign out</div>
        <div className="text-sm text-muted-foreground">End this session on this device.</div>
      </div>
      <form action={signOutAction}>
        <Button type="submit" variant="destructive">
          <LogOut className="size-3.5" />
          Sign out
        </Button>
      </form>
    </Card>
  );
}

// ====================================================================
// Data rights — GDPR Art. 20 (export) + easy on-demand download.
// Art. 17 (delete) lives in the Danger Zone card below.
// ====================================================================
function DataRightsCard({ email }: { email: string }) {
  const [pending, start] = useTransition();

  const downloadExport = () => {
    start(async () => {
      const t = toast.loading("Preparing your data export...");
      try {
        const res = await fetch("/api/profile/export");
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "unknown error" }));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const today = new Date().toISOString().slice(0, 10);
        const safe = email.replace(/[^a-zA-Z0-9._-]/g, "_");
        a.download = `klimb-export-${safe}-${today}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-emerald-500" />
            Export downloaded
          </span>,
          { id: t }
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Export failed", { id: t });
      }
    });
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="size-4 text-muted-foreground" />
        <div>
          <div className="font-semibold">Your data</div>
          <div className="text-sm text-muted-foreground">
            Download everything tied to your account — GDPR Article 20 (data portability).
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
        <div className="font-medium text-foreground">What&apos;s in the export</div>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Your profile + project memberships</li>
          <li>Projects you created, tasks/articles/wins you authored</li>
          <li>Comments + AI artefacts you generated (E-E-A-T reports, topic clusters)</li>
          <li>Audit log entries for your actions</li>
        </ul>
        <div className="pt-1 text-[10px]">
          BYOK AI keys are never stored so they&apos;re not in the export.
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={downloadExport} disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          {pending ? "Preparing..." : "Export my data"}
        </Button>
      </div>
    </Card>
  );
}

// ====================================================================
// Danger Zone — permanent account deletion (GDPR Art. 17).
// Two guardrails: re-type email + explicit confirm dialog.
// ====================================================================
function DangerZoneCard({ email, role }: { email: string; role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();

  const canConfirm = typed.trim().toLowerCase() === email.toLowerCase();

  const confirm = () => {
    if (!canConfirm) return;
    start(async () => {
      const t = toast.loading("Deleting your account...");
      try {
        const res = await fetch("/api/profile/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirm_email: email }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "unknown error" }));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        // Sign out the client-side session so no stale cookies remain
        const supabase = createClient();
        await supabase.auth.signOut();
        toast.success("Account deleted. Redirecting...", { id: t });
        router.replace("/login?error=account_deleted");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed", { id: t });
      }
    });
  };

  return (
    <>
      <Card className="p-5 space-y-4 border-rose-300 dark:border-rose-900">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-rose-500" />
          <div>
            <div className="font-semibold text-rose-700 dark:text-rose-400">Danger zone</div>
            <div className="text-sm text-muted-foreground">
              Permanently delete your account and everything tied to it.
            </div>
          </div>
        </div>

        <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-900 dark:text-rose-200 space-y-1">
          <div className="font-semibold">This is permanent.</div>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Your profile, memberships, and authored content will be deleted</li>
            <li>Projects you own cascade-delete (tasks, articles, audit data all gone)</li>
            <li>Hard-removed from backups after 30 days</li>
          </ul>
          {role === "super_admin" && (
            <div className="pt-1 font-medium">
              You&apos;re a super admin — if you&apos;re the only one, promote another teammate before deleting.
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => { setTyped(""); setOpen(true); }}
          >
            <Trash2 className="size-3.5" />
            Delete my account
          </Button>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { if (!pending) setOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="size-4" />
              </div>
              Delete your account?
            </DialogTitle>
            <DialogDescription>
              This will <strong className="text-rose-600 dark:text-rose-400">permanently delete</strong> your
              account. Projects you own will cascade-delete with it. You can&apos;t undo this.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="confirm-email">Type your email to confirm</Label>
            <Input
              id="confirm-email"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={email}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">Must match exactly: <span className="font-mono">{email}</span></p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={!canConfirm || pending} onClick={confirm}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              {pending ? "Deleting..." : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
