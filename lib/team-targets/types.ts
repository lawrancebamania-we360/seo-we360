// Team Targets: shared value types and the dashboard DTOs. Kept apart from the
// server-action and data files (which import server-only Supabase) so client
// components can import these freely without dragging server code into the
// browser bundle.

import type { Period, TargetStatus } from "@/lib/team-targets/period";

export type TargetFrequency = "daily" | "weekly" | "monthly";
export type EntryStatus = "pending" | "verified" | "sent_back";
export type LogMode = "link" | "count";

// A logged item's verification state. Verified counts toward "done"; awaiting is
// logged-but-unchecked; everything else is a failed/couldn't-check outcome.
// These live here (not in lib/data) so client components can use the helpers
// without dragging the server-only data module into the browser bundle.
export type LogVerification =
  | "pending" | "ai_verified" | "owner_verified" | "not_found" | "mismatch" | "unreachable" | "failed";

const VERIFIED: LogVerification[] = ["ai_verified", "owner_verified"];
const AWAITING: LogVerification[] = ["pending", "unreachable"];
export const isVerified = (s: LogVerification) => VERIFIED.includes(s);
export const isAwaiting = (s: LogVerification) => AWAITING.includes(s);
export const isFailed = (s: LogVerification) => !isVerified(s) && !isAwaiting(s);

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

// ---- Dashboard DTOs (shape of what lib/data/team-targets returns) ----------

export interface TargetLog {
  id: string;
  logDate: string;
  link: string | null;
  quantity: number;
  note: string | null;
  status: LogVerification;
  reason: string | null;
  kind: "own_site" | "third_party" | "count" | null;
  reportedBy: string | null;
  reportedByName: string | null;
  reportedAt: string;
  verifiedByName: string | null;
  verifiedAt: string | null;
}

export interface DashboardTarget {
  id: string;
  task: string;
  ownerId: string | null;
  ownerName: string | null;
  coOwnerId: string | null;
  coOwnerName: string | null;
  target: number;
  frequency: TargetFrequency;
  logMode: LogMode;
  isVolume: boolean;
  doneVerified: number;
  awaiting: number;
  failed: number;
  expectedPeriod: number;
  expectedToDate: number;
  remaining: number;
  /** done / expectedPeriod, capped at 1; null when nothing is expected this period. */
  completion: number | null;
  /** expectedToDate / expectedPeriod, capped at 1; the pace position. null when none expected. */
  paceCompletion: number | null;
  status: TargetStatus;
  needsAttention: number;
  logs: TargetLog[];
}

export interface PersonRollup {
  personId: string;
  name: string;
  targetCount: number;
  onPace: number;
  doneVerified: number;
  awaiting: number;
  failed: number;
  completion: number;
  paceCompletion: number;
  status: TargetStatus;
}

export interface BurnupPoint { date: string; done: number; ideal: number }

export interface DashboardTotals {
  completion: number;
  paceCompletion: number;
  contentDone: number;
  contentExpected: number;
  contentRemaining: number;
  volumeDone: number;
  volumeExpected: number;
  volumeRemaining: number;
  awaiting: number;
  failed: number;
  behindCount: number;
  needsAttention: number;
  targetCount: number;
}

export interface LoggableTarget { id: string; task: string; ownerName: string | null; logMode: LogMode }

export interface TeamTargetsDashboard {
  ready: boolean;          // false until the migration is applied
  ended: boolean;          // the period has finished (judge against full goal)
  period: Period;
  targets: DashboardTarget[];
  people: PersonRollup[];
  totals: DashboardTotals;
  burnup: BurnupPoint[];
}
