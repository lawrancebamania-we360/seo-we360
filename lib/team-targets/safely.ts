// Team Targets: a server-action call that can't leave a dialog hanging. If the
// request itself fails (offline, a 500), the person gets an error line and the
// Save button comes back, instead of a spinner that never ends.

export async function safely<T extends { ok: boolean; error?: string }>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch {
    return { ok: false, error: "Something went wrong. Check your connection and try again." } as unknown as T;
  }
}
