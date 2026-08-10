// Billing removed in We360 — the imported code's cost estimator is un-metered,
// but the estimate itself is a real token-cost calc (used only for display /
// inert gate reservations). Re-export We360's existing estimator so there is one
// source of truth.

export { estimateAiCostCents } from "@/lib/ai/models";
