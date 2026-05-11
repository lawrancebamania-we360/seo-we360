"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Sparkles, Copy, Loader2, Pin, Flame, Pencil, Save, X,
  Calendar, User, Trash2, CheckCircle2, PenLine, Hash, Heading1,
  Heading2, Heading3, List, ListChecks, Link2, BookOpen, NotebookPen,
  Image as ImageIcon, BarChart3, AlertTriangle, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { competitionColor, priorityColor, initials, formatNumber, stripTaskKey, stripTaskPrefix, formatVolume, taskTypeBadgeClass, taskKindLabel } from "@/lib/ui-helpers";
import { updateTask, deleteTask } from "@/lib/actions/tasks";
import { ByokDialog } from "@/components/sections/byok-dialog";
import { AssigneePicker } from "@/components/sections/assignee-picker";
import { BlogImageUploader } from "@/components/sections/blog-image-uploader";
import { SupportingLinksEditor } from "@/components/sections/supporting-links-editor";
import { AiVerificationPanel } from "@/components/sections/ai-verification-panel";
import { ReviewerToggleButton } from "@/components/sections/reviewer-chip";
import { createArticle } from "@/lib/actions/articles";
import { briefToMarkdownPrompt, type BlogBrief } from "@/lib/seo-skills/blog-brief";
import type { TaskWithAssignee } from "@/lib/data/tasks";
import type { Profile } from "@/lib/types/database";
import { format, formatDistanceToNow } from "date-fns";

interface Props {
  task: TaskWithAssignee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
  canEdit: boolean;
  projectId: string;
}

function emptyBrief(task: TaskWithAssignee): BlogBrief {
  const kw = task.target_keyword ?? task.title.replace(/^Write article:\s*/i, "");
  return {
    title: task.title.replace(/^Write article:\s*/i, "") || kw,
    target_keyword: kw,
    secondary_keywords: [],
    intent: task.intent ?? "informational",
    recommended_h1: "",
    recommended_h2s: [],
    recommended_h3s: [],
    sections_breakdown: [],
    word_count_target: task.word_count_target ?? 1500,
    paa_questions: [],
    internal_links: [],
    competitor_refs: [],
    writer_notes: [],
    generated_by: "manual",
  };
}

