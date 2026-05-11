// SEO · we360.ai: Supabase database types.
//
// `Database` (the shape consumed by `createClient<Database>`) is auto-generated
// from the live schema and lives in `./supabase.ts`. Regenerate with:
//   npx supabase gen types typescript --project-id <id> > lib/types/supabase.ts
//
// The hand-written interfaces below sit ON TOP of the generated Row types —
// they narrow enum-like text columns (e.g. role: UserRole, priority: Priority)
// that Postgres stores as plain text. App code should prefer these narrowed
// interfaces when passing rows around; low-level from("x").insert/update calls
// get full column-name inference from the generated Database generic.

import type { Database, Json } from "./supabase";
export type { Database, Json };

export type UserRole = "super_admin" | "admin" | "member" | "client";
export type Priority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type Competition = "Low Competition" | "Medium Competition" | "High Competition";
export type Intent = "informational" | "navigational" | "commercial" | "transactional";
export type Trend = "up" | "down" | "stable" | "new";
export type KeywordSource = "apify" | "gkp_upload" | "manual" | "gsc";
export type GapStatus = "ok" | "warn" | "fail" | "missing";
export type ArticleStatus = "draft" | "review" | "approved" | "rejected" | "published";
export type AIProvider = "claude" | "openai" | "manual";
export type Device = "mobile" | "desktop";
export type Pillar = "SEO" | "AEO" | "GEO" | "SXO" | "AIO";
export type SectionKey =
  | "overview"
  | "tasks"
  | "seo_gaps"
  | "keywords"
  | "technical"
  | "competitors"
  | "sprint"
  | "wins"
  | "articles"
  | "team"
  | "blog_audit";

export interface Project {
  id: string;
  name: string;
  domain: string;
  logo_url: string | null;
  ga4_property_id: string | null;
  gsc_property_url: string | null;
  apify_keywords: string[];
  industry: string | null;
  country: string;
  timezone: string;
  is_active: boolean;
  supports_multi_language: boolean;
  target_keywords_seed: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url: string | null;
  active_project_id: string | null;
  encrypted_claude_key: string | null;
  encrypted_openai_key: string | null;
  last_active: string;
  platform_admin?: boolean;                                        // added in Phase 2 billing migration
  preferred_ai_model?: "sonnet" | "opus" | "gpt-4o" | "gpt-4o-mini"; // added in Phase 4 AI picker migration
  created_at: string;
  updated_at: string;
}

export interface ProjectMembership {
  id: string;
  user_id: string;
  project_id: string;
  added_by: string | null;
  created_at: string;
}

export interface MemberPermission {
  id: string;
  user_id: string;
  project_id: string;
  section: SectionKey;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_complete: boolean;
  can_delete: boolean;
  updated_at: string;
}

export type TaskKind = "web_task" | "blog_task";

export interface Task {
  id: string;
  project_id: string;
  title: string;
  url: string | null;
  priority: Priority;
  impact: string | null;
  status: TaskStatus;
  scheduled_date: string | null;
  sprint_status: string | null;
  issue: string | null;
  impl: string | null;
  // 100K plan: GSC/GA4/PSI evidence justifying this task — rendered as a yellow
  // callout pinned to the top of the detail dialog. Mandatory for blog tasks.
  data_backing: string | null;
  // Action × Asset taxonomy. Null for dev/ops tasks (no Page/Post relevance).
  task_type:
    | "New Post" | "New Page"
    | "Update Post" | "Update Page"
    | "Delete Post" | "Delete Page"
    | "Modify Post" | "Modify Page"
    | null;
  // Estimated monthly search volume of the target keyword (null when not applicable)
  est_volume: number | null;
  team_member_id: string | null;
  timeline: string | null;
  done: boolean;
  completed_at: string | null;
  source: "manual" | "cron_audit" | "ai_suggestion";
  pillar: Pillar | null;
  kind: TaskKind;
  verified_by_ai: boolean;
  keyword_id: string | null;
  article_id: string | null;
  intent: Intent | null;
  competition: Competition | null;
  word_count_target: number | null;
  target_keyword: string | null;
  brief: Json | null;
  published_url: string | null;
  supporting_links: string[];
  reference_images: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // AI verification — populated by the verify-pending-articles skill once
  // a task is moved to Done or Published. The latest result is denormalized
  // here for fast UI reads; full history lives in task_verifications.
  ai_verification_status:
    | "queued"
    | "running"
    | "verified"
    | "failed"
    | "doc_missing"
    | null;
  ai_verified_at: string | null;
  ai_score: number | null;
  ai_score_delta: number | null;
  ai_verification_summary: string | null;
  ai_verification_id: string | null;
  // Human reviewer sign-off (e.g. Lokesh checking writers' work).
  // Independent of AI verification — captures who's done the editorial pass.
  reviewed_by_id: string | null;
  reviewed_at: string | null;
}

