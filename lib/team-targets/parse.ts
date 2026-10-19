// Team Targets: turning a pasted spreadsheet block into target rows, and
// matching the owner names in it to real team members. Pure functions only,
// so the import preview and the checks in the review screen share one
// definition of "what did that row say".

import type { TargetFrequency } from "@/lib/team-targets/types";

export interface ParsedTargetRow {
  task: string;
  ownerName: string;
  coOwnerName: string;
  target: number;
  frequency: TargetFrequency;
}

export interface SkippedLine {
  line: number;          // 1-based, as the person sees it in their paste
  text: string;
  reason: string;
}

export function parseFrequency(v: string | undefined): TargetFrequency | null {
  const s = (v ?? "").trim().toLowerCase().replace(/^per\s+/, "").replace(/^every\s+/, "");
  if (["daily", "day", "everyday", "each day"].includes(s)) return "daily";
  if (["weekly", "week"].includes(s)) return "weekly";
  if (["monthly", "month"].includes(s)) return "monthly";
  return null;
}

export function parseTargetNumber(v: string | undefined): number | null {
  const s = (v ?? "").replace(/[,\s]/g, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= 1_000_000 ? n : null;
}

const HEADER_MAP: Record<string, "task" | "owner" | "coOwner" | "target" | "frequency"> = {
  "task": "task",
  "owner": "owner",
  "co-owner": "coOwner",
  "co owner": "coOwner",
  "coowner": "coOwner",
  "target": "target",
  "frequency": "frequency",
};

function splitCells(line: string): string[] {
  // Copying from Sheets gives tabs. If a paste lost them (all spaces), fall
  // back to splitting on runs of 2+ spaces so a column can still be recovered.
  return (line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/)).map((c) => c.trim());
}

const DEFAULT_ORDER = ["task", "owner", "coOwner", "target", "frequency"] as const;

export function parseTargetPaste(pasted: string): { rows: ParsedTargetRow[]; skipped: SkippedLine[] } {
  const lines = pasted.replace(/\r\n/g, "\n").split("\n");
  const rows: ParsedTargetRow[] = [];
  const skipped: SkippedLine[] = [];

  // A first line that names the columns is a header; otherwise every line is data
  // in the sheet's usual order (Task, Owner, Co-Owner, Target, Frequency).
  let order: readonly string[] = DEFAULT_ORDER;
  let first = true;

  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const cells = splitCells(raw);
    if (first) {
      first = false;
      const named = cells.map((c) => HEADER_MAP[c.trim().toLowerCase().replace(/\s+/g, " ")]);
      if (named.includes("task") && named.includes("owner")) {
        order = named.map((n) => n ?? "");
        return;
      }
    }

    // Without a header, a row missing the (often blank) Co-Owner cell has 4
    // cells; read it as Task, Owner, Target, Frequency.
    const cols = order === DEFAULT_ORDER && cells.length === 4 ? ["task", "owner", "target", "frequency"] : order;
    const get = (key: string): string => {
      const idx = cols.indexOf(key);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };

    const task = get("task").replace(/\s+/g, " ");
    const ownerName = get("owner");
    const target = parseTargetNumber(get("target"));
    const frequency = parseFrequency(get("frequency"));

    const fail = (reason: string) => skipped.push({ line: i + 1, text: raw.trim().slice(0, 120), reason });
    if (!task) return fail("No task name");
    if (!ownerName) return fail("No owner");
    if (target == null) return fail(`Target "${get("target")}" is not a whole number above zero`);
    if (frequency == null) return fail(`Frequency "${get("frequency")}" is not daily, weekly or monthly`);

    rows.push({ task, ownerName, coOwnerName: get("coOwner"), target, frequency });
  });

  return { rows, skipped };
}

export interface MemberLite { id: string; name: string }

const HONORIFICS = new Set(["sir", "madam", "mam", "ma'am", "mr", "mr.", "ms", "ms.", "mrs", "mrs.", "dr", "dr."]);

function nameTokens(raw: string): string[] {
  return raw.toLowerCase().replace(/\s+/g, " ").trim().split(" ").filter((t) => t && !HONORIFICS.has(t));
}

/**
 * Finds the one team member a pasted name refers to, or null when there is no
 * match or more than one ("Aditya" with two Adityas on the team). Exact full
 * name first, then first name, so "Dinesh sir" finds "Dinesh Neede".
 */
export function matchMember(raw: string, members: MemberLite[]): string | null {
  const tokens = nameTokens(raw);
  if (!tokens.length) return null;
  const full = tokens.join(" ");

  const exact = members.filter((m) => nameTokens(m.name).join(" ") === full);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;

  const byFirst = members.filter((m) => nameTokens(m.name)[0] === tokens[0]);
  return byFirst.length === 1 ? byFirst[0].id : null;
}

/** The key two rows share when they describe the same target: same task for the same owner. */
export function targetKey(task: string, ownerId: string): string {
  return `${task.replace(/\s+/g, " ").trim().toLowerCase()}|${ownerId}`;
}
