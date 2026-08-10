// AI-Visibility gap → task bridge (pure helpers, NO server/client directive so
// both the client modal and the server action can import it).
//
// A "gap action" is any actionable AI-Visibility item that a user can turn into a
// tracked task. Two kinds feed it:
//   • REAL page-diff gaps — from explainCompetitorCitations (why-cited). Each is a
//     measured factor a competitor's cited page has that ours lacks.
//   • INFERRED "likely reasons" — Overview next-steps derived from the visibility
//     signals (mention>citation, etc.), where the app can't point at a page diff.
// The UI labels them honestly ("Real gap" vs "Likely reason") off `real`.
//
// Routing: technical / schema fixes go to Web Tasks; content fixes go to Blog
// Sprint. The created task carries a stable, queryable MARKER so re-opening the
// same gap detects the existing task (open-in-board) instead of duplicating it.

export type GapRoute = "web" | "blog";

export interface GapAction {
  /** Stable factor/step key (author, tldr, getcited, …) — part of the marker. */
  key: string;
  /** Short action headline (also the seed for the task title). */
  label: string;
  /** The concrete fix detail. */
  fix: string;
  /** Which board this fix belongs on. */
  route: GapRoute;
  /** true = measured page-diff gap; false = inferred "likely reason". */
  real: boolean;
  /** Plain-English line: why this is (really / probably) why they get cited. */
  why: string;
  /** Competitor the gap came from (page-diff gaps only). */
  competitor?: string | null;
  /** Primary example page that demonstrates the factor. */
  exampleUrl?: string | null;
}

// technical / schema → web; content (write / expand / rephrase) → blog. Keys not
// listed default to web — the conservative bucket (a single createTask insert,
// and schema/markup is the safer catch-all for an unknown citability factor).
const BLOG_KEYS = new Set([
  "tldr", "definition", "structure", "questions", // why-cited content factors
  "getcited", "refresh-content",                   // Overview next-step keys
]);

export function classifyGapRoute(key: string): GapRoute {
  return BLOG_KEYS.has(key) ? "blog" : "web";
}

export const GAP_BOARD: Record<GapRoute, { label: string; href: string; blurb: string }> = {
  web: { label: "Web Tasks", href: "/dashboard/web-tasks", blurb: "a technical / schema fix" },
  blog: { label: "Blog Sprint", href: "/dashboard/sprint", blurb: "a content piece" },
};

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";

/**
 * A stable, queryable marker embedded in the created task's description so that
 * re-opening the same gap finds the existing task even after its title is edited.
 * Delimited with `~` so no marker is a substring-prefix of another (e.g.
 * `~aivgap-author-acme~` can't be found inside `~aivgap-author-acme-inc~`).
 */
export function gapTaskMarker(key: string, competitor: string | null | undefined): string {
  const parts = ["aivgap", slug(key), competitor ? slug(competitor) : "x"];
  return `~${parts.join("-")}~`;
}

/** The web_task / blog_task kind a route maps to. */
export function gapTaskKind(route: GapRoute): "web_task" | "blog_task" {
  return route === "web" ? "web_task" : "blog_task";
}

/** Deterministic, human-readable task title (the action to take). */
export function gapTaskTitle(gap: Pick<GapAction, "label" | "competitor" | "route">): string {
  const verb = gap.route === "web" ? "Fix" : "Write";
  const base = `${verb}: ${gap.label}`;
  return gap.competitor ? `${base} (cited by ${gap.competitor})` : base;
}

/**
 * The task description (issue for web, data_backing for blog): the fix, the
 * real-gap / likely-reason context, the competitor + example page, and the
 * hidden tracking marker at the end.
 */
export function gapTaskDescription(
  gap: Pick<GapAction, "key" | "fix" | "real" | "why" | "competitor" | "exampleUrl">,
): string {
  const marker = gapTaskMarker(gap.key, gap.competitor);
  const lines: string[] = [];
  lines.push(gap.fix);
  lines.push("");
  lines.push(
    gap.real
      ? "Why it matters (real gap): " + gap.why
      : "Why it matters (likely reason): " + gap.why,
  );
  if (gap.competitor) lines.push(`Surfaced from competitor: ${gap.competitor}`);
  if (gap.exampleUrl) lines.push(`Example page that does this: ${gap.exampleUrl}`);
  lines.push("");
  lines.push(`— tracked from AI Visibility ${marker}`);
  return lines.join("\n");
}
