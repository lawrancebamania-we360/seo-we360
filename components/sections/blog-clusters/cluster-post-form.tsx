"use client";

// Shared structured form for one planned post — used by "Add post" (into an
// existing cluster) and by the "Build manually" tab of New cluster. Title, meta,
// URL slug and primary keyword are required and always shown; everything else is
// optional, tucked behind a "More details" toggle. Values are held as plain
// strings (what inputs produce) and converted to the server action's shape by
// toPostInput — line-based textareas become arrays, "kw, 1200" becomes a
// supporting keyword with a volume.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface PostFormValues {
  title: string;
  metaDescription: string;
  urlSlug: string;
  primaryKeyword: string;
  // optional (all free text in the form)
  supportingKeywords: string; // one per line, "keyword" or "keyword, 1200"
  category: string;
  funnelStage: string;
  contentType: string;
  volMo: string;
  serpVerdict: string;
  h2: string;   // one H2 per line
  faq: string;  // one question per line
  interlinksTo: string;   // one slug per line
  interlinksFrom: string; // one slug per line
  primaryCta: string;
}

export const EMPTY_POST: PostFormValues = {
  title: "", metaDescription: "", urlSlug: "", primaryKeyword: "",
  supportingKeywords: "", category: "", funnelStage: "", contentType: "", volMo: "",
  serpVerdict: "", h2: "", faq: "", interlinksTo: "", interlinksFrom: "", primaryCta: "",
};

/** The four required fields are filled. */
export function isPostValid(v: PostFormValues): boolean {
  return !!(v.title.trim() && v.metaDescription.trim() && v.urlSlug.trim() && v.primaryKeyword.trim());
}

const lines = (s: string): string[] => s.split("\n").map((l) => l.trim()).filter(Boolean);

function parseSupporting(s: string): Array<{ keyword: string; volume: number | null }> {
  return lines(s).map((line) => {
    const m = line.match(/^(.*?)[,|]\s*([\d,]+)\s*$/); // "keyword, 1200" or "keyword | 1200"
    if (m && m[1].trim()) {
      const vol = parseInt(m[2].replace(/,/g, ""), 10);
      return { keyword: m[1].trim(), volume: Number.isFinite(vol) ? vol : null };
    }
    return { keyword: line, volume: null };
  });
}

