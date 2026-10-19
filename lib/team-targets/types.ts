// Team Targets: shared value types. Kept apart from the server-action and
// data files so client components can import them freely.

export type TargetFrequency = "daily" | "weekly" | "monthly";
export type EntryStatus = "pending" | "verified" | "sent_back";

export const FREQUENCY_LABEL: Record<TargetFrequency, string> = {
  daily: "per day",
  weekly: "per week",
  monthly: "per month",
};

export const STATUS_LABEL: Record<EntryStatus, string> = {
  pending: "Awaiting verification",
  verified: "Verified",
  sent_back: "Sent back",
};
