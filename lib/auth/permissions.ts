import type { MemberPermission, Profile, SectionKey } from "@/lib/types/database";

export const SECTION_LABELS: Record<SectionKey, string> = {
  overview: "Overview & Pillar Scores",
  tasks: "Tasks",
  seo_gaps: "SEO Gaps",
  keywords: "Keywords",
  technical: "Technical / CWV",
  competitors: "Competitors",
  sprint: "Sprint",
  wins: "Wins",
  articles: "Article Writer",
  team: "Team",
  blog_audit: "Blog audit",
};

export const ALL_SECTIONS: SectionKey[] = [
  "overview",
  "tasks",
  "seo_gaps",
  "keywords",
  "technical",
  "competitors",
  "sprint",
  "wins",
  "articles",
  "team",
  "blog_audit",
];

export interface PermissionCheck {
  view: boolean;
  add: boolean;
  edit: boolean;
  complete: boolean;
  delete: boolean;
}

const FULL_ACCESS: PermissionCheck = {
  view: true,
  add: true,
  edit: true,
  complete: true,
  delete: true,
};

const NO_ACCESS: PermissionCheck = {
  view: false,
  add: false,
  edit: false,
  complete: false,
  delete: false,
};

/**
 * Check a section permission for a given profile on a project.
 * Admins/super_admins always get full access.
 * Members use their member_permissions rows.
 */
export function checkPermission(
  profile: Profile,
  section: SectionKey,
  permissions: MemberPermission[]
): PermissionCheck {
  if (profile.role === "super_admin" || profile.role === "admin") {
    return FULL_ACCESS;
  }

  const p = permissions.find((mp) => mp.section === section);
  if (!p) return NO_ACCESS;

  return {
    view: p.can_view,
    add: p.can_add,
    edit: p.can_edit,
    complete: p.can_complete,
    delete: p.can_delete,
  };
}

