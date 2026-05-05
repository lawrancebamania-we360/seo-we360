"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTask } from "@/lib/actions/tasks";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  taskId: string | null;
  taskTitle?: string;
  initialUrl?: string | null;
  onSaved?: (url: string) => void;
}

export function PublishUrlDialog({ open, onOpenChange, taskId, taskTitle, initialUrl, onSaved }: Props) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [pending, start] = useTransition();

  const isValid = /^https?:\/\//.test(url.trim());

  const save = () => {
    if (!taskId || !isValid) return;
    start(async () => {
      try {
        await updateTask(taskId, {
          status: "done",
          published_url: url.trim(),
        });
        toast.success(
          <span className="inline-flex items-center gap-1">
            <Sparkles className="size-3" />
            Published! Link saved to card.
          </span>
        );
        onSaved?.(url.trim());
        onOpenChange(false);
        setUrl("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not publish");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setUrl(""); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-violet-500/20 text-emerald-700 dark:text-emerald-400">
              <Sparkles className="size-4" />
            </div>
            Publish this article
          </DialogTitle>
          <DialogDescription>
            {taskTitle ? <>Adding publish URL for <strong className="text-foreground">{taskTitle}</strong>.</> : null}
            {" "}Paste the live blog URL — the card will link to it once published.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="publish-url">
            Live URL <span className="text-rose-600">*</span>
          </Label>
          <Input
            id="publish-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://we360.ai/blog/..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValid && !pending) save();
            }}
          />
          {url.trim().length > 0 && !isValid && (
            <p className="text-xs text-rose-600">Must start with http:// or https://</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!isValid || pending} variant="brand">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
