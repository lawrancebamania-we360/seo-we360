"use client";

import { useState } from "react";
import { Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopicClusterDialog } from "./topic-cluster-dialog";

interface Props {
  projectId: string;
  projectName: string;
}

// Trigger + dialog wrapper. Lives in the Blog Sprint header.
export function TopicClusterButton({ projectId, projectName }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="brand" className="gap-1.5" onClick={() => setOpen(true)}>
        <Network className="size-3.5" />
        Plan topic cluster
      </Button>
      <TopicClusterDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        projectName={projectName}
      />
    </>
  );
}
