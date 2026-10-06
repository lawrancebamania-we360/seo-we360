// One place that decides how a stored timestamp is shown to a person, so every
// screen reads the same: "Oct 5, 2026" and "12:46 PM". Explicit "en-US" (not the
// runtime default) so server and browser never disagree on the format; the
// time zone is the VIEWER'S own, which is what "when did this check run" should
// mean to them.

const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const CLOCK: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

function valid(iso: string): boolean {
  return !Number.isNaN(Date.parse(iso));
}

/** "Oct 5, 2026" */
export function formatDay(iso: string): string {
  return valid(iso) ? new Date(iso).toLocaleDateString("en-US", DAY) : iso;
}

/** "12:46 PM" */
export function formatClock(iso: string): string {
  return valid(iso) ? new Date(iso).toLocaleTimeString("en-US", CLOCK) : "";
}

/** "Oct 5, 2026, 12:46 PM" */
export function formatDateTime(iso: string): string {
  return valid(iso) ? new Date(iso).toLocaleString("en-US", { ...DAY, ...CLOCK }) : iso;
}
