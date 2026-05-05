// SEO Skills — typed microservice interfaces.
// Each skill is a pure function: given HTML + URL + context, return a list of findings.
// No side effects — the orchestrator writes to DB.

import type { CheerioAPI } from "cheerio";
import type { Pillar, Priority } from "@/lib/types/database";

export type FindingStatus = "ok" | "warn" | "fail" | "missing";

export interface Finding {
  skill: string;
  check: string;
  status: FindingStatus;
  pillar: Pillar;
  priority: Priority;
  message: string;
  impl: string;
  details?: Record<string, unknown>;
}

export interface AuditContext {
  url: string;
  html: string;
  $: CheerioAPI;
  responseHeaders: Record<string, string>;
  statusCode: number;
  fetchMs: number;
  contentBytes: number;
  project: { id: string; name: string; domain: string; industry: string | null };
}

export interface Skill {
  name: string;
  description: string;
  pillars: Pillar[];
  run: (ctx: AuditContext) => Finding[];
}

export type { Pillar } from "@/lib/types/database";

export function finding(f: Finding): Finding {
  return f;
}
