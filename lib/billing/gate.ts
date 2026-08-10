// Billing was removed from We360 (see 20260424000001_drop_billing_and_orgs.sql).
// This is a permissive, un-metered shim so the imported AI-Visibility actions —
// which were written to meter spend through an org budget gate — compile and run
// unchanged. Every check passes; nothing is recorded. The real spend bound for
// AI Visibility is the engine's built-in caps (per-engine sample counts,
// aioPromptCap, the 38s wall-clock budget) plus manual-only triggering.

export interface OrgGate {
  can(args: { kind: string; feature?: string; estimated_cost_cents?: number; model?: string }): Promise<{ allowed: boolean; reason?: string }>;
  record(args: {
    kind: string;
    feature?: string;
    cost_cents?: number;
    user_id?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  release(): Promise<void>;
}

/** Always returns a permissive gate (never null), so both `if (gate)` metering
 *  branches and `if (!gate) return "no subscription"` bails behave as "allowed,
 *  un-metered". */
export async function gateOrgForProject(_admin: unknown, _projectId: string): Promise<OrgGate | null> {
  return {
    can: async () => ({ allowed: true }),
    record: async () => {},
    release: async () => {},
  };
}
