// Ticket 8: replace the pre-session demo/auto-generated personas with the
// founder's locked list (Founder/CEO/MD economic buyers across the 7 named
// industries + the 5 exact functional personas with their given pain/language).
// Personas are SHARED across both categories (Employee Monitoring / Workforce
// Analytics) - the category system (ticket 5) reframes the QUESTIONS, not the
// persona list itself. Run once via `node scripts/seed-locked-personas.mjs`.

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const LOCKED_PERSONAS = [
  // Economic buyers - Founder/CEO/MD priority (1-3), across the 7 named industries.
  { label: "Founder, IT/software firm", description: "Founder of a 200+ person IT/software services company deciding whether to invest in workforce visibility for delivery accountability and AI-tool ROI." },
  { label: "CEO, BPO operator", description: "CEO of a 300+ seat BPO managing seat and shift utilization across night shifts, under constant margin pressure." },
  { label: "Founder, KPO firm", description: "Founder of a growing 200+ person KPO (research/analytics outsourcing) wanting visibility into analyst output and process efficiency." },
  { label: "MD, marketing agency", description: "MD of a 200+ person marketing agency tracking billable utilization and delivery discipline across client teams." },
  { label: "Founder, US IT recruitment firm", description: "Founder of a 200+ person US IT recruitment firm coordinating recruiters across time zones, wanting productivity visibility." },
  { label: "MD, manpower/recruitment agency", description: "MD of a 200+ consultant staffing and recruitment agency measuring recruiter utilization and placement throughput." },
  // Functional buyers - exact pain/language given, role priority 4-5 plus the 3
  // named functional roles. CHRO's guardrail is stated in plain language since
  // it's read directly by the prompt generator (lib/ai-citation/prompts.ts).
  { label: "CTO, engineering leader", description: "CTO worried about developer capacity, AI coding-tool (Copilot/Cursor) adoption ROI, and sprint predictability - wants engineering-capacity visibility, never framed as developer surveillance." },
  { label: "CIO, digital transformation", description: "CIO struggling to prove AI-adoption and digital-transformation ROI, with SaaS license utilization nobody can see clearly - wants a decision-intelligence layer, not just what IT thinks is happening." },
  { label: "Head of IT, cost control", description: "Head of IT fighting shadow IT and unused licenses bleeding budget - wants hard data on tool adoption rates versus cost per seat to cut waste without guessing." },
  { label: "COO, operations", description: "COO facing margin pressure without headcount visibility - wants to see where capacity is being consumed before it becomes a cost or delivery problem." },
  { label: "CHRO, people analytics", description: "CHRO seeing attrition and burnout signals too late, with engagement data that's unreliable until people already leave - wants early workforce-health pattern visibility. This persona must NEVER be framed around monitoring, surveillance, or tracking - only people-analytics and workforce-health language." },
];

const { data: proj, error: projErr } = await sb.from("projects").select("id, name").eq("is_active", true).limit(1);
if (projErr || !proj?.length) { console.error("could not find active project:", projErr?.message); process.exit(1); }
const projectId = proj[0].id;
console.log(`Project: ${proj[0].name} (${projectId})`);

const { data: existing, error: existingErr } = await sb.from("ai_citation_personas").select("id, label").eq("project_id", projectId).eq("active", true);
if (existingErr) { console.error("could not read existing personas:", existingErr.message); process.exit(1); }
console.log(`Deactivating ${existing?.length ?? 0} existing active personas (pre-session demo/auto-generated content)...`);
if (existing?.length) {
  const { error } = await sb.from("ai_citation_personas").update({ active: false }).eq("project_id", projectId).eq("active", true);
  if (error) { console.error("deactivate failed:", error.message); process.exit(1); }
}

const rows = LOCKED_PERSONAS.map((p, i) => ({
  project_id: projectId,
  label: p.label,
  description: p.description,
  source: "user", // founder-specified, not AI-inferred - never touched by regeneratePersonas
  active: true,
  position: i,
}));
const { error: insertErr } = await sb.from("ai_citation_personas").insert(rows);
if (insertErr) { console.error("insert failed:", insertErr.message); process.exit(1); }
console.log(`Inserted ${rows.length} locked personas.`);
