// Content pipeline: the planning sheet's "Content type" column is free text
// ("Pillar Page", "Blog", "Guide", "Listicle", "How-to guide", ...). These
// helpers fold it into a small set so the cluster views can filter by Blogs /
// Guides the way the team thinks about them, without forcing the sheet into a
// fixed vocabulary.

export type ContentKind = "blog" | "guide" | "listicle" | "pillar" | "other";

// The kinds a person can explicitly tag an item with ("other" is only an
// inferred fallback, never a choice).
export type TaggableKind = "blog" | "guide" | "listicle" | "pillar";
export const TAGGABLE_KINDS: TaggableKind[] = ["blog", "guide", "listicle", "pillar"];

export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  blog: "Blogs",
  guide: "Guides",
  listicle: "Listicles",
  pillar: "Pillar",
  other: "Other",
};

export function classifyContentType(raw: string | null | undefined): ContentKind {
  const s = (raw ?? "").toLowerCase();
  if (!s.trim()) return "blog"; // an untyped planned post is a blog by default
  if (/guide|how[\s-]?to|playbook/.test(s)) return "guide";
  if (/listicle|list\b|top \d|best \d/.test(s)) return "listicle";
  if (/pillar/.test(s)) return "pillar";
  if (/blog|article|post/.test(s)) return "blog";
  return "other";
}

// The item's place in the write -> upload -> live flow.
//   draft             nothing attached yet
//   ready             writer attached an artifact; waiting to be uploaded
//   published_pending a live URL was recorded but the page isn't in the sitemap yet
//   live              the page is in the latest sitemap snapshot
export type PublishState = "draft" | "ready" | "published_pending" | "live";

export const PUBLISH_STATE_LABEL: Record<PublishState, string> = {
  draft: "No artifact",
  ready: "Ready to publish",
  published_pending: "Published, pending live-check",
  live: "Live",
};
