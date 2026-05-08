"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, FileText, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// ---------------------------------------------------------------- Access levels
//
// We collapse the 5 underlying booleans (view / add / edit / complete / delete)
// into 4 access levels because admins almost never want to grant a partial
// combination. The 5-checkbox grid was confusing — most rows ended up either
// "all off", "view-only", or "everything except delete". A 4-state picker
// reflects the actual mental model.

type Level = "none" | "view" | "edit" | "full";

interface SectionPerms {
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_complete: boolean;
  can_delete: boolean;
}

const LEVEL_TO_PERMS: Record<Level, SectionPerms> = {
  none: { can_view: false, can_add: false, can_edit: false, can_complete: false, can_delete: false },
  view: { can_view: true,  can_add: false, can_edit: false, can_complete: false, can_delete: false },
  edit: { can_view: true,  can_add: true,  can_edit: true,  can_complete: true,  can_delete: false },
  full: { can_view: true,  can_add: true,  can_edit: true,  can_complete: true,  can_delete: true  },
};

function permsToLevel(p: SectionPerms): Level {
  if (p.can_delete) return "full";
  if (p.can_add || p.can_edit || p.can_complete) return "edit";
  if (p.can_view) return "view";
  return "none";
}

// ---------------------------------------------------------------- Section catalog
//
// Sections are grouped so admins can scan related rows together. Group order:
//   1. Content   — where writers do daily work (most members live here)
//   2. Strategy  — analyst dashboards (usually view-only for members)
//   3. Admin     — system surfaces (off for most members)

interface SectionRow {
  key: SectionKey;
  label: string;
  helper?: string;
}

interface SectionGroup {
  id: string;
  label: string;
  hint: string;
  icon: typeof FileText;
  rows: SectionRow[];
}

