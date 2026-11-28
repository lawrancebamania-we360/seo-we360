"use client";

// Influencer Collabs: one post's tracking - the we360.ai links found in the
// post and the influencer's comment (scraped once; editable), and the daily
// reactions / comments / reposts for its first 30 days (scraped daily;
// anyone can add or correct a day - LinkedIn's live numbers replace it on the next read).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { saveInfluencerPostLink, saveInfluencerPostLinks, saveInfluencerPostMetric } from "@/lib/actions/influencer-collabs";
import type { InfluencerCollabRow } from "@/lib/data/influencer-collabs";

export const METRIC_DAYS = 30;

const todayIst = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayOf = (postDate: string, date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${postDate}T00:00:00Z`)) / 86_400_000);
const toCount = (v: string): number | null => (v.trim() === "" ? null : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

export function PostTrackingDialog({ collab, projectId, onClose }: { collab: InfluencerCollabRow; projectId: string; onClose: () => void }) {
  const router = useRouter();
  const [postLink, setPostLink] = useState(collab.postLink ?? "");
  const [savingPost, setSavingPost] = useState(false);
  const [postBody, setPostBody] = useState(collab.postBodyLink ?? "");
  const [comment, setComment] = useState(collab.commentLink ?? "");
  const [savingLinks, setSavingLinks] = useState(false);

  const lastDay = addDays(collab.postDate, METRIC_DAYS);
  const defaultDate = todayIst() < collab.postDate ? collab.postDate : todayIst() > lastDay ? lastDay : todayIst();
  const [date, setDate] = useState(defaultDate);
  const existing = collab.metrics.find((m) => m.date === date);
  const [reactions, setReactions] = useState(existing?.reactions?.toString() ?? "");
  const [comments, setComments] = useState(existing?.comments?.toString() ?? "");
  const [reposts, setReposts] = useState(existing?.reposts?.toString() ?? "");
  const [savingDay, setSavingDay] = useState(false);

  const pick = (d: string) => {
    setDate(d);
    const m = collab.metrics.find((x) => x.date === d);
    setReactions(m?.reactions?.toString() ?? "");
    setComments(m?.comments?.toString() ?? "");
    setReposts(m?.reposts?.toString() ?? "");
  };

  const savePostLink = async () => {
    setSavingPost(true);
    try {
      const r = await saveInfluencerPostLink({ project_id: projectId, collab_id: collab.id, post_link: postLink.trim() || null });
      if (!r.ok) { toast.error(r.error ?? "Could not save the post link."); return; }
      toast.success("Post link saved — its links are looked up on the next refresh."); router.refresh();
    } finally { setSavingPost(false); }
  };

  const saveLinks = async () => {
    setSavingLinks(true);
    try {
      const r = await saveInfluencerPostLinks({ project_id: projectId, collab_id: collab.id, post_body_link: postBody.trim() || null, comment_link: comment.trim() || null });
      if (!r.ok) { toast.error(r.error ?? "Could not save the links."); return; }
      toast.success("Links saved."); router.refresh();
    } finally { setSavingLinks(false); }
  };

  const saveDay = async () => {
    const [re, co, rp] = [toCount(reactions), toCount(comments), toCount(reposts)];
    if ([re, co, rp].some((n) => Number.isNaN(n))) { toast.error("Use whole numbers."); return; }
    if (re === null && co === null && rp === null) { toast.error("Enter at least one number."); return; }
    setSavingDay(true);
    try {
      const r = await saveInfluencerPostMetric({ project_id: projectId, collab_id: collab.id, captured_on: date, reactions: re, comments: co, reposts: rp });
      if (!r.ok) { toast.error(r.error ?? "Could not save."); return; }
      toast.success(`Saved day ${dayOf(collab.postDate, date)}.`); router.refresh();
    } finally { setSavingDay(false); }
  };

  const rows = [...collab.metrics].reverse();

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{collab.influencerName} · post tracking</DialogTitle>
          <DialogDescription>
            Read from LinkedIn every day for the first {METRIC_DAYS} days after the post ({collab.postDate} → {lastDay}).
            Anyone can add or correct a day; when LinkedIn can be read, its live numbers replace a hand entry.
          </DialogDescription>
        </DialogHeader>

        {!collab.trackingReady ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
            Post tracking needs migration 20261118000001 applied in Supabase first.
          </p>
        ) : (
          <div className="space-y-5">
            {collab.scrapeError && (
              <div className="flex gap-2 rounded-lg border border-amber-300/60 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {collab.scrapeError}
              </div>
            )}

            <section className="space-y-2">
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">LinkedIn post</h4>
              <div className="flex gap-2">
                <Input value={postLink} onChange={(e) => setPostLink(e.target.value)}
                  placeholder="https://www.linkedin.com/posts/... (… on the post → Copy link to post)" className="h-9 text-[13px]" />
                <Button size="sm" variant="outline" onClick={savePostLink} disabled={savingPost || postLink.trim() === (collab.postLink ?? "")} className="h-9 shrink-0 gap-1.5">
                  {savingPost ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">we360.ai links</h4>
              <p className="text-[11.5px] text-muted-foreground">
                {collab.linksScrapedAt ? "Found once from the post — edit if wrong." : "Looked up once, on the next refresh. You can also paste them now."}
              </p>
              <label className="block text-xs font-medium text-muted-foreground">Link in post
                <Input value={postBody} onChange={(e) => setPostBody(e.target.value)} placeholder="https://we360.ai/..." className="mt-1 h-9 text-[13px]" />
              </label>
              <label className="block text-xs font-medium text-muted-foreground">Link in comment (with UTMs)
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="https://www.we360.ai/demo/?utm_source=linkedin&utm_medium=influencer&..." className="mt-1 h-9 text-[13px]" />
              </label>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={saveLinks} disabled={savingLinks} className="gap-1.5">
                  {savingLinks ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save links
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Daily numbers</h4>
              {rows.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">No readings yet.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-1.5 font-semibold">Day</th>
                        <th className="px-3 py-1.5 text-right font-semibold">Reactions</th>
                        <th className="px-3 py-1.5 text-right font-semibold">Comments</th>
                        <th className="px-3 py-1.5 text-right font-semibold">Reposts</th>
                        <th className="px-3 py-1.5 font-semibold">From</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((m) => (
                        <tr key={m.date} className={cn("border-b border-border/60 last:border-0", m.date === date && "bg-[#5B45E0]/5")}>
                          <td className="px-3 py-1.5 text-foreground">
                            Day {dayOf(collab.postDate, m.date)} <span className="text-muted-foreground">· {m.date}</span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{m.reactions ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{m.comments ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{m.reposts ?? "—"}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{m.source === "manual" ? "Edited" : "LinkedIn"}</td>
                          <td className="px-2 py-1.5 text-right">
                            <button type="button" onClick={() => pick(m.date)} title="Edit this day" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                              <Pencil className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 text-[12px] font-medium text-foreground">
                  {existing ? "Correct" : "Add"} day {dayOf(collab.postDate, date)}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="text-[11px] text-muted-foreground">Date
                    <Input type="date" value={date} min={collab.postDate} max={lastDay} onChange={(e) => pick(e.target.value)} className="mt-1 h-8 text-[12.5px]" />
                  </label>
                  <label className="text-[11px] text-muted-foreground">Reactions
                    <Input inputMode="numeric" value={reactions} onChange={(e) => setReactions(e.target.value)} className="mt-1 h-8 text-[12.5px]" />
                  </label>
                  <label className="text-[11px] text-muted-foreground">Comments
                    <Input inputMode="numeric" value={comments} onChange={(e) => setComments(e.target.value)} className="mt-1 h-8 text-[12.5px]" />
                  </label>
                  <label className="text-[11px] text-muted-foreground">Reposts
                    <Input inputMode="numeric" value={reposts} onChange={(e) => setReposts(e.target.value)} className="mt-1 h-8 text-[12.5px]" />
                  </label>
                </div>
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {collab.trackingReady && (
            <Button variant="brand" onClick={saveDay} disabled={savingDay} className="gap-1.5">
              {savingDay ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save day {dayOf(collab.postDate, date)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
