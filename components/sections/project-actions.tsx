"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Archive, ArchiveRestore, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { archiveProject, unarchiveProject, deleteProject } from "@/lib/actions/project";

interface Props {
  projectId: string;
  projectName: string;
  projectDomain: string;
  isActive: boolean;
  isSuperAdmin: boolean;
}

export function ProjectActions({ projectId, projectName, projectDomain, isActive, isSuperAdmin }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const confirmMatches = confirmText.trim().toLowerCase() === projectDomain.toLowerCase();

  const archive = () => {
    start(async () => {
      try {
        await archiveProject(projectId);
        toast.success(`Archived ${projectName} — crons skip it until reactivated`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const unarchive = () => {
    start(async () => {
      try {
        await unarchiveProject(projectId);
        toast.success(`${projectName} is active again`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const del = () => {
    start(async () => {
      try {
        await deleteProject(projectId);
        toast.success(`Deleted ${projectName} permanently`);
        setDeleteOpen(false);
        setConfirmText("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Project actions"><MoreHorizontal className="size-4" /></Button>}
        />
        <DropdownMenuContent align="end" className="w-52">
          {isActive ? (
            <DropdownMenuItem onClick={archive} disabled={pending}>
              <Archive className="size-4 mr-2" />
              Archive project
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={unarchive} disabled={pending}>
              <ArchiveRestore className="size-4 mr-2" />
              Unarchive
            </DropdownMenuItem>
          )}
          {isSuperAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteOpen(true)}
                className="text-rose-600 focus:text-rose-600"
                disabled={pending}
              >
                <Trash2 className="size-4 mr-2" />
                Delete permanently
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={(v) => { if (!v) setConfirmText(""); setDeleteOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                <Trash2 className="size-4" />
              </div>
              Delete {projectName}?
            </DialogTitle>
            <DialogDescription>
              This permanently deletes the project, all its tasks, keywords, articles, competitors, and audit history.
              <strong className="block mt-2 text-rose-600">This cannot be undone.</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Type <code className="font-mono bg-muted px-1 rounded">{projectDomain}</code> to confirm</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={projectDomain}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={del}
              disabled={pending || !confirmMatches}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete forever
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