export type IntegrationProvider =
  | "apify"
  | "ga4"
  | "gsc"
  | "pagespeed"
  | "claude"
  | "openai"
  | "supabase";

export type IntegrationStatus = "connected" | "setup_required" | "error" | "disabled";

export interface Integration {
  id: string;
  project_id: string | null;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  last_checked_at: string | null;
  last_error: string | null;
  config: Json;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SeoGap {
  id: string;
  project_id: string;
  page_url: string;
  title_status: GapStatus | null;
  meta_status: GapStatus | null;
  h1_status: GapStatus | null;
  canonical_status: GapStatus | null;
  og_status: GapStatus | null;
  schema_status: GapStatus | null;
  robots_status: GapStatus | null;
  images_status: GapStatus | null;
  last_checked: string;
  details: Json;
}

export interface Keyword {
  id: string;
  project_id: string;
  keyword: string;
  cluster: string | null;
  search_volume: number | null;
  kd: number | null;
  competition: Competition | null;
  current_rank: number | null;
  previous_rank: number | null;
  target_rank: number | null;
  current_traffic: number | null;
  potential_traffic: number | null;
  intent: Intent | null;
  priority: Priority;
  target_page: string | null;
  trend: Trend;
  source: KeywordSource;
  last_checked: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KeywordUpload {
  id: string;
  project_id: string;
  uploaded_by: string | null;
  filename: string;
  row_count: number;
  imported_count: number;
  skipped_count: number;
  status: "processing" | "completed" | "failed";
  error_message: string | null;
  created_at: string;
}

export interface Article {
  id: string;
  project_id: string;
  keyword_id: string | null;
  title: string;
  target_keyword: string | null;
  secondary_keywords: string[];
  outline: Json;
  content: string | null;
  word_count: number;
  meta_description: string | null;
  slug: string | null;
  status: ArticleStatus;
  rejection_reason: string | null;
  ai_provider: AIProvider | null;
  published_url: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleComment {
  id: string;
  article_id: string;
  user_id: string | null;
  comment: string;
  created_at: string;
}

export interface Competitor {
  id: string;
  project_id: string;
  name: string;
  url: string;
  da: number | null;
  pa: number | null;
  traffic: number | null;
  top_keywords: string[];
  opportunities: string[];
  notes: string | null;
  last_checked: string | null;
  auto_analysis: Json;
  analysis_status: "pending" | "analyzing" | "complete" | "failed" | null;
  last_analyzed_at: string | null;
  created_at: string;
}

export interface CwvSnapshot {
  id: string;
  project_id: string;
  url: string | null;
  device: Device;
  score: number | null;
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
  si: number | null;
  tbt: number | null;
  fcp: number | null;
  captured_at: string;
}

export interface Win {
  id: string;
  project_id: string;
  emoji: string;
  title: string;
  description: string | null;
  metric: string | null;
  category: string | null;
  related_task_id: string | null;
  date: string;
  created_by: string | null;
  created_at: string;
}

export interface PillarScore {
  id: string;
  project_id: string;
  pillar: Pillar;
  score: number;
  breakdown: Json;
  top_issues: string[];
  captured_at: string;
}

// NOTE: The `Database` type is re-exported at the top of this file from the
// generated `./supabase.ts`. Do not hand-maintain it here.
