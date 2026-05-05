"use client";

import { useState, useTransition } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { inviteTeamMember } from "@/lib/actions/team";
import { ALL_SECTIONS, SECTION_LABELS } from "@/lib/auth/permissions";
import type { Project, SectionKey } from "@/lib/types/database";

interface Props {
  projects: Project[];
  canInviteAdmin: boolean;
}

type PermState = {
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_complete: boolean;
  can_delete: boolean;
};

const DEFAULT_PERM: PermState = { can_view: true, can_add: false, can_edit: false, can_complete: false, can_delete: false };

export function InviteDialog({ projects, canInviteAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"super_admin" | "admin" | "member" | "client">("member");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [perms, setPerms] = useState<Record<string, PermState>>(() =>
    Object.fromEntries(ALL_SECTIONS.map((s) => [s, { ...DEFAULT_PERM }]))
  );

  const toggleProject = (id: string) => {
    setProjectIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const setPerm = (section: SectionKey, key: keyof PermState, value: boolean) => {
    setPerms((cur) => ({ ...cur, [section]: { ...cur[section], [key]: value } }));
  };

  const setSectionEnabled = (section: SectionKey, enabled: boolean) => {
    setPerms((cur) => ({
      ...cur,
      [section]: enabled ? { ...DEFAULT_PERM, can_view: true } : { can_view: false, can_add: false, can_edit: false, can_complete: false, can_delete: false },
    }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        const enabledPerms = Object.fromEntries(
          Object.entries(perms).filter(([, p]) => p.can_view)
        );
        await inviteTeamMember({
          email,
          name,
          role,
          project_ids: (role === "member" || role === "client") ? projectIds : [],
          section_permissions: enabledPerms,
        });
        toast.success(`Invite sent to ${email}. A password-reset email is on the way.`);
        setOpen(false);
        setEmail(""); setName(""); setProjectIds([]);
        setPerms(Object.fromEntries(ALL_SECTIONS.map((s) => [s, { ...DEFAULT_PERM }])));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Invite failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><UserPlus className="size-4" />Invite</Button>} />
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            They&apos;ll receive an email to set their password. They can also sign in with Google after first login.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => v && setRole(v as typeof role)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member — agency team, assignable to tasks</SelectItem>
                <SelectItem value="client">Client — project stakeholder, NOT assigned to tasks</SelectItem>
                {canInviteAdmin && <SelectItem value="admin">Admin — full access across all projects</SelectItem>}
                {canInviteAdmin && <SelectItem value="super_admin">Super Admin — can manage other admins</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {(role === "member" || role === "client") && (
            <>
              <div className="space-y-2">
                <Label>Project access</Label>
                <div className="rounded-lg border p-3 space-y-2 max-h-40 overflow-y-auto">
                  {projects.length === 0 && (
                    <div className="text-sm text-muted-foreground">No projects yet.</div>
                  )}
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={projectIds.includes(p.id)}
                        onCheckedChange={() => toggleProject(p.id)}
                      />
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.domain}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Section permissions</Label>
                <div className="rounded-lg border divide-y">
                  {ALL_SECTIONS.map((s) => {
                    const p = perms[s];
                    const enabled = p.can_view;
                    return (
                      <div key={s} className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium">{SECTION_LABELS[s]}</div>
                          <Switch
                            checked={enabled}
                            onCheckedChange={(v) => setSectionEnabled(s, v)}
                          />
                        </div>
                        {enabled && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mt-2">
                            {(["can_add", "can_edit", "can_complete", "can_delete"] as const).map((k) => (
                              <label key={k} className="flex items-center gap-1.5">
                                <Checkbox
                                  checked={p[k]}
                                  onCheckedChange={(v) => setPerm(s, k, Boolean(v))}
                                />
                                <span className="capitalize">{k.replace("can_", "")}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