function intOrNull(s: string): number | null {
  const n = parseInt(s.replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Convert form strings to the addClusterItem / createClusterManual payload. */
export function toPostInput(v: PostFormValues) {
  return {
    title: v.title.trim(),
    meta_description: v.metaDescription.trim(),
    url_slug: v.urlSlug.trim(),
    target_keyword: v.primaryKeyword.trim(),
    supporting_keywords: parseSupporting(v.supportingKeywords),
    category: v.category.trim() || null,
    funnel_stage: v.funnelStage.trim() || null,
    content_type: v.contentType.trim() || null,
    vol_mo: v.volMo.trim() ? intOrNull(v.volMo) : null,
    serp_verdict: v.serpVerdict.trim() || null,
    outline: lines(v.h2),
    faq_candidates: lines(v.faq),
    interlinks_to: lines(v.interlinksTo),
    interlinks_from: lines(v.interlinksFrom),
    primary_cta: v.primaryCta.trim() || null,
  };
}

export function ClusterPostForm({ values, onChange, idPrefix = "post" }: {
  values: PostFormValues;
  onChange: (next: PostFormValues) => void;
  idPrefix?: string;
}) {
  const [showMore, setShowMore] = useState(false);
  const set = (k: keyof PostFormValues, val: string) => onChange({ ...values, [k]: val });
  const id = (k: string) => `${idPrefix}-${k}`;

  return (
    <div className="space-y-3">
      <Field label="Title" required htmlFor={id("title")}>
        <Input id={id("title")} value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="The post's H1 / title" className="h-9 text-[13px]" maxLength={300} />
      </Field>
      <Field label="Meta description" required htmlFor={id("meta")}>
        <Textarea id={id("meta")} value={values.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} placeholder="The search snippet (~155 chars)." rows={2} className="text-[13px]" maxLength={500} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="URL (slug)" required htmlFor={id("slug")}>
          <Input id={id("slug")} value={values.urlSlug} onChange={(e) => set("urlSlug", e.target.value)} placeholder="we360.ai/guides/your-slug" className="h-9 text-[13px]" maxLength={300} />
        </Field>
        <Field label="Primary keyword" required htmlFor={id("pk")}>
          <Input id={id("pk")} value={values.primaryKeyword} onChange={(e) => set("primaryKeyword", e.target.value)} placeholder="The main target keyword" className="h-9 text-[13px]" maxLength={200} />
        </Field>
      </div>

      <button type="button" onClick={() => setShowMore((s) => !s)}
        className="flex items-center gap-1 text-[12px] font-medium text-[#5B45E0] hover:underline dark:text-[#7B62FF]">
        {showMore ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} More details (optional)
      </button>

      {showMore && (
        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
          <Field label="Secondary keywords" htmlFor={id("sk")} hint="One per line. Add volume as “keyword, 1200”.">
            <Textarea id={id("sk")} value={values.supportingKeywords} onChange={(e) => set("supportingKeywords", e.target.value)} placeholder={"employee monitoring software\ntime tracking, 2400"} rows={3} className="text-[13px]" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Category" htmlFor={id("cat")}>
              <Input id={id("cat")} value={values.category} onChange={(e) => set("category", e.target.value)} className="h-9 text-[13px]" maxLength={200} />
            </Field>
            <Field label="Funnel stage" htmlFor={id("fs")} hint="TOFU / MOFU / BOFU">
              <Input id={id("fs")} value={values.funnelStage} onChange={(e) => set("funnelStage", e.target.value)} className="h-9 text-[13px]" maxLength={50} />
            </Field>
            <Field label="Vol/mo" htmlFor={id("vol")}>
              <Input id={id("vol")} value={values.volMo} onChange={(e) => set("volMo", e.target.value)} inputMode="numeric" placeholder="e.g. 1900" className="h-9 text-[13px]" />
            </Field>
          </div>
          <Field label="Content type" htmlFor={id("ct")} hint="e.g. Guide, Listicle, Comparison">
            <Input id={id("ct")} value={values.contentType} onChange={(e) => set("contentType", e.target.value)} className="h-9 text-[13px]" maxLength={200} />
          </Field>
          <Field label="SERP verdict" htmlFor={id("serp")}>
            <Textarea id={id("serp")} value={values.serpVerdict} onChange={(e) => set("serpVerdict", e.target.value)} placeholder="What the current SERP looks like / the angle to win." rows={2} className="text-[13px]" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="H2 candidates" htmlFor={id("h2")} hint="One per line.">
              <Textarea id={id("h2")} value={values.h2} onChange={(e) => set("h2", e.target.value)} rows={3} className="text-[13px]" />
            </Field>
            <Field label="FAQ candidates" htmlFor={id("faq")} hint="One per line.">
              <Textarea id={id("faq")} value={values.faq} onChange={(e) => set("faq", e.target.value)} rows={3} className="text-[13px]" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Interlinks to" htmlFor={id("ilt")} hint="One slug per line.">
              <Textarea id={id("ilt")} value={values.interlinksTo} onChange={(e) => set("interlinksTo", e.target.value)} rows={2} className="text-[13px]" />
            </Field>
            <Field label="Interlinks from" htmlFor={id("ilf")} hint="One slug per line.">
              <Textarea id={id("ilf")} value={values.interlinksFrom} onChange={(e) => set("interlinksFrom", e.target.value)} rows={2} className="text-[13px]" />
            </Field>
          </div>
          <Field label="Primary CTA" htmlFor={id("cta")}>
            <Input id={id("cta")} value={values.primaryCta} onChange={(e) => set("primaryCta", e.target.value)} className="h-9 text-[13px]" maxLength={500} />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, hint, htmlFor, children }: {
  label: string; required?: boolean; hint?: string; htmlFor: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}{required && <span className="text-error-600"> *</span>}
        {hint && <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/70">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}
