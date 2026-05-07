"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Upload, Loader2, AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { bulkCreateBlogTasks, type BulkBlogTaskRow } from "@/lib/actions/tasks";

interface Props {
  projectId: string;
}

// Lightweight CSV/TSV parser — handles both comma-separated (paste from
// Notion/Google Sheets export) and tab-separated (paste straight from Excel).
// Auto-detects by counting tabs vs commas in the first non-empty line.
// Honors quoted fields with internal commas.
function parseRows(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const tabCount = (lines[0].match(/\t/g) ?? []).length;
  const commaCount = (lines[0].match(/,/g) ?? []).length;
  const sep = tabCount > commaCount ? "\t" : ",";

  const splitLine = (line: string): string[] => {
    if (sep === "\t") return line.split("\t");
    // CSV with quoted-field support
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === "," && !inQuotes) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows };
}

// Map a header name to our known field. Lenient — accepts common variants.
function mapHeader(h: string): keyof BulkBlogTaskRow | null {
  const n = h.toLowerCase().replace(/[\s_-]/g, "");
  if (["title", "task", "taskname", "name"].includes(n)) return "title";
  if (["h1", "h1keyword", "targetkeyword", "keyword", "primarykeyword"].includes(n)) return "target_keyword";
  if (["format", "type", "tasktype"].includes(n)) return "format";
  if (["priority"].includes(n)) return "priority";
  if (["date", "scheduleddate", "due", "duedate"].includes(n)) return "scheduled_date";
  if (["assignee", "assigneeemail", "owner", "email"].includes(n)) return "assignee_email";
  if (["wordcount", "words", "wordcounttarget"].includes(n)) return "word_count_target";
  if (["intent", "searchintent"].includes(n)) return "intent";
  if (["url", "slug", "page"].includes(n)) return "url";
  return null;
}

export function BulkUploadTasksButton({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const sample = `title,h1_keyword,format,priority,date,assignee
Update existing blog: remote work guide,remote work guide,update-blog,high,2026-05-12,lokesh.kumar@we360.ai
We360 vs Hubstaff,we360 vs hubstaff,vs-page,critical,2026-05-19,rahul.deswal@we360.ai
We360 Slack Integration,we360 slack integration,integration-page,medium,,ishika.takhtani@we360.ai`;

  // Pre-fill the textarea with a working sample the moment the dialog opens.
  // Two reasons: (1) the previous "click 'Use example' link" was easy to miss
  // — users hit Upload on an empty textarea and got nothing; (2) this gives
  // immediate live documentation of the expected format. Users select-all + paste
  // their own rows over the sample as the first action.
  useEffect(() => {
    if (open && text.trim().length === 0) setText(sample);
  }, [open, text, sample]);

  const { parsedRows, errors } = useMemo(() => {
    if (!text.trim()) return { parsedRows: [] as BulkBlogTaskRow[], errors: [] as string[] };
    const { headers, rows } = parseRows(text);
    const headerMap = headers.map(mapHeader);
    const titleIdx = headerMap.indexOf("title");
    const kwIdx = headerMap.indexOf("target_keyword");
    const errs: string[] = [];
    if (titleIdx < 0) errs.push("Missing required column: title (or task / name)");
    if (kwIdx < 0) errs.push("Missing required column: h1_keyword (or h1 / target_keyword / keyword)");
    if (errs.length) return { parsedRows: [], errors: errs };

    const out: BulkBlogTaskRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i];
      const row: BulkBlogTaskRow = { title: "", target_keyword: "" };
      for (let c = 0; c < headerMap.length; c++) {
        const field = headerMap[c];
        const val = (cells[c] ?? "").trim();
        if (!field || !val) continue;
        if (field === "word_count_target") row[field] = Number(val) || null;
        else if (field === "priority") {
          const v = val.toLowerCase();
          row[field] = (["critical", "high", "medium", "low"].includes(v) ? v : "medium") as BulkBlogTaskRow["priority"];
        } else if (field === "intent") {
          const v = val.toLowerCase();
          row[field] = (["informational", "commercial", "transactional", "navigational"].includes(v) ? v : "commercial") as BulkBlogTaskRow["intent"];
        } else {
          // String fields — TS can't narrow the union, so cast through unknown.
          (row as unknown as Record<string, unknown>)[field] = val;
        }
      }
      if (!row.title || !row.target_keyword) {
        errs.push(`Row ${i + 2}: missing title or h1_keyword — skipped`);
        continue;
      }
      out.push(row);
    }
    return { parsedRows: out, errors: errs };
  }, [text]);

  const submit = () => {
    if (!parsedRows.length) {
      toast.error("Add at least one row with a title and h1_keyword");
      return;
    }
    start(async () => {
      try {
        const { inserted } = await bulkCreateBlogTasks(projectId, parsedRows);
        toast.success(`${inserted} task${inserted === 1 ? "" : "s"} added to Blog Sprint`);
        setText("");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Bulk upload failed");
      }
    });
  };

  const placeholderHint = `title,h1_keyword,format,priority,date,assignee\n…paste your rows here`;

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Upload className="size-3.5" />
        Upload tasks
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Upload tasks to Blog Sprint</DialogTitle>
            <DialogDescription>
              Paste rows from Excel / Google Sheets / CSV. Required columns: <code>title</code> and{" "}
              <code>h1_keyword</code>. Optional: <code>format</code>, <code>priority</code>,{" "}
              <code>date</code>, <code>assignee</code> (email), <code>word_count</code>,{" "}
              <code>intent</code>, <code>url</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Edit the rows (header on line 1, comma- or tab-separated)
              </div>
              <button
                type="button"
                onClick={() => setText(sample)}
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-[#5B45E0] hover:text-[#7B62FF] dark:text-[#7B62FF] dark:hover:text-[#5B45E0]"
              >
                <RotateCcw className="size-3" />
                Reset to example
              </button>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholderHint}
              className="font-mono text-xs h-48"
              spellCheck={false}
            />

            {errors.length > 0 && (
              <div className="rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 text-xs font-semibold">
                  <AlertTriangle className="size-3.5" />
                  {errors.length} issue{errors.length === 1 ? "" : "s"} found
                </div>
                <ul className="text-xs text-rose-700 dark:text-rose-400 space-y-0.5">
                  {errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                  {errors.length > 5 && <li>• …and {errors.length - 5} more</li>}
                </ul>
              </div>
            )}

            {parsedRows.length > 0 && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 className="size-3.5" />
                  {parsedRows.length} task{parsedRows.length === 1 ? "" : "s"} ready to upload
                </div>
                <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 space-y-0.5 max-h-36 overflow-y-auto">
                  {parsedRows.slice(0, 8).map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{i + 1}</Badge>
                      <span className="truncate font-medium">{r.title}</span>
                      <span className="text-emerald-700/60 dark:text-emerald-400/60">→ {r.target_keyword}</span>
                    </div>
                  ))}
                  {parsedRows.length > 8 && <div>…and {parsedRows.length - 8} more</div>}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="brand" onClick={submit} disabled={pending || !parsedRows.length}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              <Upload className="size-3.5" />
              Upload {parsedRows.length || ""} task{parsedRows.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
