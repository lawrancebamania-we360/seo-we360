// Backlinks (Ticket 4): every submission to one website, grouped under a
// per-date header showing that day's count - answers "how many submissions
// on this date" directly, without a separate calendar/heatmap widget.
// Submissions arrive already sorted newest-first from getBacklinkWebsiteDetail.
//
// Ticket 22: "Blog Post" is now an explicit NA fallback - a row's pasted Blog
// Post text that didn't match anything in the sitemap used to show as-is
// (e.g. a stray "1"), which reads as a real reference when it isn't one.

import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BacklinkSubmissionActions } from "@/components/sections/backlinks/backlink-submission-actions";
import type { BacklinkSubmissionRow } from "@/lib/data/backlinks";
import type { Member } from "@/components/sections/assignee-picker";

export function BacklinkSubmissionList({ submissions, projectId, members, canManage }: {
  submissions: BacklinkSubmissionRow[];
  projectId: string;
  members: Member[];
  canManage: boolean;
}) {
  if (!submissions.length) {
    return (
      <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
        No submissions to this website in the selected range.
      </Card>
    );
  }

  const groups: { date: string; rows: BacklinkSubmissionRow[] }[] = [];
  for (const s of submissions) {
    const last = groups[groups.length - 1];
    if (last && last.date === s.submissionDate) last.rows.push(s);
    else groups.push({ date: s.submissionDate, rows: [s] });
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.date} className="rounded-xl border border-border">
          <div className="flex items-center justify-between rounded-t-xl border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{g.date}</span>
            <span>{g.rows.length} submission{g.rows.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="divide-y divide-border/60">
            {g.rows.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-foreground">
                    <span className="mr-1 text-xs font-medium text-muted-foreground">Blog post:</span>
                    {s.blogPostUrl ? (
                      <a href={s.blogPostUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" title={s.blogPostLabel}>
                        {s.blogPostLabel}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">NA</span>
                    )}
                  </div>
                  {s.topicName && (
                    <div className="truncate text-xs text-muted-foreground" title={s.topicName}>
                      Topic: {s.topicName}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <a
                    href={s.submissionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Open the live submission"
                  >
                    <ExternalLink className="size-3" /> Open
                  </a>
                  <BacklinkSubmissionActions
                    projectId={projectId}
                    submissionId={s.id}
                    topicName={s.topicName}
                    verificationStatus={s.verificationStatus}
                    verificationNote={s.verificationNote}
                    assignedTo={s.assignedTo}
                    members={members}
                    canManage={canManage}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
