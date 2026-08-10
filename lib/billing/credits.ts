// Billing removed in We360 — permissive credits shim. The AI-Visibility feature
// runs un-metered, so "credits left" is effectively unlimited. Returned as a
// large finite number so any UI that shows "~N credits left" renders sensibly.

export async function creditsLeftFor(_admin: unknown, _projectId: string): Promise<number> {
  return 9999;
}
