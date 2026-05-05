"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Sparkles, FileText, Save, Loader2, Upload, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ByokDialog } from "@/components/sections/byok-dialog";
import { competitionColor, formatNumber } from "@/lib/ui-helpers";
import { createArticle } from "@/lib/actions/articles";
import type { Keyword } from "@/lib/types/database";

interface Props {
  projectId: string;
  keywords: Keyword[];
  initialKeywordId?: string;
  initialKeyword?: string;
}

export function NewArticleForm({ projectId, keywords, initialKeywordId, initialKeyword }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [keywordId, setKeywordId] = useState(initialKeywordId ?? "");
  const [targetKeyword, setTargetKeyword] = useState(initialKeyword ?? "");
  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState("");
  const [content, setContent] = useState("");
  const [byokOpen, setByokOpen] = useState<"outline" | "full" | null>(null);

  const selectedKeyword = keywords.find((k) => k.id === keywordId);
  const keywordText = selectedKeyword?.keyword ?? targetKeyword;
  const competition = selectedKeyword?.competition ?? null;

  const onKeywordChange = (id: string | null) => {
    if (!id) return;
    setKeywordId(id);
    const k = keywords.find((kk) => kk.id === id);
    if (k) setTargetKeyword(k.keyword);
  };

  const onGenerated = (body: { content: string; title?: string; metaDescription?: string }) => {
    if (body.title) setTitle(body.title);
    if (body.metaDescription) setMeta(body.metaDescription);
    setContent(body.content);
  };

  const onSave = (status: "draft" | "review") => {
    start(async () => {
      try {
        const a = await createArticle({
          project_id: projectId,
          keyword_id: keywordId || null,
          title: title || keywordText || "Untitled",
          target_keyword: keywordText || null,
          content: content || null,
          meta_description: meta || null,
          status,
        });
        toast.success(status === "draft" ? "Saved as draft" : "Submitted for review");
        router.push(`/dashboard/articles/${a.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save");
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <Button variant="ghost" size="sm" render={<Link href="/dashboard/articles" />}>
        <ArrowLeft className="size-3.5" />
        Back to articles
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New article</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a keyword, generate an outline, then generate or write the full piece. Approvals happen on the next screen.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">1</span>
          <div className="font-medium">Target keyword</div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Pick from tracked keywords</Label>
            <Select value={keywordId} onValueChange={onKeywordChange}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a keyword..." /></SelectTrigger>
              <SelectContent>
                {keywords.length === 0 && <div className="p-2 text-xs text-muted-foreground">No keywords tracked yet</div>}
                {keywords.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.keyword}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Or enter manually</Label>
            <Input
              value={targetKeyword}
              onChange={(e) => { setTargetKeyword(e.target.value); setKeywordId(""); }}
              placeholder="skydiving in india"
            />
          </div>
        </div>
        {selectedKeyword && (
          <div className="flex items-center gap-2 text-xs">
            {selectedKeyword.competition && (
              <Badge variant="outline" className={competitionColor(selectedKeyword.competition)}>
                {selectedKeyword.competition.replace(" Competition", "")}
              </Badge>
            )}
            <span className="text-muted-foreground">
              Volume: <span className="font-medium text-foreground">{formatNumber(selectedKeyword.search_volume)}</span>
            </span>
            {selectedKeyword.kd != null && (
              <span className="text-muted-foreground">
                KD: <span className="font-medium text-foreground">{selectedKeyword.kd}</span>
              </span>
            )}
            {selectedKeyword.intent && (
              <span className="text-muted-foreground">
                Intent: <span className="font-medium text-foreground">{selectedKeyword.intent}</span>
              </span>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">2</span>
            <div className="font-medium">Write or generate</div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setByokOpen("outline")}
              disabled={!keywordText}
            >
              <Sparkles className="size-3.5 text-violet-500" />
              Generate outline
            </Button>
            <Button size="sm" onClick={() => setByokOpen("full")} disabled={!keywordText}>
              <Sparkles className="size-3.5" />
              Generate full article
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="10 Best Spots for Skydiving in India (2026 Guide)" />
        </div>
        <div className="space-y-1.5">
          <Label>Meta description</Label>
          <Input value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="Up to 160 characters..." />
        </div>
        <div className="space-y-1.5">
          <Label>Content (Markdown supported)</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            className="font-mono text-xs"
            placeholder="# H1&#10;&#10;Paragraph...&#10;&#10;## Section&#10;&#10;- Bullet&#10;- Bullet&#10;&#10;## FAQ&#10;&#10;**Q:** ...&#10;**A:** ..."
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{content.split(/\s+/).filter(Boolean).length} words</span>
            <span>Or <label className="underline cursor-pointer"><input type="file" accept=".md,.txt" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setContent(await f.text()); }} />upload a .md file</label></span>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => onSave("draft")} disabled={pending}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          <Save className="size-3.5" />
          Save draft
        </Button>
        <Button onClick={() => onSave("review")} disabled={pending}>
          <Upload className="size-3.5" />
          Submit for review
        </Button>
      </div>

      <ByokDialog
        open={byokOpen !== null}
        onOpenChange={(v) => !v && setByokOpen(null)}
        targetKeyword={keywordText}
        competition={competition}
        mode={byokOpen ?? "full"}
        onGenerated={onGenerated}
      />
    </motion.div>
  );
}
