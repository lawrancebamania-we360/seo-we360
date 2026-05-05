"use client";

import { useState, useRef, useTransition } from "react";
import { Upload, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export function KeywordUpload({ projectId }: { projectId: string }) {
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const handle = (file: File) => {
    start(async () => {
      try {
        setProgress("Parsing CSV...");
        const text = await file.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

        const rows = parsed.data as Record<string, string>[];
        const supabase = createClient();

        // Map GKP columns. Accepted names (case-insensitive): "Keyword", "Avg. monthly searches",
        // "Competition" or "Competition (indexed value)", "Top of page bid (high range)"
        const parseRow = (r: Record<string, string>) => {
          const norm = Object.fromEntries(
            Object.entries(r).map(([k, v]) => [k.toLowerCase().trim(), v])
          );
          const keyword = norm["keyword"] ?? norm["keywords"];
          if (!keyword) return null;
          const volStr = norm["avg. monthly searches"] ?? norm["search volume"] ?? norm["volume"];
          const volume = volStr ? parseInt(volStr.replace(/[^0-9]/g, ""), 10) : null;
          const compRaw =
            norm["competition"] ?? norm["competition (indexed value)"] ?? norm["competition index"];
          let competition: "Low Competition" | "Medium Competition" | "High Competition" | null = null;
          if (compRaw) {
            const c = compRaw.toLowerCase();
            if (c.includes("low") || (parseFloat(compRaw) >= 0 && parseFloat(compRaw) < 0.33)) competition = "Low Competition";
            else if (c.includes("med") || (parseFloat(compRaw) >= 0.33 && parseFloat(compRaw) < 0.66)) competition = "Medium Competition";
            else competition = "High Competition";
          }
          return {
            project_id: projectId,
            keyword: keyword.trim(),
            search_volume: volume,
            competition,
            source: "gkp_upload" as const,
            priority: "medium" as const,
            trend: "new" as const,
          };
        };

        const mapped = rows.map(parseRow).filter(Boolean) as NonNullable<ReturnType<typeof parseRow>>[];

        setProgress(`Uploading ${mapped.length} keywords...`);

        // Log upload
        await supabase.from("keyword_uploads").insert({
          project_id: projectId,
          filename: file.name,
          row_count: rows.length,
          imported_count: mapped.length,
          skipped_count: rows.length - mapped.length,
          status: "completed",
        });

        // Insert in batches of 100; use upsert to avoid duplicates
        const chunks = [] as (typeof mapped)[];
        for (let i = 0; i < mapped.length; i += 100) chunks.push(mapped.slice(i, i + 100));
        for (const chunk of chunks) {
          const { error } = await supabase.from("keywords").upsert(chunk, { onConflict: "project_id,keyword", ignoreDuplicates: true });
          if (error) throw error;
        }

        setProgress(null);
        toast.success(`Imported ${mapped.length} keywords`);
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
        setProgress(null);
      }
    });
  };

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <FileText className="size-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <div className="font-medium mb-1">Upload from Google Keyword Planner</div>
          <p className="text-sm text-muted-foreground mb-4">
            Export your keyword ideas from GKP (Keyword + Avg. monthly searches + Competition columns expected). Paste in CSV and we&apos;ll map, dedupe, and enrich automatically.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
          />
          <div className="flex items-center gap-2">
            <Button onClick={() => inputRef.current?.click()} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Choose CSV
            </Button>
            {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}
