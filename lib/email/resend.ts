// Transactional email via Resend. Best-effort and self-gating: with no
// RESEND_API_KEY it no-ops, and a send failure is logged and swallowed — callers
// (task assignment, etc.) must never fail because an email didn't go out. Uses
// the REST API directly so there's no SDK dependency.
//
// NOTE: delivery to anyone but your own Resend signup inbox needs a VERIFIED
// domain in Resend and a matching RESEND_FROM (e.g. "We360 <noreply@we360.ai>").

import { env, hasResend } from "@/lib/env";

const DEFAULT_FROM = "We360 <noreply@we360.ai>";

export type SendEmailResult = { ok: boolean; skipped?: boolean; id?: string; error?: string };

export async function sendEmail({ to, subject, html, replyTo }: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  if (!hasResend()) return { ok: false, skipped: true, error: "RESEND_API_KEY not set" };
  const e = env();
  const from = e.RESEND_FROM || DEFAULT_FROM;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, error: `Resend ${res.status}` };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email] send failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

/** Absolute dashboard URL for links in emails; falls back to the prod host. */
export function appUrl(path = ""): string {
  const base = env().NEXT_PUBLIC_APP_URL || "https://seo-we360.vercel.app";
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
