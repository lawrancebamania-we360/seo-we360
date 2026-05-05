"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, CheckCircle2, XCircle, Loader2, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateArticle, deleteArticle } from "@/lib/actions/articles";
import type { ArticleWithAuthor } from "@/lib/data/articles";

interface Props {
  article: ArticleWithAuthor;
  canApprove: boolean;
}

export function EditArticleForm({ article, canApprove }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(article.title);
  const [meta, setMeta] = useState(article.meta_description ?? "");
  const [content, setContent] = useState(article.content ?? "");
  const [publishedUrl, setPublishedUrl] = useState(article.published_url ?? "");
  const [rejectionReason, setRejectionReason] = useState(article.rejection_reason ?? "");

  const save = (status?: typeof article.status) => {
    start(async () => {
      try {
        await updateArticle(article.id, {
          title,
          content,
          meta_description: meta,
          published_url: publishedUrl || null,
          rejection_reason: rejectionReason || null,
          status,
        });
        toast.success(status ? `Status → ${status}` : "Saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    });
  };

  const del = () => {
    if (!confirm("Delete this article permanently?")) return;
    start(async () => {
      try {
        await deleteArticle(article.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not delete");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary">{article.status}</Badge>
            {article.ai_provider && article.ai_provider !== "manual" && (
              <Badge variant="outline">{article.ai_provider}</Badge>
            )}
            {article.keyword && (
              <Badge variant="outline">{article.keyword.keyword}</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {article.word_count} words · Last updated {new Date(article.updated_at).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canApprove && article.status === "review" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const r = prompt("Reason for rejection?");
                  if (r !== null) {
                    setRejectionReason(r);
                    save("rejected");
                  }
                }}
                disabled={pending}
              >
                <XCircle className="size-3.5" />
                Reject
              </Button>
              <Button size="sm" onClick={() => save("approved")} disabled={pending}>
                <CheckCircle2 className="size-3.5" />
                Approve
              </Button>
            </>
          )}
          {canApprove && article.status === "approved" && (
            <Button size="sm" onClick={() => save("published")} disabled={pending || !publishedUrl}>
              <Upload className="size-3.5" />
              Mark published
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={del} disabled={pending}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {article.status === "rejected" && article.rejection_reason && (
        <Card className="p-3 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-sm">
          <span className="font-medium text-rose-700 dark:text-rose-400">Rejected: </span>
          <span className="text-rose-900 dark:text-rose-200">{article.rejection_reason}</span>
        </Card>
      )}

      <Card className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Meta description</Label>
          <Input value={meta} onChange={(e) => setMeta(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Content</Label>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={24} className="font-mono text-xs" />
        </div>
        {(article.status === "approved" || article.status === "published") && (
          <div className="space-y-1.5">
            <Label>Published URL</Label>
            <Input value={publishedUrl} onChange={(e) => setPublishedUrl(e.target.value)} placeholder="https://..." />
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => save()} disabled={pending}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          <Save className="size-3.5" />
          Save changes
        </Button>
        {article.status === "draft" && (
          <Button onClick={() => save("review")} disabled={pending}>
            <Upload className="size-3.5" />
            Submit for review
          </Button>
        )}
      </div>
    </div>
  );
}
