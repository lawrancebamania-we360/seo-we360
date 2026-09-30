"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAiVisibilityCategory } from "@/lib/actions/ai-visibility-categories";

export function NewCategoryForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!label.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await createAiVisibilityCategory({ project_id: projectId, label: label.trim(), description: description.trim() || undefined });
    setBusy(false);
    if (!r.ok || !r.key) { setError(r.error ?? "Could not create that category."); return; }
    toast.success(`${label.trim()} is ready - set up personas and prompts here.`);
    router.push(`/dashboard/ai-visibility/${r.key}`);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="category-name">Category name</label>
        <Input
          id="category-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="e.g. Customer Support Software"
          maxLength={60}
          autoFocus
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="category-description">
          What is this product/service? <span className="text-muted-foreground/70">(optional, but sharpens the AI-generated prompts)</span>
        </label>
        <textarea
          id="category-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short, concrete description - who buys it and what it does. Used to frame the buyer questions this category tests, instead of reusing your general brand description."
          maxLength={500}
          className="h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40"
        />
      </div>
      {error && <p className="text-xs text-error-600">{error}</p>}
      <div className="flex justify-end">
        <Button variant="brand" onClick={submit} disabled={busy || !label.trim()} className="gap-1.5">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Create category
        </Button>
      </div>
    </div>
  );
}
