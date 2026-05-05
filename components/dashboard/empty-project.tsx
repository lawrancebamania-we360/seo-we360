import Link from "next/link";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyProjectState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted">
          <FolderPlus className="size-6 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">No project yet</h2>
        <p className="text-sm text-muted-foreground">
          {canCreate
            ? "Add your first client site using the project switcher in the sidebar."
            : "Ask your admin to give you access to a project."}
        </p>
        {canCreate && (
          <Button render={<Link href="/dashboard/projects" />}>Manage projects</Button>
        )}
      </div>
    </div>
  );
}
