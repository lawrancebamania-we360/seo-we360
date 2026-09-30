"use client";

// Backlinks (Ticket 30): the no-paste alternative to New Submissions - pick
// an existing platform, a date (defaults to today), paste one link. Website
// is a dropdown of platforms already on the list (add a new one via "Add
// platform" first) rather than free text, so this can't create a duplicate
// or misspelled website row the way a paste typo could.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addBacklinkSubmission } from "@/lib/actions/backlinks";

const today = (): string => new Date().toISOString().slice(0, 10);

export function AddSubmissionButton({ projectId, websites }: {
  projectId: string;
  websites: { id: string; domain: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [websiteId, setWebsiteId] = useState("");
  const [date, setDate] = useState(today());
  const [link, setLink] = useState("");
  const [blogPost, setBlogPost] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setWebsiteId(""); setDate(today()); setLink(""); setBlogPost(""); setTopic(""); setError(null); };

  const submit = async () => {
    if (!websiteId || !link.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await addBacklinkSubmission({
      project_id: projectId,
      website_id: websiteId,
      submission_date: date,
      submission_url: link.trim(),
      blog_post: blogPost.trim() || undefined,
      topic_name: topic.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not add that submission."); return; }
    toast.success("Submission added.");
    setOpen(false);
    reset();
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Add submission
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!busy) { setOpen(v); if (!v) reset(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Add a submission</DialogTitle>
            <DialogDescription>For logging one submission at a time instead of pasting a batch.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="add-submission-website">Website</label>
              <Select value={websiteId} onValueChange={(v) => v && setWebsiteId(v)}>
                <SelectTrigger id="add-submission-website" className="h-9 w-full"><SelectValue placeholder="Pick a platform" /></SelectTrigger>
                <SelectContent>
                  {websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.domain}</SelectItem>)}
                </SelectContent>
              </Select>
              {websites.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">No platforms yet - use &quot;Add platform&quot; first.</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="add-submission-date">Submission date</label>
              <Input id="add-submission-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="add-submission-link">Submission link</label>
              <Input id="add-submission-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." className="h-9" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="add-submission-blog">Blog post (optional)</label>
              <Input id="add-submission-blog" value={blogPost} onChange={(e) => setBlogPost(e.target.value)} placeholder="Matched against your sitemap, same as pasting" className="h-9" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="add-submission-topic">Topic (optional)</label>
              <Input id="add-submission-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="h-9" />
            </div>
            {error && <p className="text-xs text-error-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="brand" onClick={submit} disabled={busy || !websiteId || !link.trim()} className="gap-1.5">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
