"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteKeyword } from "@/lib/actions/keywords";

export function KeywordRowActions({ keywordId, keyword }: { keywordId: string; keyword: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();

  const del = () => {
    start(async () => {
      try {
        await deleteKeyword(keywordId);
        toast.success(`Deleted "${keyword}"`);
        setConfirmOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setConfirmOpen(true)}
        aria-label="Delete keyword"
        title="Delete keyword"
        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
      >
        <Trash2 className="size-3" />
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                <Trash2 className="size-4" />
              </div>
              Delete this keyword?
            </DialogTitle>
            <DialogDescription>
              Removes <span className="font-semibold text-foreground">&ldquo;{keyword}&rdquo;</span> from tracking. Any linked blog tasks keep the target keyword text.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={del} disabled={pending} className="bg-rose-600 hover:bg-rose-700 text-white">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
