"use client";

// Blog Clusters: download an .xlsx. The list page exports every cluster (one
// "All" overview tab + one detailed tab per cluster); a cluster page exports
// just that cluster. See app/api/blog-clusters/export and .../[id]/export.

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportButton({ href, label = "Export" }: { href: string; label?: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={() => { window.location.href = href; }}
    >
      <Download className="size-3.5" /> {label}
    </Button>
  );
}
