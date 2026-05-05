"use client";

import { useState } from "react";
import { ExternalLink, Plus, X, FileText, Table as TableIcon, Link2, Film } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateTask } from "@/lib/actions/tasks";

interface Props {
  taskId: string;
  links: string[];
  canEdit: boolean;
  onChange: (next: string[]) => void;
}

// Infer a recognizable icon + label from common link patterns — Docs,
// Sheets, GitHub, YouTube, Notion, etc.
function linkKind(url: string): { label: string; icon: typeof Link2 } {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("docs.google.com/document")) return { label: "Google Doc", icon: FileText };
    if (host.includes("docs.google.com/spreadsheet")) return { label: "Google Sheet", icon: TableIcon };
    if (host.includes("docs.google.com/present")) return { label: "Google Slides", icon: FileText };
    if (host === "notion.so" || host.endsWith(".notion.so")) return { label: "Notion", icon: FileText };
    if (host === "airtable.com" || host.endsWith("airtable.com")) return { label: "Airtable", icon: TableIcon };
    if (host === "github.com" || host.endsWith(".github.com")) return { label: "GitHub", icon: Link2 };
    if (host === "figma.com" || host.endsWith(".figma.com")) return { label: "Figma", icon: FileText };
    if (host === "youtube.com" || host === "youtu.be") return { label: "YouTube", icon: Film };
    if (host === "loom.com") return { label: "Loom", icon: Film };
    if (host.endsWith(".pdf")) return { label: "PDF", icon: FileText };
    return { label: host, icon: Link2 };
  } catch {
    return { label: "Link", icon: Link2 };
  }
}

export function SupportingLinksEditor({ taskId, links, canEdit, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const valid = /^https?:\/\/.+\..+/.test(draft.trim());

  const addLink = async () => {
    if (!valid) return;
    const url = draft.trim();
    if (links.includes(url)) {
      toast.error("Link already added");
      return;
    }
    const next = [...links, url];
    setPending(true);
    try {
      await updateTask(taskId, { supporting_links: next });
      onChange(next);
      setDraft("");
      setAdding(false);
      toast.success("Link added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setPending(false);
    }
  };

  const remove = async (url: string) => {
    const next = links.filter((u) => u !== url);
    setPending(true);
    try {
      await updateTask(taskId, { supporting_links: next });
      onChange(next);
      toast.success("Link removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      {links.length === 0 && !adding ? (
        <div className="text-xs text-muted-foreground italic">
          {canEdit ? "No links yet — add Google Docs, Sheets, research pages, any reference URL." : "No supporting links."}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {links.map((url) => {
            const { label, icon: Icon } = linkKind(url);
            return (
              <div
                key={url}
                className="group inline-flex items-center gap-1.5 rounded-md border bg-muted/30 hover:bg-muted transition-colors pl-2 pr-1 py-1 text-xs"
              >
                <Icon className="size-3 text-muted-foreground shrink-0" />
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground hover:underline truncate max-w-[200px]"
                  title={url}
                >
                  {label}
                </a>
                <ExternalLink className="size-2.5 text-muted-foreground shrink-0" />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => remove(url)}
                    disabled={pending}
                    className="ml-0.5 size-4 rounded-full opacity-0 group-hover:opacity-100 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/60 flex items-center justify-center transition-all"
                    aria-label="Remove"
                  >
                    <X className="size-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        adding ? (
          <div className="flex items-center gap-1.5">
            <Input
              type="url"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://docs.google.com/..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); if (valid) addLink(); }
                if (e.key === "Escape") { setAdding(false); setDraft(""); }
              }}
              className="h-8 text-xs"
            />
            <Button type="button" size="xs" onClick={addLink} disabled={!valid || pending}>
              Add
            </Button>
            <Button type="button" size="xs" variant="outline" onClick={() => { setAdding(false); setDraft(""); }}>
              <X className="size-3" />
            </Button>
          </div>
        ) : (
          <Button type="button" size="xs" variant="outline" onClick={() => setAdding(true)} disabled={pending}>
            <Plus className="size-3" />
            Add link
          </Button>
        )
      )}
    </div>
  );
}