export function BlogTaskDetailDialog({ task, open, onOpenChange, members, canEdit, projectId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92svh] overflow-y-auto we360-scroll pr-10">
        {!task ? null : (
          <BlogTaskContent
            task={task}
            members={members}
            canEdit={canEdit}
            projectId={projectId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BlogTaskContent({
  task, members, canEdit, projectId, onClose,
}: {
  task: TaskWithAssignee;
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
  canEdit: boolean;
  projectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [byokOpen, setByokOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const initialBrief = useMemo(() => {
    if (task.brief && typeof task.brief === "object") return task.brief as unknown as BlogBrief;
    return emptyBrief(task);
  }, [task]);
  const [draft, setDraft] = useState<BlogBrief>(initialBrief);
  const [assignee, setAssignee] = useState<string>(task.team_member_id ?? "");
  const [priority, setPriority] = useState<"critical" | "high" | "medium" | "low">(task.priority);
  const [scheduled, setScheduled] = useState<string>(task.scheduled_date ?? "");
  // Data backing — mandatory for blog tasks per the 100K plan. Writers should
  // see the GSC/GA4 evidence pinned at top of the dialog before they read brief.
  const [dataBacking, setDataBacking] = useState<string>(task.data_backing ?? "");

  const changed = useMemo(() => {
    return (
      JSON.stringify(draft) !== JSON.stringify(initialBrief) ||
      assignee !== (task.team_member_id ?? "") ||
      priority !== task.priority ||
      scheduled !== (task.scheduled_date ?? "") ||
      dataBacking !== (task.data_backing ?? "")
    );
  }, [draft, initialBrief, assignee, priority, scheduled, dataBacking, task]);

  const saveBrief = () => {
    start(async () => {
      try {
        await updateTask(task.id, {
          brief: draft,
          title: `Write article: ${draft.target_keyword}`,
          target_keyword: draft.target_keyword,
          word_count_target: draft.word_count_target,
          team_member_id: assignee || null,
          priority,
          scheduled_date: scheduled || null,
          data_backing: dataBacking || null,
        });
        toast.success("Brief saved");
        setEditing(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const cancelEdit = () => {
    setDraft(initialBrief);
    setAssignee(task.team_member_id ?? "");
    setPriority(task.priority);
    setScheduled(task.scheduled_date ?? "");
    setDataBacking(task.data_backing ?? "");
    setEditing(false);
  };

  const onCopyPrompt = async () => {
    // Pass data_backing through so the AI prompt includes the GSC/GA4
    // backing block — this is what tells the LLM WHY the article exists
    // and which queries already have momentum to build on.
    // Pass the kind so the prompt frames itself correctly:
    // "# Blog Article Brief" / "# Landing Page Brief" / "# Blog Refresh
    // Brief" / "# Landing Page Refresh Brief" / "# SEO Ops Task".
    const kind = taskKindLabel(task);
    const prompt = briefToMarkdownPrompt(
      draft,
      "We360.ai",
      "we360.ai",
      task.data_backing,
      { action: kind.action, surface: kind.surface },
      task.assignee?.name ?? null,
    );
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success(`${kind.label} brief copied — paste into any LLM`);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const onGenerated = (body: { content: string; title?: string; metaDescription?: string }) => {
    start(async () => {
      try {
        const article = await createArticle({
          project_id: projectId,
          keyword_id: task.keyword_id,
          title: body.title ?? draft.recommended_h1 ?? task.title,
          target_keyword: draft.target_keyword,
          content: body.content,
          meta_description: body.metaDescription,
          ai_provider: "claude",
          status: "draft",
        });
        await updateTask(task.id, { status: "in_progress" });
        toast.success("Draft generated — opening article editor");
        onClose();
        router.push(`/dashboard/articles/${article.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save article");
      }
    });
  };

  const moveStage = (status: "todo" | "in_progress" | "done") => {
    start(async () => {
      try {
        await updateTask(task.id, { status });
        toast.success(`Moved to ${status.replace("_", " ")}`);
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Move failed");
      }
    });
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const doDelete = () => {
    start(async () => {
      try {
        await deleteTask(task.id);
        toast.success("Deleted");
        setConfirmDelete(false);
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    });
  };

  const hasBrief = draft.recommended_h2s.length > 0 || draft.sections_breakdown.length > 0;
  // Ops tasks (GBP setup, GA4 cleanup, monthly report, etc.) live in the
  // SEO bucket but don't have a target_keyword — they're admin/audit work,
  // not articles. Hide all the brief/writing fields for them and just show
  // the data backing + What's wrong + How to fix.
  const isOpsTask = !task.target_keyword;

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <DialogHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editing ? (
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="text-lg font-semibold"
              />
            ) : (
              <>
                <DialogTitle className="text-xl leading-snug pr-2">
                  {draft.title || stripTaskPrefix(stripTaskKey(task.title)).replace(/^Write article:\s*/i, "")}
                </DialogTitle>
                {(task.task_type || (task.est_volume != null && task.est_volume > 0)) && (
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {task.task_type && (
                      <Badge className={cn("border text-[10px]", taskTypeBadgeClass(task.task_type))}>
                        {task.task_type}
                      </Badge>
                    )}
                    {task.est_volume != null && task.est_volume > 0 && (
                      <Badge variant="outline" className="tabular-nums text-[10px]">
                        {formatVolume(task.est_volume)} search vol
                      </Badge>
                    )}
                  </div>
                )}
              </>
            )}
            {/* Kind label — same Badge that's on the kanban card so the
                classification is consistent everywhere. Replaces the older
                generic "Blog brief · Manual" subtitle. */}
            {(() => {
              const kind = taskKindLabel(task);
              return (
                <DialogDescription className="mt-1.5 inline-flex items-center gap-2">
                  <Badge className={cn("border text-[10px] font-semibold uppercase tracking-wider", kind.classes)}>
                    {kind.label}
                  </Badge>
                  {task.source === "cron_audit" && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Auto-discovered</span>
                  )}
                </DialogDescription>
              );
            })()}
          </div>
          {/* Action buttons — split into two access tiers:
              - Members + admins: Copy prompt, Edit brief, Generate with AI
                (writers need these to actually do their job).
              - Admins only: Reassign (AssigneePicker) + Delete.
              The whole row is hidden during the inline editing state. */}
          {!editing && (
            <div className="flex items-center gap-1.5 shrink-0 mr-6">
              {/* Admin-only: change task assignee */}
              {canEdit && (
                <AssigneePicker
                  taskId={task.id}
                  currentAssignee={task.team_member_id}
                  members={members}
                />
              )}
              {/* Everyone: copy AI prompt */}
              {!isOpsTask && (
                <Button size="icon-sm" variant="outline" onClick={onCopyPrompt} aria-label="Copy prompt" title="Copy prompt for local AI">
                  <Copy className="size-3.5" />
                </Button>
              )}
              {/* Everyone: edit brief / task */}
              <Button size="icon-sm" variant="outline" onClick={() => setEditing(true)} aria-label={isOpsTask ? "Edit task" : "Edit brief"} title={isOpsTask ? "Edit task" : "Edit brief"}>
                <Pencil className="size-3.5" />
              </Button>
              {/* Admin-only: delete task */}
              {canEdit && (
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete task"
                  title="Delete task"
                  className="hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
              {/* Everyone: open article OR generate with AI */}
              {!isOpsTask && (task.article_id ? (
                <Button variant="brand" size="sm" onClick={() => { router.push(`/dashboard/articles/${task.article_id}`); onClose(); }}>
                  <PenLine className="size-3.5" />
                  Open article
                </Button>
              ) : (
                <Button variant="brand" size="sm" onClick={() => setByokOpen(true)} disabled={pending}>
                  <Sparkles className="size-3.5" />
                  Generate with AI
                </Button>
              ))}
            </div>
          )}
        </div>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        {draft.intent && (
          <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
            {draft.intent}
          </Badge>
        )}
        <Badge className={cn("gap-0.5", priorityColor(task.priority))}>
          {(task.priority === "critical" || task.priority === "high") && <Flame className="size-3" />}
          {task.priority} priority
        </Badge>
        {task.competition && (
          <Badge className={competitionColor(task.competition)}>
            {task.competition}
          </Badge>
        )}
        {draft.generated_by !== "manual" && (
          <Badge variant="outline" className="text-[10px]">
            Brief: {draft.generated_by}
          </Badge>
        )}
      </div>

      {/* Data backing — pinned to the top so the GSC/GA4 evidence justifying
          this article is the first thing the writer reads. Mandatory per the
          100K plan; if empty, we still render the slot in edit mode so the
          writer is nudged to fill it in. */}
      {editing ? (
        <div className="rounded-md border-2 border-[#FEB800]/60 bg-[#FEB800]/10 p-3 space-y-1.5">
          <Label className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-[#8a6500] dark:text-[#FEB800]">
            <BarChart3 className="size-3.5" />
            Data backing <span className="text-[10px] normal-case font-normal text-muted-foreground">(GSC / GA4 / PSI evidence)</span>
          </Label>
          <Textarea
            value={dataBacking}
            onChange={(e) => setDataBacking(e.target.value)}
            rows={3}
            placeholder="GSC: hubstaff alternative — 1,326 imp/16-mo, 3 clicks, avg pos 25.0. GA4 organic: 0 sessions/mo (forward bet)."
            className="bg-white/60 dark:bg-black/20 text-sm"
          />
        </div>
      ) : task.data_backing ? (
        <div className="rounded-md border-2 border-[#FEB800]/60 bg-[#FEB800]/10 p-3 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-[#8a6500] dark:text-[#FEB800]">
            <BarChart3 className="size-3.5" />
            Data backing
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-[#231D4F] dark:text-foreground">
            {task.data_backing}
          </p>
        </div>
      ) : null}

      {/* What's wrong + How to fix — ALWAYS render if present, regardless of
          ops vs content. The Action: preamble baked into `issue` by the
          import script tells the user exactly what kind of work this is. */}
      {task.issue && (
        <div className="rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-3 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-rose-700 dark:text-rose-300">
            <AlertTriangle className="size-3.5" />
            What's wrong / why this matters
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-rose-900 dark:text-rose-100">
            {task.issue}
          </p>
        </div>
      )}
      {task.impl && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-3 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-300">
            <Wrench className="size-3.5" />
            How to do it / acceptance criteria
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-emerald-900 dark:text-emerald-100">
            {task.impl}
          </p>
        </div>
      )}

      {/* Brief fields — only for content tasks (have a target_keyword).
          SEO ops tasks (GBP, GA4 cleanup, etc.) skip this entire block. */}
      {!isOpsTask && (
        <>
      {!hasBrief && !editing && (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No brief yet. Click <strong>Edit brief</strong> to build one.
        </div>
      )}

      <Field label="Target Keyword" icon={Pin}>
        {editing ? (
          <Input value={draft.target_keyword} onChange={(e) => setDraft({ ...draft, target_keyword: e.target.value })} />
        ) : (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{draft.target_keyword}</div>
        )}
      </Field>

      <Field label="Secondary Keywords" icon={Hash}>
        <ListEdit
          editing={editing}
          values={draft.secondary_keywords}
          onChange={(values) => setDraft({ ...draft, secondary_keywords: values })}
          placeholder="Comma- or newline-separated"
          inline
        />
      </Field>

      <Field label="Search Intent" icon={Sparkles}>
        {editing ? (
          <Input value={draft.intent} onChange={(e) => setDraft({ ...draft, intent: e.target.value })} placeholder="informational / commercial / transactional" />
        ) : (
          <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{draft.intent}</Badge>
        )}
      </Field>

      <Field label="Recommended H1 (1 tag)" icon={Heading1}>
        {editing ? (
          <Textarea rows={2} value={draft.recommended_h1} onChange={(e) => setDraft({ ...draft, recommended_h1: e.target.value })} />
        ) : (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">{draft.recommended_h1}</div>
        )}
      </Field>

      <Field label={`Recommended H2 Count: ${draft.recommended_h2s.length} Main Sections`} icon={Heading2}>
        <ListEdit
          editing={editing}
          values={draft.recommended_h2s}
          onChange={(values) => setDraft({ ...draft, recommended_h2s: values })}
          placeholder="One H2 per line"
          accent="violet"
        />
      </Field>

      <Field label={`Recommended H3 Count: ${draft.recommended_h3s.length} Subsections`} icon={Heading3}>
        <ListEdit
          editing={editing}
          values={draft.recommended_h3s}
          onChange={(values) => setDraft({ ...draft, recommended_h3s: values })}
          placeholder="One H3 per line"
          accent="violet"
        />
      </Field>

      <Field label="Sections Breakdown" icon={List}>
        <ListEdit
          editing={editing}
          values={draft.sections_breakdown}
          onChange={(values) => setDraft({ ...draft, sections_breakdown: values })}
          placeholder="One section per line"
          ordered
        />
      </Field>

      <Field label="Target Word Count" icon={Hash}>
        {editing ? (
          <Input
            type="number"
            value={draft.word_count_target}
            onChange={(e) => setDraft({ ...draft, word_count_target: parseInt(e.target.value) || 0 })}
          />
        ) : (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-semibold">
            {formatNumber(draft.word_count_target)} words
          </div>
        )}
      </Field>

      <Field label="Questions to Answer (People Also Ask)" icon={ListChecks}>
        <ListEdit
          editing={editing}
          values={draft.paa_questions}
          onChange={(values) => setDraft({ ...draft, paa_questions: values })}
          placeholder="One PAA question per line"
        />
      </Field>

      <Field label="Internal Linking Suggestions" icon={Link2}>
        <ListEdit
          editing={editing}
          values={draft.internal_links}
          onChange={(values) => setDraft({ ...draft, internal_links: values })}
          placeholder="/slug per line"
          inline
          accent="violet"
        />
      </Field>

      <Field label="Competitor Articles to Reference" icon={BookOpen}>
        <ListEdit
          editing={editing}
          values={draft.competitor_refs}
          onChange={(values) => setDraft({ ...draft, competitor_refs: values })}
          placeholder="One reference per line"
        />
      </Field>

      <Field label="Writer Notes & SEO Checklist" icon={NotebookPen}>
        <ListEdit
          editing={editing}
          values={draft.writer_notes}
          onChange={(values) => setDraft({ ...draft, writer_notes: values })}
          placeholder="One note per line"
        />
      </Field>

      <Field label="Supporting links" icon={Link2}>
        {/* Writers (members) own their supporting links — passing true so
            they can add/remove without an admin in the loop. */}
        <SupportingLinksEditor
          taskId={task.id}
          links={task.supporting_links ?? []}
          canEdit={true}
          onChange={() => { /* persisted via server action */ }}
        />
      </Field>

      {/* Human reviewer sign-off (e.g. Lokesh checking writers' work).
          Independent of AI verification — captures the editorial pass.
          Admin-only toggle; members see a read-only chip if reviewed. */}
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          Editorial review
        </div>
        <ReviewerToggleButton
          taskId={task.id}
          reviewer={task.reviewer ? { id: task.reviewer.id, name: task.reviewer.name } : null}
          reviewedAt={task.reviewed_at}
          canReview={canEdit}
          onChanged={() => { /* card refreshes from the parent's localTasks */ }}
        />
      </div>

      {/* AI verification — surfaces only after the task has moved to Done
          or Published (and a verification row exists). Sits right under
          Supporting links because that's where writers paste the Google
          Doc URL the AI will check. */}
      {task.ai_verification_status && (
        <AiVerificationPanel
          taskId={task.id}
          taskStatus={task.status}
          canEdit={canEdit}
          liveStatus={task.ai_verification_status}
          liveScore={task.ai_score}
          liveDelta={task.ai_score_delta}
          liveSummary={task.ai_verification_summary}
          liveVerifiedAt={task.ai_verified_at}
        />
      )}

      <Field label="Reference images" icon={ImageIcon}>
        {/* Same — writers upload their own reference images. */}
        <BlogImageUploader
          taskId={task.id}
          projectId={projectId}
          images={task.reference_images ?? []}
          canEdit={true}
          onChange={() => { /* persisted via server action */ }}
        />
      </Field>
        </>
      )}

      {/* Task settings — only editable in edit mode */}
      {editing && (
        <div className="rounded-md border bg-muted/20 p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Task settings
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground block">
                Assigned to
              </Label>
              <Select
                value={assignee || "__unassigned"}
                onValueChange={(v) => setAssignee(v === "__unassigned" ? "" : (v ?? ""))}
              >
                <SelectTrigger className="w-full h-8">
                  {/* Render-function child resolves the UUID to a name. */}
                  <SelectValue>
                    {(value: string | null) => {
                      if (!value || value === "__unassigned") return "Unassigned";
                      return members.find((m) => m.id === value)?.name ?? value;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id} label={m.name}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-4 rounded-full bg-muted text-[8px] inline-flex items-center justify-center font-medium">
                          {initials(m.name)}
                        </span>
                        {m.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground block">
                Priority
              </Label>
              <Select value={priority} onValueChange={(v) => v && setPriority(v as typeof priority)}>
                <SelectTrigger className="w-full h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground block">
                Scheduled
              </Label>
              <Input
                type="date"
                value={scheduled}
                onChange={(e) => setScheduled(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground pt-3 border-t">
        <div className="flex items-center gap-1.5">
          <Calendar className="size-3.5" />
          Added {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
        </div>
        {task.scheduled_date && (
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            Due {format(new Date(task.scheduled_date), "MMM d, yyyy")}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <User className="size-3.5" />
          {task.assignee ? (
            <span className="flex items-center gap-1.5">
              <Avatar className="size-4"><AvatarFallback className="text-[8px]">{initials(task.assignee.name)}</AvatarFallback></Avatar>
              {task.assignee.name}
            </span>
          ) : "Unassigned"}
        </div>
        {task.completed_at && (
          <div className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 className="size-3.5" />
            Published {format(new Date(task.completed_at), "MMM d")}
          </div>
        )}
      </div>

      {/* Save / Move to — available to everyone so writers can save their
          edits and move tasks across the kanban without an admin in the loop. */}
      <div className="pt-4 border-t">
          {editing ? (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={cancelEdit} disabled={pending}>
                <X className="size-3.5" />
                Cancel
              </Button>
              <Button size="sm" onClick={saveBrief} disabled={pending || !changed}>
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Save brief
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground shrink-0">
                Move to
              </Label>
              <Select
                value={task.status}
                onValueChange={(v) => v && moveStage(v as "todo" | "in_progress" | "done")}
              >
                <SelectTrigger className="w-44 h-8" disabled={pending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">💡 Idea</SelectItem>
                  <SelectItem value="in_progress">⚡ In progress</SelectItem>
                  <SelectItem value="review">✓ Done</SelectItem>
                  <SelectItem value="done">✨ Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

      {/* Delete confirmation */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                <Trash2 className="size-4" />
              </div>
              Delete this blog task?
            </DialogTitle>
            <DialogDescription>
              This removes the task + brief permanently. The underlying Apify keyword stays in your Keywords list.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={doDelete} disabled={pending} className="bg-rose-600 hover:bg-rose-700 text-white">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete task
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ByokDialog
        open={byokOpen}
        onOpenChange={setByokOpen}
        targetKeyword={draft.target_keyword}
        competition={task.competition}
        mode="full"
        onGenerated={onGenerated}
      />
    </motion.div>
  );
}


function Field({ label, icon: Icon, children }: { label: string; icon: typeof Pin; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
        <Icon className="size-3" />
        {label}
      </Label>
      {children}
    </div>
  );
}

function ListEdit({
  editing, values, onChange, placeholder, inline = false, ordered = false, accent,
}: {
  editing: boolean;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  inline?: boolean;
  ordered?: boolean;
  accent?: "violet";
}) {
  if (editing) {
    return (
      <Textarea
        value={values.join("\n")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(/[\n,]/)
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
        placeholder={placeholder}
        rows={Math.max(3, Math.min(8, values.length + 1))}
        className="text-sm"
      />
    );
  }
  if (values.length === 0) {
    return <div className="text-xs text-muted-foreground italic">Not set</div>;
  }
  if (inline) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span
            key={i}
            className={cn(
              "text-xs px-2 py-1 rounded-md",
              accent === "violet"
                ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                : "bg-muted text-foreground/80"
            )}
          >
            {v}
          </span>
        ))}
      </div>
    );
  }
  if (ordered) {
    return (
      <ol className="space-y-1 text-sm list-decimal list-inside">
        {values.map((v, i) => (
          <li key={i} className="text-foreground/90 leading-relaxed">{v}</li>
        ))}
      </ol>
    );
  }
  return (
    <ul className="space-y-1.5">
      {values.map((v, i) => (
        <li
          key={i}
          className={cn(
            "text-sm flex items-start gap-2 rounded-md border-l-2 bg-muted/30 px-3 py-1.5",
            accent === "violet" ? "border-violet-400" : "border-border"
          )}
        >
          <CheckCircle2 className="size-3.5 mt-0.5 shrink-0 text-violet-500" />
          <span className="leading-relaxed">{v}</span>
        </li>
      ))}
    </ul>
  );
}