const GROUPS: SectionGroup[] = [
  {
    id: "content",
    label: "Content",
    hint: "What writers and editors interact with day to day.",
    icon: FileText,
    rows: [
      { key: "sprint",   label: "Blog Sprint",  helper: "Kanban for blog and page tasks." },
      { key: "articles", label: "Articles",     helper: "AI-drafted articles editor." },
      { key: "seo_gaps", label: "Blog audit",   helper: "GSC + GA4 prune / merge / refresh decisions." },
    ],
  },
  {
    id: "strategy",
    label: "Strategy",
    hint: "Analyst-style dashboards. Most members stay at View.",
    icon: BarChart3,
    rows: [
      { key: "overview",    label: "Overview" },
      { key: "tasks",       label: "Web Tasks" },
      { key: "keywords",    label: "Keywords" },
      { key: "competitors", label: "Competitors" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    hint: "Off by default for members. Turn on per-row only when needed.",
    icon: ShieldCheck,
    rows: [
      { key: "wins", label: "Wins" },
      { key: "team", label: "Team page" },
    ],
  },
];

const ALL_SECTION_KEYS = GROUPS.flatMap((g) => g.rows.map((r) => r.key));

// ---------------------------------------------------------------- Presets
//
// Common role shapes. "Writer" matches what Lokesh/Rahul/Ishika/Ishaan
// actually need (work in Sprint, see overview context, nothing else).
// "Editor" steps that up to a senior writer who can also touch Web Tasks.

interface Preset {
  id: string;
  label: string;
  description: string;
  apply: () => Record<SectionKey, Level>;
}

function preset(label: string, description: string, levels: Partial<Record<SectionKey, Level>>): Preset {
  return {
    id: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    description,
    apply: () => {
      const out = {} as Record<SectionKey, Level>;
      for (const k of ALL_SECTION_KEYS) out[k] = levels[k] ?? "none";
      return out;
    },
  };
}

const PRESETS: Preset[] = [
  preset("Writer", "Sprint + Articles editing only.", {
    sprint: "edit",
    articles: "edit",
  }),
  preset("Editor", "Full Sprint, plus Tasks and Blog audit access.", {
    sprint: "full",
    articles: "full",
    seo_gaps: "edit",
    tasks: "view",
    overview: "view",
  }),
  preset("View only", "Read every section. Cannot change anything.", {
    sprint: "view", articles: "view", seo_gaps: "view",
    overview: "view", tasks: "view", keywords: "view", competitors: "view",
    wins: "view", team: "view",
  }),
  preset("No access", "Revoke everything for this project.", {}),
];

interface Props {
  member: Profile;
  projects: Project[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PermissionsDialog({ member, projects, open, onOpenChange }: Props) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [loading, setLoading] = useState(false);
  const [saving, startSave] = useTransition();

  // Load existing permissions and map them to levels
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    setLoading(true);
    getMemberPermissions(member.id, projectId)
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, Level> = {};
        for (const k of ALL_SECTION_KEYS) {
          const found = rows.find((r) => r.section === k);
          next[k] = found
            ? permsToLevel({
                can_view: !!found.can_view,
                can_add: !!found.can_add,
                can_edit: !!found.can_edit,
                can_complete: !!found.can_complete,
                can_delete: !!found.can_delete,
              })
            : "none";
        }
        setLevels(next);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, projectId, member.id]);

  const setOne = (key: SectionKey, level: Level) =>
    setLevels((prev) => ({ ...prev, [key]: level }));

  const applyPreset = (p: Preset) => {
    setLevels(p.apply());
    toast.success(`Applied "${p.label}" preset`);
  };

  const dirtyCount = useMemo(
    () => Object.values(levels).filter((l) => l !== "none").length,
    [levels],
  );

  const save = () => {
    if (!projectId) return;
    startSave(async () => {
      try {
        const section_permissions: Record<string, SectionPerms> = {};
        for (const k of ALL_SECTION_KEYS) {
          section_permissions[k] = LEVEL_TO_PERMS[levels[k] ?? "none"];
        }
        await updateMemberPermissions({
          user_id: member.id,
          project_id: projectId,
          section_permissions,
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
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto we360-scroll">
        <DialogHeader>
          <DialogTitle>Permissions — {member.name}</DialogTitle>
          <DialogDescription>
            {memberOnly ? (
              <>
                Pick an access level per section. <strong>View</strong> lets them see the
                page. <strong>Edit</strong> adds add / modify / complete. <strong>Full</strong> adds delete.
              </>
            ) : (
              <>
                {member.name} is an {member.role.replace("_", " ")} and has full access to
                every section automatically. Per-section permissions only apply to members and clients.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {memberOnly && (
          <div className="space-y-4">
            {/* Project picker */}
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

            {/* Presets */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Quick presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <Button
                    key={p.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(p)}
                    title={p.description}
                    className="h-7 text-xs"
                    disabled={loading}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Presets overwrite every row. Use them as a starting point, then adjust per section.
              </p>
            </div>

            {/* Section groups */}
            {loading ? (
              <div className="p-12 flex items-center justify-center text-sm text-muted-foreground gap-2 border rounded-lg">
                <Loader2 className="size-4 animate-spin" /> Loading permissions…
              </div>
            ) : (
              <div className="space-y-4">
                {GROUPS.map((group) => (
                  <SectionGroupCard
                    key={group.id}
                    group={group}
                    levels={levels}
                    onChange={setOne}
                  />
                ))}
              </div>
            )}

            {/* Summary */}
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {dirtyCount === 0 ? (
                <>This member will have <strong className="text-rose-600">no access</strong> to any section in this project.</>
              ) : (
                <>This member will have access to <strong className="text-foreground">{dirtyCount}</strong> of {ALL_SECTION_KEYS.length} sections.</>
              )}
            </div>
          </div>
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

// ---------------------------------------------------------------- Section group card

function SectionGroupCard({
  group,
  levels,
  onChange,
}: {
  group: SectionGroup;
  levels: Record<string, Level>;
  onChange: (key: SectionKey, level: Level) => void;
}) {
  const Icon = group.icon;
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
        <Icon className="size-3.5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider">{group.label}</div>
          <div className="text-[11px] text-muted-foreground truncate">{group.hint}</div>
        </div>
      </div>
      <div className="divide-y">
        {group.rows.map((row) => (
          <div key={row.key} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{row.label}</div>
              {row.helper && (
                <div className="text-[11px] text-muted-foreground truncate">{row.helper}</div>
              )}
            </div>
            <LevelPicker value={levels[row.key] ?? "none"} onChange={(l) => onChange(row.key, l)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Segmented level picker

const LEVEL_OPTIONS: Array<{ id: Level; label: string; tone: string }> = [
  { id: "none", label: "None", tone: "data-[active=true]:bg-rose-50 data-[active=true]:text-rose-700 dark:data-[active=true]:bg-rose-950/40 dark:data-[active=true]:text-rose-300" },
  { id: "view", label: "View", tone: "data-[active=true]:bg-zinc-100 data-[active=true]:text-zinc-900 dark:data-[active=true]:bg-zinc-800 dark:data-[active=true]:text-zinc-100" },
  { id: "edit", label: "Edit", tone: "data-[active=true]:bg-[#5B45E0]/10 data-[active=true]:text-[#5B45E0] dark:data-[active=true]:text-[#7B62FF]" },
  { id: "full", label: "Full", tone: "data-[active=true]:bg-emerald-50 data-[active=true]:text-emerald-700 dark:data-[active=true]:bg-emerald-950/40 dark:data-[active=true]:text-emerald-300" },
];

function LevelPicker({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border bg-muted/30 p-0.5">
      {LEVEL_OPTIONS.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            data-active={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-md font-medium transition-colors",
              active ? "shadow-sm" : "text-muted-foreground hover:text-foreground",
              o.tone,
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
