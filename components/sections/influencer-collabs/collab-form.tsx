"use client";

// Influencer Collabs: the one collab form, shared by Add (single entry) and
// Edit so the two can never drift. Field order (Influencer Name, Platform,
// Profile Link, Date of Closing, Post Date, Amount Paid, Post Link, Assignee)
// is a deliberate call: closing the deal logically precedes the content going
// live, so Date of Closing sits before Post Date. Holds no state - the dialog
// owns the draft.

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import type { InfluencerCollabRow, InfluencerPlatform, InfluencerCollabCurrency } from "@/lib/data/influencer-collabs";
import type { Member } from "@/components/sections/assignee-picker";

export const UNASSIGNED = "__unassigned__";
const PLATFORM_ITEMS = (["YouTube", "Instagram", "Facebook", "Twitter", "LinkedIn"] as const).map((p) => ({ value: p, label: p }));
const CURRENCY_ITEMS = [{ value: "INR", label: "INR" }, { value: "USD", label: "USD" }];
const today = (): string => new Date().toISOString().slice(0, 10);

export interface CollabDraft {
  influencerName: string;
  platform: InfluencerPlatform;
  profileLink: string;
  closingDate: string;
  postDate: string;
  amount: string;
  currency: InfluencerCollabCurrency;
  isFree: boolean;
  postLink: string;
  assignedTo: string;   // a member id, or UNASSIGNED
}

export const emptyDraft = (): CollabDraft => ({
  influencerName: "", platform: "YouTube", profileLink: "",
  closingDate: today(), postDate: today(),
  amount: "", currency: "INR", isFree: false,
  postLink: "", assignedTo: UNASSIGNED,
});

export const draftFromCollab = (c: InfluencerCollabRow): CollabDraft => ({
  influencerName: c.influencerName, platform: c.platform, profileLink: c.profileLink,
  closingDate: c.closingDate ?? "", postDate: c.postDate,
  amount: c.amountPaid == null ? "" : String(c.amountPaid), currency: c.currency, isFree: c.isFree,
  postLink: c.postLink ?? "", assignedTo: c.assignedTo ?? UNASSIGNED,
});

export const isDraftComplete = (d: CollabDraft): boolean =>
  !!d.influencerName.trim() && !!d.profileLink.trim() && !!d.postDate;

/** The draft in the shape addInfluencerCollab / updateInfluencerCollab take. */
export function draftToInput(d: CollabDraft) {
  return {
    influencer_name: d.influencerName.trim(),
    profile_link: d.profileLink.trim(),
    platform: d.platform,
    post_date: d.postDate,
    closing_date: d.closingDate || undefined,
    is_free: d.isFree,
    amount_paid: d.isFree ? undefined : (d.amount.trim() || undefined),
    currency: d.currency,
    post_link: d.postLink.trim() || undefined,
    assigned_to: d.assignedTo === UNASSIGNED ? null : d.assignedTo,
  };
}

const LABEL = "mb-1 block text-xs font-medium text-muted-foreground";

export function CollabFormFields({ draft, onChange, members }: {
  draft: CollabDraft;
  onChange: (patch: Partial<CollabDraft>) => void;
  members: Member[];
}) {
  const id = useId();
  const memberItems = [{ value: UNASSIGNED, label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))];
  return (
    <>
      <div>
        <label className={LABEL} htmlFor={`${id}-name`}>Influencer name</label>
        <Input id={`${id}-name`} value={draft.influencerName} onChange={(e) => onChange({ influencerName: e.target.value })} placeholder="Jane Doe" className="h-9" />
      </div>
      <div>
        <label className={LABEL} htmlFor={`${id}-platform`}>Platform</label>
        <Combobox id={`${id}-platform`} items={PLATFORM_ITEMS} value={draft.platform} onValueChange={(v) => onChange({ platform: v as InfluencerPlatform })} placeholder="Pick a platform" />
      </div>
      <div>
        <label className={LABEL} htmlFor={`${id}-profile`}>Profile link</label>
        <Input id={`${id}-profile`} value={draft.profileLink} onChange={(e) => onChange({ profileLink: e.target.value })} placeholder="https://..." className="h-9" />
      </div>
      <div>
        <label className={LABEL} htmlFor={`${id}-closing`}>Date of closing</label>
        <Input id={`${id}-closing`} type="date" value={draft.closingDate} onChange={(e) => onChange({ closingDate: e.target.value })} className="h-9" />
      </div>
      <div>
        <label className={LABEL} htmlFor={`${id}-post-date`}>Post date</label>
        <Input id={`${id}-post-date`} type="date" value={draft.postDate} onChange={(e) => onChange({ postDate: e.target.value })} className="h-9" />
      </div>
      <div>
        <label className={LABEL} htmlFor={`${id}-amount`}>Amount paid (optional)</label>
        <div className="flex items-center gap-1.5">
          <Input
            id={`${id}-amount`}
            type="number"
            min={0}
            step="0.01"
            value={draft.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            placeholder="0.00"
            disabled={draft.isFree}
            className="h-9"
          />
          <Combobox
            items={CURRENCY_ITEMS}
            value={draft.currency}
            onValueChange={(v) => onChange({ currency: v as InfluencerCollabCurrency })}
            disabled={draft.isFree}
            className="h-9 w-24 shrink-0"
          />
        </div>
        <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={draft.isFree} onCheckedChange={(v) => onChange(v ? { isFree: true, amount: "" } : { isFree: false })} />
          This was a free collab
        </label>
      </div>
      <div>
        <label className={LABEL} htmlFor={`${id}-post-link`}>Post link (optional)</label>
        <Input id={`${id}-post-link`} value={draft.postLink} onChange={(e) => onChange({ postLink: e.target.value })} placeholder="https://... (if already live)" className="h-9" />
      </div>
      <div>
        <label className={LABEL} htmlFor={`${id}-assignee`}>Assign to (optional)</label>
        <Combobox id={`${id}-assignee`} items={memberItems} value={draft.assignedTo} onValueChange={(v) => onChange({ assignedTo: v })} placeholder="Unassigned" />
      </div>
    </>
  );
}
