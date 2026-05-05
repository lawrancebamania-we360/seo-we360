"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTask } from "@/lib/actions/tasks";
import type { Profile } from "@/lib/types/database";

type TeamMember = Pick<Profile, "id" | "name" | "email" | "avatar_url">;

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
              <Select value={priority} onValueChange={(v) => v && setPriority(v as typeof priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <Select value={assignee || "__unassigned"} onValueChange={(v) => setAssignee(v === "__unassigned" ? "" : (v ?? ""))}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
