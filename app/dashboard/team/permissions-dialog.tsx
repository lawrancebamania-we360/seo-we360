"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMemberPermissions,
  updateMemberPermissions,
} from "@/lib/actions/team";
import type { Profile, Project, SectionKey } from "@/lib/types/database";

// Section catalog — what shows on each row + which nav route it controls.
// `seo_gaps` is also used as the gate for /dashboard/blog-audit (the closest
// existing section). Update later if we add a dedicated blog_audit section.
const SECTION_ROWS: Array<{ key: SectionKey; label: string; helper?: string }> = [
  { key: "overview",    label: "Overview" },
  { key: "tasks",       label: "Web Tasks" },
  { key: "keywords",    label: "Keywords" },
  { key: "competitors", label: "Competitors" },
  { key: "sprint",      label: "Blog Sprint" },
  { key: "seo_gaps",    label: "Blog audit",  helper: "(also covers SEO gaps)" },
  { key: "wins",        label: "Wins",        helper: "(admin-only by default)" },
  { key: "articles",    label: "Articles" },
  { key: "team",        label: "Team page" },
];

interface SectionPerms {
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_complete: boolean;
  can_delete: boolean;
}

const DEFAULT_PERMS: SectionPerms = {
  can_view: true,
  can_add: false,
  can_edit: false,
  can_complete: false,
  can_delete: false,
};

interface Props {
  member: Profile;
  projects: Project[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PermissionsDialog({ member, projects, open, onOpenChange }: Props) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [perms, setPerms] = useState<Record<string, SectionPerms>>({});
  const [loading, setLoading] = useState(false);
  const [saving, startSave] = useTransition();

  // Load this member's permissions for the chosen project whenever either
  // changes (or the dialog opens).
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    setLoading(true);
    getMemberPermissions(member.id, projectId)
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, SectionPerms> = {};
        for (const row of SECTION_ROWS) {
          const found = rows.find((r) => r.section === row.key);
          next[row.key] = found
            ? {
                can_view: !!found.can_view,
                can_add: !!found.can_add,
                can_edit: !!found.can_edit,
                can_complete: !!found.can_complete,
                can_delete: !!found.can_delete,
              }
            : { ...DEFAULT_PERMS };
        }
        setPerms(next);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, projectId, member.id]);

  const togglePerm = (section: string, field: keyof SectionPerms) => {
    setPerms((prev) => {
      const cur = prev[section] ?? { ...DEFAULT_PERMS };
      const next = { ...cur, [field]: !cur[field] };
      // Disabling can_view should auto-disable everything else (no point
      // letting a user edit something they can't see).
      if (field === "can_view" && !next.can_view) {
        next.can_add = false; next.can_edit = false;
        next.can_complete = false; next.can_delete = false;
      }
      // Enabling any action implies can_view.
      if (field !== "can_view" && next[field]) next.can_view = true;
      return { ...prev, [section]: next };
    });
  };

  const save = () => {
    if (!projectId) return;
    startSave(async () => {
      try {
        await updateMemberPermissions({
          user_id: member.id,
          project_id: projectId,
          section_permissions: perms,
        });
        toast.success(`${member.name}'s permissions updated`);
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const memberOnly = member.role === "member" || member.role === "client";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Permissions — {member.name}</DialogTitle>
          <DialogDescription>
            {memberOnly
              ? "Toggle which sections this member can see and act on. Admins and super-admins always have full access."
              : `${member.name} is an ${member.role.replace("_", " ")} — they automatically have full access to every section. These per-section permissions only apply to members and clients.`}
          </DialogDescription>
        </DialogHeader>

        {memberOnly && (
          <>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Project
              </label>
              <Select value={projectId} onValueChange={(v) => v && setProjectId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) => projects.find((p) => p.id === value)?.name ?? "Select project"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} label={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-[1fr_60px_60px_60px_70px_60px] gap-1 p-2 bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                <div>Section</div>
                <div className="text-center">View</div>
                <div className="text-center">Add</div>
                <div className="text-center">Edit</div>
                <div className="text-center">Complete</div>
                <div className="text-center">Delete</div>
              </div>
              {loading ? (
                <div className="p-6 flex items-center justify-center text-sm text-muted-foreground gap-2">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </div>
              ) : (
                SECTION_ROWS.map((row) => {
                  const cur = perms[row.key] ?? DEFAULT_PERMS;
                  const cellClass = "flex items-center justify-center";
                  return (
                    <div key={row.key} className="grid grid-cols-[1fr_60px_60px_60px_70px_60px] gap-1 items-center px-2 py-2 border-t text-sm">
                      <div className="space-y-0.5">
                        <div className="font-medium">{row.label}</div>
                        {row.helper && <div className="text-[10px] text-muted-foreground">{row.helper}</div>}
                      </div>
                      <div className={cellClass}><Checkbox checked={cur.can_view} onCheckedChange={() => togglePerm(row.key, "can_view")} /></div>
                      <div className={cellClass}><Checkbox checked={cur.can_add} onCheckedChange={() => togglePerm(row.key, "can_add")} /></div>
                      <div className={cellClass}><Checkbox checked={cur.can_edit} onCheckedChange={() => togglePerm(row.key, "can_edit")} /></div>
                      <div className={cellClass}><Checkbox checked={cur.can_complete} onCheckedChange={() => togglePerm(row.key, "can_complete")} /></div>
                      <div className={cellClass}><Checkbox checked={cur.can_delete} onCheckedChange={() => togglePerm(row.key, "can_delete")} /></div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {memberOnly && (
            <Button variant="brand" onClick={save} disabled={loading || saving}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Save permissions
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
