"use client";

// Shared form fields for the link-exchange detail, used by both the Add and
// Edit backlink dialogs. Top: the enrichment of the link we GOT (type, spam,
// anchor text + target, contact email). The reciprocal "link we gave" block
// shows only for a Link exchange (a one-directional guest post has no return
// link) - or whenever an existing row already has reciprocal data.

import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";

export interface ExchangeFieldValues {
  linkType: string;
  spamScore: string;
  anchorText: string;
  anchorTarget: string;
  contactEmail: string;
  givenUrl: string;
  givenAnchorText: string;
  givenAnchorTarget: string;
  givenDomainRating: string;
  givenSpamScore: string;
  givenDate: string;
}

export const EMPTY_EXCHANGE: ExchangeFieldValues = {
  linkType: "", spamScore: "", anchorText: "", anchorTarget: "", contactEmail: "",
  givenUrl: "", givenAnchorText: "", givenAnchorTarget: "", givenDomainRating: "", givenSpamScore: "", givenDate: "",
};

const NONE = "__none__";
const LINK_TYPE_ITEMS = [
  { value: NONE, label: "Not set" },
  { value: "Link exchange", label: "Link exchange" },
  { value: "Guest post", label: "Guest post" },
  { value: "PR", label: "PR" },
  { value: "Paid", label: "Paid" },
  { value: "HARO", label: "HARO" },
  { value: "Resource page", label: "Resource page" },
  { value: "Other", label: "Other" },
];

// Map the form values to the snake_case optional fields the server action takes.
export function toExchangeInput(v: ExchangeFieldValues) {
  const s = (x: string) => (x.trim() ? x.trim() : undefined);
  return {
    link_type: s(v.linkType),
    spam_score: s(v.spamScore),
    anchor_text: s(v.anchorText),
    anchor_target: s(v.anchorTarget),
    contact_email: s(v.contactEmail),
    given_url: s(v.givenUrl),
    given_anchor_text: s(v.givenAnchorText),
    given_anchor_target: s(v.givenAnchorTarget),
    given_domain_rating: s(v.givenDomainRating),
    given_spam_score: s(v.givenSpamScore),
    given_date: s(v.givenDate),
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export function ExchangeFields({ values, onChange, idPrefix }: {
  values: ExchangeFieldValues;
  onChange: (patch: Partial<ExchangeFieldValues>) => void;
  idPrefix: string;
}) {
  const hasGiven = !!(values.givenUrl || values.givenAnchorText || values.givenAnchorTarget || values.givenDomainRating || values.givenSpamScore || values.givenDate);
  const showGiven = values.linkType === "Link exchange" || hasGiven;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Link we got</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Link type">
          <Combobox
            id={`${idPrefix}-link-type`}
            items={LINK_TYPE_ITEMS}
            value={values.linkType || NONE}
            onValueChange={(v) => onChange({ linkType: v === NONE ? "" : v })}
            placeholder="Not set"
            className="h-9 w-full"
          />
        </Field>
        <Field label="Spam % (optional)">
          <Input id={`${idPrefix}-spam`} type="number" min={0} max={100} step="0.01" value={values.spamScore}
            onChange={(e) => onChange({ spamScore: e.target.value })} placeholder="0-100" className="h-9" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Anchor text (optional)">
          <Input id={`${idPrefix}-anchor-text`} value={values.anchorText}
            onChange={(e) => onChange({ anchorText: e.target.value })} placeholder="we360" className="h-9" />
        </Field>
        <Field label="Anchor target (optional)">
          <Input id={`${idPrefix}-anchor-target`} value={values.anchorTarget}
            onChange={(e) => onChange({ anchorTarget: e.target.value })} placeholder="we360.ai" className="h-9" />
        </Field>
      </div>
      <Field label="Contact email (optional)">
        <Input id={`${idPrefix}-email`} type="email" value={values.contactEmail}
          onChange={(e) => onChange({ contactEmail: e.target.value })} placeholder="name@partner.com" className="h-9" />
      </Field>

      {showGiven && (
        <>
          <div className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Link we gave back</div>
          <Field label="Link we gave (our page)">
            <Input id={`${idPrefix}-given-url`} value={values.givenUrl}
              onChange={(e) => onChange({ givenUrl: e.target.value })} placeholder="we360.ai/blog/..." className="h-9" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Their anchor text">
              <Input id={`${idPrefix}-given-anchor-text`} value={values.givenAnchorText}
                onChange={(e) => onChange({ givenAnchorText: e.target.value })} placeholder="PPC" className="h-9" />
            </Field>
            <Field label="Their anchor target">
              <Input id={`${idPrefix}-given-anchor-target`} value={values.givenAnchorTarget}
                onChange={(e) => onChange({ givenAnchorTarget: e.target.value })} placeholder="partner.com/page" className="h-9" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Their DR">
              <Input id={`${idPrefix}-given-dr`} type="number" min={0} max={100} value={values.givenDomainRating}
                onChange={(e) => onChange({ givenDomainRating: e.target.value })} placeholder="0-100" className="h-9" />
            </Field>
            <Field label="Their spam %">
              <Input id={`${idPrefix}-given-spam`} type="number" min={0} max={100} step="0.01" value={values.givenSpamScore}
                onChange={(e) => onChange({ givenSpamScore: e.target.value })} placeholder="0-100" className="h-9" />
            </Field>
            <Field label="Date gave">
              <Input id={`${idPrefix}-given-date`} type="date" value={values.givenDate}
                onChange={(e) => onChange({ givenDate: e.target.value })} className="h-9" />
            </Field>
          </div>
        </>
      )}
    </div>
  );
}
