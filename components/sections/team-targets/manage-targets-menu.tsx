"use client";

// Team Targets: admin-only "Manage targets" menu. The 25 targets are fixed and
// preloaded, so this is tucked away: add one, import a sheet, or edit/remove
// from a target's row. The dialogs are owned here (not inside the menu content)
// so they survive the menu closing.

import { useState } from "react";
import { FileUp, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TargetFormDialog, type MemberOption } from "@/components/sections/team-targets/target-form-dialog";
import { ImportTargetsDialog } from "@/components/sections/team-targets/import-targets-dialog";

export function ManageTargetsMenu({ projectId, members }: { projectId: string; members: MemberOption[] }) {
  const [mode, setMode] = useState<"add" | "import" | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="gap-1.5"><Settings2 className="size-3.5" /> Manage targets</Button>} />
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setMode("add")}><Plus className="size-3.5" /> Add a target</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("import")}><FileUp className="size-3.5" /> Import from sheet</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {mode === "add" && <TargetFormDialog projectId={projectId} members={members} onClose={() => setMode(null)} />}
      {mode === "import" && <ImportTargetsDialog projectId={projectId} members={members} onClose={() => setMode(null)} />}
    </>
  );
}
