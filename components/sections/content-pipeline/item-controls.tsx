"use client";

// Content pipeline: the pieces a planned blog/guide needs beyond its brief -
// where it is in the write -> upload -> live flow, its page spec (title, slug,
// meta) ready to copy, the artifact a writer attaches, and the publish action.
// Shared by the cluster drawer and the To Publish queue so both behave the same.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, ExternalLink, Loader2, Paperclip, Upload, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { liveUrlFromSlug, toExternalUrl } from "@/lib/url";
import { setClusterItemArtifact, markClusterItemPublished, unpublishClusterItem, setClusterItemsKind, setClusterKind } from "@/lib/actions/content-pipeline";
import { PUBLISH_STATE_LABEL, CONTENT_KIND_LABEL, TAGGABLE_KINDS, CLUSTER_KIND_LABEL, CLUSTER_KINDS, type PublishState, type ContentKind, type TaggableKind, type ClusterKind } from "@/lib/content-pipeline/content-type";

const shortKind = (k: ContentKind) => CONTENT_KIND_LABEL[k].replace(/s$/, "");

const STATE_TONE: Record<PublishState, string> = {
  draft: "border-border text-muted-foreground",
  ready: "border-[#7B62FF]/40 text-[#5B45E0] dark:text-[#7B62FF] bg-[#5B45E0]/5",
  published_pending: "border-warning-300/60 text-warning-700 dark:text-warning-400 bg-warning-500/5",
  live: "border-success-300/60 text-success-700 dark:text-success-400 bg-success-500/5",
};

export function PublishStateBadge({ state, liveUrl }: { state: PublishState; liveUrl?: string | null }) {
  const label = PUBLISH_STATE_LABEL[state];
  if (state === "live" && liveUrl) {
    return (
      <a href={liveUrl} target="_blank" rel="noopener noreferrer"
        className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium hover:underline", STATE_TONE.live)}>
        <Check className="size-3" /> {label} <ExternalLink className="size-2.5" />
      </a>
    );
  }
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium", STATE_TONE[state])}>{label}</span>;
}

const KIND_TONE: Record<ContentKind, string> = {
  blog: "border-info-300 text-info-700 dark:text-info-400",
  guide: "border-[#7B62FF]/40 text-[#5B45E0] dark:text-[#7B62FF]",
  listicle: "border-warning-300 text-warning-700 dark:text-warning-400",
  pillar: "border-success-300 text-success-700 dark:text-success-400",
  other: "border-border text-muted-foreground",
};
export function KindBadge({ kind }: { kind: ContentKind }) {
  return <Badge variant="outline" className={cn("text-[10px]", KIND_TONE[kind])}>{shortKind(kind)}</Badge>;
}

