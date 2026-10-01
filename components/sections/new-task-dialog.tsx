"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { createTask } from "@/lib/actions/tasks";
import type { Profile } from "@/lib/types/database";

type TeamMember = Pick<Profile, "id" | "name" | "email" | "avatar_url">;

// Select.Value only auto-resolves a label when Select.Root gets an `items`
// map - without it, the trigger shows the raw value (a member's UUID,
// "critical" instead of "Critical", etc).
const PRIORITY_ITEMS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export function NewTaskDialog({ projectId, members }: { projectId: string; members: TeamMember[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [priority, setPriority] = useState<"critical" | "high" | "medium" | "low">("medium");
  const [impact, setImpact] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [issue, setIssue] = useState("");
  const [impl, setImpl] = useState("");
  const [assignee, setAssignee] = useState<string>("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        await createTask({
          project_id: projectId,
          title,
          url: url || null,
          priority,
          impact: impact || null,
          scheduled_date: scheduled || null,
          issue: issue || null,
          impl: impl || null,
          team_member_id: assignee || null,
        });
        toast.success("Task added");
        setOpen(false);
        setTitle(""); setUrl(""); setImpact(""); setScheduled(""); setIssue(""); setImpl(""); setAssignee("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create task");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Plus className="size-4" />New task</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Create a task for this project. You can assign it to a team member.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Add FAQ schema to pricing page" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="url">URL (optional)</Label>
              <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sched">Scheduled</Label>
              <Input id="sched" type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Combobox
                items={PRIORITY_ITEMS}
                value={priority}
                onValueChange={(v) => setPriority(v as typeof priority)}
                placeholder="Priority"
                className="h-8 w-fit"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <Combobox
                items={[{ value: "__unassigned", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
                value={assignee || "__unassigned"}
                onValueChange={(v) => setAssignee(v === "__unassigned" ? "" : v)}
                placeholder="Unassigned"
                className="h-8 w-fit"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="impact">Impact</Label>
            <Input id="impact" value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="+15% CTR" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issue">Issue description</Label>
            <Textarea id="issue" value={issue} onChange={(e) => setIssue(e.target.value)} rows={2} placeholder="What's wrong?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="impl">Implementation / fix</Label>
            <Textarea id="impl" value={impl} onChange={(e) => setImpl(e.target.value)} rows={2} placeholder="How to fix?" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
