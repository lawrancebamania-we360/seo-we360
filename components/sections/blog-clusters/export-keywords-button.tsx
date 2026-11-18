"use client";

// Blog Clusters: download every cluster's primary + secondary keywords as one
// CSV (see app/api/blog-clusters/keywords/export). Open to any member - it's
// their planning data.

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportKeywordsButton() {
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={() => { window.location.href = "/api/blog-clusters/keywords/export"; }}
    >
      <Download className="size-3.5" /> Export keywords
    </Button>
  );
}