// Clickable type tag: the team sets an item's real kind (Blog / Guide / ...),
// which overrides the inferred one. Used inline in the cluster table.
export function KindSelect({ projectId, itemId, kind }: { projectId: string; itemId: string; kind: ContentKind }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const pick = async (k: TaggableKind) => {
    if (busy || k === kind) return;
    setBusy(true);
    try {
      const r = await setClusterItemsKind({ project_id: projectId, item_ids: [itemId], kind: k });
      if (!r.ok) { toast.error(r.error ?? "Could not set the type."); return; }
      toast.success(`Set to ${shortKind(k)}.`);
      router.refresh();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button" disabled={busy} onClick={(e) => e.stopPropagation()}
            className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors hover:brightness-95", KIND_TONE[kind])}
            title="Set the content type"
          >
            {busy ? <Loader2 className="size-2.5 animate-spin" /> : null}
            {shortKind(kind)} <ChevronDown className="size-2.5 opacity-60" />
          </button>
        }
      />
      <DropdownMenuContent align="start">
        {TAGGABLE_KINDS.map((k) => (
          <DropdownMenuItem key={k} onClick={(e) => { e.stopPropagation(); pick(k); }} className="gap-6 text-[13px]">
            {shortKind(k)} {k === kind && <Check className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CLUSTER_TONE: Record<ClusterKind, string> = {
  blog: "border-info-300 text-info-700 dark:text-info-400",
  guide: "border-[#7B62FF]/40 text-[#5B45E0] dark:text-[#7B62FF] bg-[#5B45E0]/5",
};

export function ClusterKindBadge({ kind }: { kind: ClusterKind }) {
  return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium", CLUSTER_TONE[kind])}>{CLUSTER_KIND_LABEL[kind]}</span>;
}

// Switch a whole cluster between Blog and Guide, from its card. stopPropagation
// everywhere because the card itself is a link into the cluster.
export function ClusterKindSelect({ projectId, clusterId, kind }: { projectId: string; clusterId: string; kind: ClusterKind }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const pick = async (k: ClusterKind) => {
    if (busy || k === kind) return;
    setBusy(true);
    try {
      const r = await setClusterKind({ project_id: projectId, cluster_id: clusterId, kind: k });
      if (!r.ok) { toast.error(r.error ?? "Could not set the type."); return; }
      toast.success(`Cluster set to ${CLUSTER_KIND_LABEL[k]}.`);
      router.refresh();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button" disabled={busy}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors hover:brightness-95", CLUSTER_TONE[kind])}
            title="Set whether this is a Blog or Guide cluster"
          >
            {busy ? <Loader2 className="size-2.5 animate-spin" /> : null}
            {CLUSTER_KIND_LABEL[kind]} <ChevronDown className="size-2.5 opacity-60" />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        {CLUSTER_KINDS.map((k) => (
          <DropdownMenuItem key={k} onClick={(e) => { e.preventDefault(); e.stopPropagation(); pick(k); }} className="gap-6 text-[13px]">
            {CLUSTER_KIND_LABEL[k]} {k === kind && <Check className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The bulk bar shown above the cluster table when rows are selected.
export function BulkKindBar({ projectId, itemIds, onDone }: { projectId: string; itemIds: string[]; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const apply = async (k: TaggableKind) => {
    if (busy || !itemIds.length) return;
    setBusy(true);
    try {
      const r = await setClusterItemsKind({ project_id: projectId, item_ids: itemIds, kind: k });
      if (!r.ok) { toast.error(r.error ?? "Could not set the type."); return; }
      toast.success(`Set ${r.updated ?? itemIds.length} item${(r.updated ?? itemIds.length) === 1 ? "" : "s"} to ${shortKind(k)}.`);
      onDone();
      router.refresh();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#5B45E0]/30 bg-[#5B45E0]/5 px-2.5 py-1.5">
      <span className="text-xs font-medium text-foreground">{itemIds.length} selected</span>
      <span className="text-xs text-muted-foreground">Set type:</span>
      {TAGGABLE_KINDS.map((k) => (
        <Button key={k} type="button" size="sm" variant="outline" disabled={busy} onClick={() => apply(k)} className="h-7 px-2 text-xs">
          {busy ? <Loader2 className="size-3 animate-spin" /> : null} {shortKind(k)}
        </Button>
      ))}
    </div>
  );
}

async function copy(text: string, msg: string) {
  try { await navigator.clipboard.writeText(text); toast.success(msg); }
  catch { toast.error("Couldn't copy - select the text and copy manually."); }
}

function SpecRow({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <div className="w-16 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 text-[13px] text-foreground break-words">{value || <span className="text-muted-foreground">—</span>}</div>
      {value && (
        <div className="flex shrink-0 items-center gap-0.5">
          {href && <a href={href} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-muted-foreground hover:text-foreground"><ExternalLink className="size-3" /></a>}
          <button type="button" onClick={() => copy(value, `${label} copied.`)} className="rounded p-1 text-muted-foreground hover:text-foreground"><Copy className="size-3" /></button>
        </div>
      )}
    </div>
  );
}

// Title / slug / meta, each copyable - the spec whoever creates the page works from.
export function PageSpec({ title, slug, meta, siteDomain }: { title: string; slug: string | null; meta: string | null; siteDomain?: string | null }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Page spec</div>
      <SpecRow label="Title" value={title} />
      <SpecRow label="Slug" value={slug} href={slug ? liveUrlFromSlug(slug, siteDomain ?? "") : undefined} />
      <SpecRow label="Meta" value={meta} />
    </div>
  );
}

// The artifact a writer produced: their draft link + a Google Drive link for images.
export function ArtifactEditor({ itemId, artifactUrl, driveUrl }: { itemId: string; artifactUrl: string | null; driveUrl: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(artifactUrl ?? "");
  const [drive, setDrive] = useState(driveUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const has = artifactUrl || driveUrl;

  const save = async () => {
    if (busy) return;
    if (!draft.trim() && !drive.trim()) { setError("Add a draft link or a Google Drive link."); return; }
    setBusy(true); setError(null);
    try {
      const r = await setClusterItemArtifact({ item_id: itemId, artifact_url: draft.trim() || undefined, drive_url: drive.trim() || undefined });
      if (!r.ok) { setError(r.error ?? "Could not save that artifact."); return; }
      toast.success("Artifact saved. It's ready for upload.");
      setEditing(false);
      router.refresh();
    } catch { setError("Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Artifact</div>
        {!editing && <button type="button" onClick={() => setEditing(true)} className="text-[11px] font-medium text-[#5B45E0] hover:underline dark:text-[#7B62FF]">{has ? "Edit" : "Add"}</button>}
      </div>
      {!editing ? (
        has ? (
          <div className="space-y-1.5 text-[13px]">
            {toExternalUrl(artifactUrl) && (
              <a href={toExternalUrl(artifactUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-foreground hover:underline">
                <Paperclip className="size-3.5 text-muted-foreground" /> <span className="truncate">Draft / document</span> <ExternalLink className="size-3 text-muted-foreground" />
              </a>
            )}
            {toExternalUrl(driveUrl) && (
              <a href={toExternalUrl(driveUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-foreground hover:underline">
                <ImageIcon className="size-3.5 text-muted-foreground" /> <span className="truncate">Google Drive (images)</span> <ExternalLink className="size-3 text-muted-foreground" />
              </a>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">No artifact yet. The writer adds their draft and image folder here.</p>
        )
      ) : (
        <div className="space-y-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Draft / Google Doc link" className="h-8 text-[13px]" />
          <Input value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="Google Drive link (images)" className="h-8 text-[13px]" />
          {error && <p className="text-xs text-error-600">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="brand" onClick={save} disabled={busy} className="h-7 gap-1.5 text-xs">{busy && <Loader2 className="size-3 animate-spin" />} Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(artifactUrl ?? ""); setDrive(driveUrl ?? ""); setError(null); }} disabled={busy} className="h-7 text-xs">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Record the live URL (any team member). Shown as a button when ready, and as
// the recorded URL + Undo once set.
export function PublishControl({ itemId, state, liveUrl, publishedUrl, compact }: {
  itemId: string; state: PublishState; liveUrl: string | null; publishedUrl: string | null; compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !url.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await markClusterItemPublished({ item_id: itemId, published_url: url.trim() });
      if (!r.ok) { setError(r.error ?? "Could not mark that published."); return; }
      toast.success("Marked published. It'll show Live once it's in the sitemap.");
      setOpen(false); setUrl("");
      router.refresh();
    } catch { setError("Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  const undo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await unpublishClusterItem({ item_id: itemId });
      if (!r.ok) { toast.error(r.error ?? "Could not undo that."); return; }
      toast.success("Returned to the queue.");
      router.refresh();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  if (state === "ready" || state === "draft") {
    return (
      <>
        <Button type="button" size="sm" variant={compact ? "outline" : "brand"} onClick={() => setOpen(true)} className={cn("gap-1.5", compact ? "h-7 px-2 text-xs" : "")}>
          <Upload className="size-3.5" /> Mark published
        </Button>
        <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle>Mark as published</DialogTitle>
              <DialogDescription>Paste the live page URL on the website. It becomes &quot;Live&quot; automatically once it appears in the daily sitemap.</DialogDescription>
            </DialogHeader>
            <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} placeholder="https://www.we360.ai/blog/..." className="h-9" />
            {error && <p className="text-xs text-error-600">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button type="button" variant="brand" onClick={submit} disabled={busy || !url.trim()} className="gap-1.5">{busy && <Loader2 className="size-3.5 animate-spin" />} Mark published</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // published_pending or live: show the URL + undo.
  const shown = liveUrl ?? publishedUrl;
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      {shown && <a href={shown} target="_blank" rel="noopener noreferrer" className="truncate text-muted-foreground hover:text-foreground hover:underline max-w-[220px]">{shown}</a>}
      <button type="button" onClick={undo} disabled={busy} className="shrink-0 text-[11px] text-muted-foreground hover:text-error-600 disabled:opacity-50">Undo</button>
    </div>
  );
}
